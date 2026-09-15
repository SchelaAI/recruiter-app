import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/server";

/**
 * Calendly webhook — closes the loop for the Calendly booking-link flow.
 *
 * Schela sends a real single-use Calendly link instead of a fixed time (see
 * createInterview in lib/store.ts); this is how Schela finds out what the
 * candidate actually picked. `invitee.created` fires the moment someone
 * books, `invitee.canceled` when they cancel.
 *
 * Verified with the same signed-webhook discipline as the WhatsApp and email
 * webhooks: HMAC signature checked before the payload is trusted at all.
 *
 * Setup: Calendly webhook subscriptions are created automatically right
 * after OAuth connects — see the oauth callback route and
 * lib/integrations/calendly.ts's setUpCalendlyWebhook. CALENDLY_WEBHOOK_SIGNING_KEY
 * still needs to be set — see SETUP.md.
 */

function extractMeetingLink(scheduledEvent: Record<string, unknown> | undefined): string | undefined {
  const location = scheduledEvent?.location as Record<string, unknown> | undefined;
  if (!location) return undefined;
  // Calendly's location shape varies by conferencing type (google_conference,
  // zoom, microsoft_teams, physical, custom...) — try the field names known
  // to carry a real join URL, and give up cleanly rather than guess wrong.
  const candidate = location.join_url ?? location.location ?? location.data;
  return typeof candidate === "string" ? candidate : undefined;
}

export async function POST(req: NextRequest) {
  try {
    const rawBody = await req.text();

    const signingKey = process.env.CALENDLY_WEBHOOK_SIGNING_KEY;
    if (signingKey) {
      const { verifyCalendlyWebhookSignature } = await import("@/lib/integrations/calendly");
      const valid = verifyCalendlyWebhookSignature(rawBody, req.headers.get("Calendly-Webhook-Signature"), signingKey);
      if (!valid) {
        console.warn("[calendly webhook] rejected request with invalid or missing signature");
        return NextResponse.json({ error: "Invalid signature" }, { status: 401 });
      }
    } else {
      console.warn(
        "[calendly webhook] CALENDLY_WEBHOOK_SIGNING_KEY is not set — this endpoint is accepting unsigned requests. " +
          "Set it in your environment (see SETUP.md) so inbound bookings can't be spoofed."
      );
    }

    const body = JSON.parse(rawBody);
    const eventType: string = body?.event;
    const payload = body?.payload ?? {};

    if (eventType !== "invitee.created" && eventType !== "invitee.canceled") {
      return NextResponse.json({ received: true });
    }

    const inviteeEmail: string | undefined = payload?.email?.trim().toLowerCase();
    if (!inviteeEmail) {
      console.warn("[calendly webhook] payload had no invitee email — dropped");
      return NextResponse.json({ received: true });
    }

    const admin = createAdminClient();
    // Indexed lookup on the exact address rather than pulling every candidate
    // in the deployment and filtering in JS — that scan grew linearly with
    // total candidates across ALL orgs and ran on every inbound message.
    const { data: candidates, error } = await admin
      .from("candidates")
      .select("id, org_id, email")
      .ilike("email", `%${inviteeEmail}%`);
    if (error) {
      console.error("[calendly webhook] candidate lookup failed:", error.message);
      return NextResponse.json({ received: true });
    }

    const match = (candidates ?? []).find((c: { email: string | null }) => (c.email ?? "").trim().toLowerCase() === inviteeEmail);
    if (!match) {
      console.warn(
        `[calendly webhook] no candidate matched ${inviteeEmail} — dropped. ` +
          `The candidate's email in Schela must match the address they booked with.`
      );
      return NextResponse.json({ received: true });
    }

    // Most recent interview created via a Calendly booking link for this
    // candidate — that's the one this booking/cancellation belongs to.
    const { data: interview } = await admin
      .from("interviews")
      .select("id")
      .eq("org_id", match.org_id)
      .eq("candidate_id", match.id)
      .eq("format", "Calendly")
      .order("scheduled_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (!interview) {
      console.warn(`[calendly webhook] no Calendly-format interview found for candidate ${match.id} — dropped`);
      return NextResponse.json({ received: true });
    }

    if (eventType === "invitee.canceled") {
      // A genuine cancellation and a reschedule look identical at this event
      // — Calendly implements "reschedule" as cancel-old-booking followed
      // immediately by a new invitee.created for the new time. Without this
      // check, every reschedule would flash the interview to "escalated" for
      // a few seconds before the follow-up webhook corrects it — real
      // notification noise for something that isn't actually a problem.
      const isReschedule = Boolean(payload?.rescheduled);
      if (!isReschedule) {
        await admin.from("interviews").update({ ai_state: "escalated" }).eq("id", interview.id);
        console.log(`[calendly webhook] interview ${interview.id} canceled by candidate — escalated for recruiter review`);
      } else {
        console.log(`[calendly webhook] interview ${interview.id} being rescheduled by candidate — awaiting the new booking`);
      }
      return NextResponse.json({ received: true });
    }

    const scheduledEvent = payload?.scheduled_event as Record<string, unknown> | undefined;
    const startTime = scheduledEvent?.start_time as string | undefined;
    if (!startTime) {
      console.error("[calendly webhook] invitee.created payload had no scheduled_event.start_time:", JSON.stringify(payload).slice(0, 500));
      return NextResponse.json({ received: true });
    }

    // The scheduled_event's own URI — needed later to actually cancel or
    // reschedule this specific booking via Calendly's API, not just Schela's
    // own row. Without capturing this, cancellation/reschedule can update
    // Schela's database but has no way to reach back into Calendly at all.
    const eventUri = scheduledEvent?.uri as string | undefined;

    const meetingLink = extractMeetingLink(scheduledEvent);
    await admin
      .from("interviews")
      .update({
        scheduled_at: startTime,
        ai_state: "calendar_updated",
        ...(meetingLink ? { meeting_link: meetingLink } : {}),
        ...(eventUri ? { calendly_event_uri: eventUri } : {}),
      })
      .eq("id", interview.id);

    console.log(`[calendly webhook] interview ${interview.id} booked for ${startTime} by candidate ${match.id}`);

    // Record it in the conversation thread, same as every other confirmation path.
    const conversationId = `c-${match.id.toLowerCase()}`;
    const when = new Date(startTime);
    const confirmText =
      `Great — you're booked for ${when.toLocaleDateString(undefined, { weekday: "long", month: "long", day: "numeric" })} ` +
      `at ${when.toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" })}.${meetingLink ? `\n\nMeeting Link: ${meetingLink}` : ""}`;
    await admin.from("messages").insert({
      conversation_id: conversationId,
      org_id: match.org_id,
      from_role: "schela",
      text: confirmText,
      channel: "em",
      delivered: true,
      sender_kind: "ai",
      sender_name: "Schela",
    });
    await admin.from("conversations").update({ updated_at: new Date().toISOString() }).eq("id", conversationId).eq("org_id", match.org_id);
  } catch (err) {
    console.error("[calendly webhook] processing error:", err);
    // Always 200 — Calendly retries on non-2xx and a malformed payload would
    // fail identically every retry.
  }

  return NextResponse.json({ received: true });
}
