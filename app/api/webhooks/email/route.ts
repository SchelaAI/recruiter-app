import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/server";
import { receiveInboundMessageForOrg, getResendApiKeyForOrg } from "@/lib/store";

/**
 * Resend inbound email webhook — the email counterpart to the WhatsApp one.
 *
 * Without this, email was a one-way channel that looked two-way in the UI:
 * Schela could send, but a candidate's reply went nowhere.
 *
 * Note on Resend's design: the webhook payload deliberately does NOT include
 * the message body — it carries metadata plus an email_id, and the content is
 * fetched separately via their API. So this handler resolves the candidate
 * first (to know which org's API key to use), then fetches the body.
 *
 * Setup: Resend → Webhooks → add this URL, subscribe to `email.received`.
 * See SETUP.md.
 */

/** Pulls the bare address out of "Name <a@b.com>" or a plain address. */
function extractEmail(raw: string): string | null {
  if (!raw) return null;
  const angle = raw.match(/<([^>]+)>/);
  const candidate = (angle ? angle[1] : raw).trim().toLowerCase();
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(candidate) ? candidate : null;
}

/**
 * Strips quoted history and signatures so the AI classifies what the person
 * actually wrote, not the entire thread appended below it.
 */
function stripQuotedReply(text: string): string {
  const markers = [
    /^\s*On .+ wrote:\s*$/m,           // Gmail / Apple Mail
    /^\s*-{2,}\s*Original Message\s*-{2,}\s*$/im,
    /^\s*_{5,}\s*$/m,                  // Outlook divider
    /^\s*From:\s.+$/m,                 // forwarded header block
    /^\s*--\s*$/m,                     // signature delimiter
  ];
  let cut = text.length;
  for (const re of markers) {
    const m = text.match(re);
    if (m?.index !== undefined && m.index < cut) cut = m.index;
  }
  return text
    .slice(0, cut)
    .split("\n")
    .filter((line) => !line.trimStart().startsWith(">"))
    .join("\n")
    .trim();
}

export async function POST(req: NextRequest) {
  try {
    // Raw text first — signature verification is computed over the exact
    // bytes Resend sent, not a re-serialized version of the parsed JSON.
    const rawBody = await req.text();

    const secret = process.env.RESEND_WEBHOOK_SECRET;
    if (secret) {
      const { verifyResendWebhookSignature } = await import("@/lib/integrations/resend");
      const valid = verifyResendWebhookSignature(rawBody, {
        id: req.headers.get("svix-id"),
        timestamp: req.headers.get("svix-timestamp"),
        signature: req.headers.get("svix-signature"),
      }, secret);
      if (!valid) {
        console.warn("[email webhook] rejected request with invalid or missing signature");
        return NextResponse.json({ error: "Invalid signature" }, { status: 401 });
      }
    } else {
      console.warn(
        "[email webhook] RESEND_WEBHOOK_SECRET is not set — this endpoint is accepting unsigned requests. " +
          "Set it in your environment (see SETUP.md) so inbound email can't be spoofed."
      );
    }

    const body = JSON.parse(rawBody);

    // Resend sends several event types to one endpoint; only inbound mail matters here.
    if (body?.type !== "email.received") {
      return NextResponse.json({ received: true });
    }
    console.log(`[email webhook] email.received from=${body?.data?.from} subject="${body?.data?.subject}"`);

    const data = body.data ?? {};
    const fromEmail = extractEmail(data.from ?? "");
    const emailId: string | undefined = data.email_id;
    // The RFC Message-ID header value — distinct from email_id (Resend's own
    // internal UUID). This is what has to be stored and referenced in
    // In-Reply-To/References for Schela's reply to land in the same thread.
    const inboundMessageId: string | undefined = data.message_id;

    if (!fromEmail) {
      console.warn("[email webhook] could not parse sender from:", data.from);
      return NextResponse.json({ received: true });
    }

    const admin = createAdminClient();
    // Narrow in SQL, then verify exactly in JS. The wildcards matter: a
    // candidate email saved with stray whitespace (" malshan@gmail.com" from
    // a paste) would NOT match a bare exact ilike, silently dropping their
    // reply. The .find() below still does an exact trimmed comparison, so
    // the wildcards only widen the candidate set — they can't cause a false
    // match on a different address.
    const { data: candidates, error } = await admin
      .from("candidates")
      .select("id, org_id, email")
      .ilike("email", `%${fromEmail}%`);
    if (error) {
      console.error("[email webhook] candidate lookup failed:", error.message);
      return NextResponse.json({ received: true });
    }

    // Match the sender against a candidate. Every org replies to the SAME
    // shared inbound address, so the sender's own address — not the address
    // they wrote to — is what identifies who this is and which org they
    // belong to. Comparison is case-insensitive and ignores any display name.
    const match = (candidates ?? []).find(
      (c: { email: string | null }) => (c.email ?? "").trim().toLowerCase() === fromEmail
    );

    if (!match) {
      console.warn(
        `[email webhook] no candidate matched ${fromEmail} — message dropped. ` +
          `Known candidate emails: ${(candidates ?? []).map((c: { email: string | null }) => c.email).filter(Boolean).join(", ") || "(none)"}. ` +
          `The candidate's email in Schela must match the address they replied from.`
      );
      return NextResponse.json({ received: true });
    }

    // Prefer an inline body when Resend provides one — some inbound payloads
    // carry text/html directly, and fetching is only needed when they don't.
    let text: string = (typeof data.text === "string" && data.text.trim())
      ? data.text
      : (typeof data.html === "string" && data.html.trim())
        ? (await import("@/lib/integrations/resend")).htmlToText(data.html)
        : "";

    if (text) console.log(`[email webhook] using inline body from payload (${text.length} chars)`);

    if (!text && emailId) {
      // Fall back to the deployment-wide key: inbound mail arrives at one
      // shared address, so the org that owns the candidate may not have
      // connected its own Resend account at all.
      const apiKey = (await getResendApiKeyForOrg(match.org_id)) ?? process.env.RESEND_API_KEY ?? null;
      if (apiKey) {
        const { fetchInboundEmail, htmlToText } = await import("@/lib/integrations/resend");
        const full = await fetchInboundEmail(apiKey, emailId);
        if (full.ok) text = full.text?.trim() || (full.html ? htmlToText(full.html) : "");
        else console.error(`[email webhook] couldn't fetch body for ${emailId}:`, full.error);
      } else {
        console.error("[email webhook] no Resend API key available — set RESEND_API_KEY");
      }
    } else {
      console.warn("[email webhook] payload had no email_id; falling back to subject only");
    }

    // Fall back to the subject so a reply is never silently lost, even if the
    // body fetch failed for any reason.
    const cleaned = stripQuotedReply(text) || (data.subject ?? "").trim();
    if (!cleaned) {
      console.log(`[email webhook] empty message from ${fromEmail} — ignoring`);
      return NextResponse.json({ received: true });
    }

    console.log(`[email webhook] inbound from ${fromEmail} -> candidate ${match.id} (org ${match.org_id}), body ${cleaned.length} chars`);
    try {
      await receiveInboundMessageForOrg(match.org_id, match.id, cleaned, "em", inboundMessageId);
      console.log(`[email webhook] stored reply from ${fromEmail} successfully`);
    } catch (err) {
      // This is the step that actually writes the message into the thread.
      // Letting it fall to the outer catch made a storage failure look
      // identical to a clean success from Resend's side.
      console.error(`[email webhook] FAILED to store reply from ${fromEmail}:`, err instanceof Error ? err.message : err);
      throw err;
    }
  } catch (err) {
    console.error("[email webhook] processing error:", err);
    // Always 200 — Resend retries on non-2xx and a malformed payload would
    // fail identically every retry.
  }

  return NextResponse.json({ received: true });
}
