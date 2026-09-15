import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/server";
import { receiveInboundMessageForOrg, receiveInboundAttachment } from "@/lib/store";
import { sendWhatsAppTemplate, OUTSIDE_WINDOW_ERROR_CODES } from "@/lib/integrations/whatsapp";

/**
 * Meta calls this with a GET request once, when you register the webhook
 * URL in the Meta App dashboard, to prove you control this endpoint.
 * Must echo back hub.challenge as plain text if hub.verify_token matches
 * WHATSAPP_WEBHOOK_VERIFY_TOKEN (a value you choose yourself and enter in
 * both places — see SETUP.md).
 */
export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const mode = searchParams.get("hub.mode");
  const token = searchParams.get("hub.verify_token");
  const challenge = searchParams.get("hub.challenge");

  if (mode === "subscribe" && token === process.env.WHATSAPP_WEBHOOK_VERIFY_TOKEN) {
    return new NextResponse(challenge, { status: 200 });
  }
  return new NextResponse("Forbidden", { status: 403 });
}

/**
 * Real inbound WhatsApp messages land here. Meta's payload nests messages
 * under entry[].changes[].value.messages[], keyed by the recipient phone
 * number (the WhatsApp Business number), with each message carrying the
 * sender's phone number in `from`.
 *
 * We match `from` against candidates.phone (+ country_code) to figure out
 * which org/candidate this belongs to — WhatsApp webhooks are one shared
 * endpoint across every org's Business number in a multi-tenant setup,
 * there's no org_id in the payload itself.
 */
export async function POST(req: NextRequest) {
  const body = await req.json();

  try {
    const entries = body?.entry ?? [];
    let textMessageCount = 0;
    let statusCount = 0;

    for (const entry of entries) {
      for (const change of entry?.changes ?? []) {
        const value = change?.value ?? {};

        // Delivery/read/failure callbacks. Meta's send API is asynchronous:
        // the synchronous response only means "accepted into Meta's queue" —
        // actual delivery (or failure: wrong number, not on WhatsApp,
        // blocked, etc.) is reported HERE, separately, referencing the
        // message by its WhatsApp message ID. Previously these were
        // discarded outright, which is why a message could show "delivered"
        // in Schela forever even if it silently failed on Meta's side.
        for (const status of value.statuses ?? []) {
          statusCount++;
          await processDeliveryStatus(status);
        }

        const messages = value.messages ?? [];
        for (const msg of messages) {
          const fromPhone: string = msg.from; // e.g. "919800011223", no "+"
          if (!fromPhone) continue;

          // Media messages (image / document / audio / video / voice note):
          // resolve the media ID to bytes and store it as a real attachment
          // rather than discarding it, which is what used to happen.
          const mediaNode = msg.image ?? msg.document ?? msg.audio ?? msg.video ?? msg.voice ?? null;
          if (mediaNode?.id) {
            textMessageCount++;
            await routeInboundWhatsAppMedia(
              fromPhone,
              mediaNode.id,
              mediaNode.filename ?? `${msg.type}-${mediaNode.id}`,
              mediaNode.mime_type ?? "application/octet-stream",
              mediaNode.caption ?? ""
            );
            continue;
          }

          if (msg.type !== "text") {
            console.log(`[whatsapp webhook] ignoring unsupported message type "${msg.type}" from ${fromPhone}`);
            continue;
          }

          const text: string = msg.text?.body ?? "";
          if (!text) continue;

          textMessageCount++;
          await routeInboundWhatsApp(fromPhone, text);
        }
      }
    }

    if (entries.length === 0) {
      console.warn("[whatsapp webhook] received a payload with no entries:", JSON.stringify(body).slice(0, 500));
    } else if (textMessageCount === 0 && statusCount === 0) {
      console.log("[whatsapp webhook] payload contained no inbound messages or status updates");
    }
  } catch (err) {
    console.error("[whatsapp webhook] processing error:", err);
    // Still return 200 — Meta retries aggressively on non-2xx and a bad
    // payload will just fail the same way every retry, no point in that.
  }

  return NextResponse.json({ received: true });
}

/**
 * Handles one delivery-status callback. Finds the message Schela sent by its
 * stored WhatsApp message ID and updates its REAL delivery state — most
 * importantly, catching a "failed" status that arrives after the initial
 * send already looked successful, and recording Meta's actual reason
 * (invalid number, not on WhatsApp, blocked, etc.) instead of leaving the
 * message showing a false "delivered".
 */
async function processDeliveryStatus(status: {
  id?: string;
  status?: string;
  errors?: { code?: number; title?: string; message?: string }[];
}) {
  const wamid = status?.id;
  const state = status?.status;
  if (!wamid || !state) return;

  const admin = createAdminClient();
  const { data: message, error } = await admin
    .from("messages")
    .select("id, delivered, text, conversation_id, org_id")
    .eq("whatsapp_message_id", wamid)
    .maybeSingle();

  if (error) {
    console.error(`[whatsapp webhook] status lookup failed for ${wamid}:`, error.message);
    return;
  }
  if (!message) {
    // Expected for anything sent before this tracking existed, or sent by a
    // tool other than Schela on the same number — not an error.
    return;
  }

  if (state === "failed") {
    const failure = status.errors?.[0];
    const reason = failure ? `${failure.title ?? "Delivery failed"}${failure.message ? `: ${failure.message}` : ""}` : "Delivery failed";
    const wasThoughtDelivered = message.delivered;
    await admin.from("messages").update({ delivered: false, delivery_error: reason }).eq("id", message.id);
    console.warn(`[whatsapp webhook] message ${message.id} (${wamid}) FAILED: ${reason}`);

    // The window-violation case is special: Meta can accept a message
    // SYNCHRONOUSLY (200 OK, this wamid issued) and only report the real
    // 24-hour-window failure LATER, via this status callback — after the
    // synchronous template-fallback check already passed and moved on. That
    // means the fallback logic elsewhere in the app never got a chance to
    // fire for this specific send. Only retry once: wasThoughtDelivered
    // being true means this is the first time we're learning it actually
    // failed, not a duplicate status callback for an already-known failure.
    const isWindowError = failure?.code != null && OUTSIDE_WINDOW_ERROR_CODES.includes(failure.code);
    if (isWindowError && wasThoughtDelivered) {
      await retryWithTemplate(message);
    }
  } else if (state === "delivered" || state === "read") {
    // Confirms what was previously only an optimistic assumption from the
    // synchronous send response.
    if (!message.delivered) {
      await admin.from("messages").update({ delivered: true, delivery_error: null }).eq("id", message.id);
    }
    console.log(`[whatsapp webhook] message ${message.id} (${wamid}) confirmed ${state}`);
  }
}

/**
 * Retries a message that Meta accepted synchronously but later rejected
 * asynchronously for being outside the 24-hour window — by sending it again
 * as an approved template, the same fallback every OTHER WhatsApp send path
 * in the app already does synchronously. Inserts a fresh message rather than
 * mutating the failed one, since the original wamid is dead and a new send
 * needs its own.
 */
async function retryWithTemplate(message: { id: number; text: string; conversation_id: string; org_id: string }) {
  const admin = createAdminClient();

  const { data: conv } = await admin
    .from("conversations").select("candidate_id, channel").eq("id", message.conversation_id).eq("org_id", message.org_id).single();
  if (!conv) return;

  const { data: candidate } = await admin
    .from("candidates").select("name, phone, country_code").eq("id", conv.candidate_id).eq("org_id", message.org_id).single();
  if (!candidate) return;

  const { data: org } = await admin
    .from("organizations").select("wa_template_name, wa_template_language").eq("id", message.org_id).single();

  if (!org?.wa_template_name) {
    console.warn(`[whatsapp webhook] message ${message.id} failed outside the 24h window and no template is configured for org ${message.org_id} — candidate was not re-contacted. Set one in Settings → Company.`);
    return;
  }

  const firstName = candidate.name.split(" ")[0];
  const result = await sendWhatsAppTemplate(
    `${candidate.country_code ?? ""}${candidate.phone}`,
    org.wa_template_name,
    org.wa_template_language ?? "en_US",
    [{ type: "body", parameters: [{ type: "text", text: firstName }, { type: "text", text: "your interview" }] }]
  );

  await admin.from("messages").insert({
    conversation_id: message.conversation_id,
    org_id: message.org_id,
    from_role: "schela",
    text: message.text,
    channel: conv.channel,
    delivered: result.ok,
    delivery_error: result.ok ? null : result.error,
    whatsapp_message_id: result.messageId ?? null,
    sender_kind: "ai",
    sender_name: "Schela",
  });
  await admin.from("conversations").update({ updated_at: new Date().toISOString() })
    .eq("id", message.conversation_id).eq("org_id", message.org_id);

  console.log(`[whatsapp webhook] message ${message.id} retried via template for org ${message.org_id} (success: ${result.ok})`);
}

/**
 * Builds every plausible digit-only form of a stored candidate number so an
 * inbound Meta `from` value can be matched regardless of how the recruiter
 * typed it.
 *
 * This exists because the previous implementation compared only the last 10
 * digits of `phone`, ignoring `country_code` entirely. That silently assumed
 * 10-digit local numbers (true for India, where it was written) and NEVER
 * matched countries with different local lengths — e.g. Sri Lanka's 9-digit
 * numbers, usually stored with a trunk "0":
 *   stored "+94" + "0771234567" -> last10 "0771234567"
 *   Meta sends "94771234567"    -> last10 "4771234567"   (no match, dropped)
 */
function phoneVariants(countryCode: string | null, phone: string): string[] {
  const cc = (countryCode ?? "").replace(/\D/g, "");
  const local = (phone ?? "").replace(/\D/g, "");
  if (!local) return [];

  // Many countries write local numbers with a national trunk prefix "0" that
  // is dropped in international format ("077..." -> "+94 77...").
  const localNoTrunk = local.replace(/^0+/, "");

  const variants = new Set<string>([local, localNoTrunk]);
  if (cc) {
    variants.add(cc + local);
    variants.add(cc + localNoTrunk);
    // Handles the case where the recruiter already included the country code
    // inside the phone field, so we don't end up double-prefixing it.
    if (local.startsWith(cc)) {
      const withoutCc = local.slice(cc.length);
      variants.add(withoutCc);
      variants.add(withoutCc.replace(/^0+/, ""));
    }
  }
  return [...variants].filter((v) => v.length >= 6);
}

/** True when an inbound Meta `from` number and a stored candidate number refer to the same subscriber. */
function phoneMatches(fromDigits: string, countryCode: string | null, phone: string): boolean {
  for (const variant of phoneVariants(countryCode, phone)) {
    if (fromDigits === variant) return true;
    // Suffix comparison in both directions covers a missing country code on
    // either side. 8+ digits keeps this from matching on short coincidences.
    const shared = Math.min(fromDigits.length, variant.length);
    if (shared >= 8 && fromDigits.slice(-shared) === variant.slice(-shared)) return true;
  }
  return false;
}

async function routeInboundWhatsApp(fromPhone: string, text: string) {
  const admin = createAdminClient();
  const fromDigits = fromPhone.replace(/\D/g, "");

  // Deliberately a scan, unlike the email/Calendly webhooks which do an
  // indexed exact-match lookup. Stored phone numbers vary in format (spaces,
  // dashes, trunk zeros, country code included or not), so phoneMatches()
  // normalizes both sides before comparing. A SQL LIKE prefilter would run
  // against the RAW stored string and silently miss "98000 11223" vs
  // "9800011223" — exactly the format bug fixed earlier for Sri Lankan
  // numbers. Correctness wins here; the candidates table is small.
  const { data: candidates, error } = await admin
    .from("candidates")
    .select("id, org_id, phone, country_code");

  if (error) {
    // Almost always a missing/incorrect SUPABASE_SERVICE_ROLE_KEY in this
    // environment — log it loudly rather than looking like "no match".
    console.error("[whatsapp webhook] candidate lookup failed:", error.message);
    return;
  }

  const match = (candidates ?? []).find((c: { phone: string; country_code: string | null }) =>
    phoneMatches(fromDigits, c.country_code, c.phone)
  );

  if (!match) {
    console.warn(
      `[whatsapp webhook] no candidate matched inbound ${fromDigits}. ` +
        `Known candidate numbers: ${(candidates ?? []).map((c: { country_code: string | null; phone: string }) => `${c.country_code ?? ""}${c.phone}`).join(", ") || "(none)"}. ` +
        `Message dropped — check the candidate's phone/country code matches the number that sent this.`
    );
    return;
  }

  console.log(`[whatsapp webhook] inbound ${fromDigits} -> candidate ${match.id} (org ${match.org_id})`);
  await receiveInboundMessageForOrg(match.org_id, match.id, text, "wa");
}

/** Resolves a candidate for an inbound media message, downloads it, and stores it as an attachment. */
async function routeInboundWhatsAppMedia(
  fromPhone: string,
  mediaId: string,
  filename: string,
  mime: string,
  caption: string
) {
  const admin = createAdminClient();
  const fromDigits = fromPhone.replace(/\D/g, "");

  const { data: candidates, error } = await admin
    .from("candidates")
    .select("id, org_id, phone, country_code");
  if (error) {
    console.error("[whatsapp webhook] candidate lookup failed:", error.message);
    return;
  }

  const match = (candidates ?? []).find((c: { phone: string; country_code: string | null }) =>
    phoneMatches(fromDigits, c.country_code, c.phone)
  );
  if (!match) {
    console.warn(`[whatsapp webhook] no candidate matched inbound media from ${fromDigits} — dropped`);
    return;
  }

  const { downloadWhatsAppMedia } = await import("@/lib/integrations/whatsapp");
  const media = await downloadWhatsAppMedia(mediaId);
  if (!media.ok || !media.bytes) {
    console.error(`[whatsapp webhook] media download failed for ${mediaId}:`, media.error);
    return;
  }

  console.log(`[whatsapp webhook] inbound media ${mediaId} (${media.mime ?? mime}) -> candidate ${match.id}`);
  await receiveInboundAttachment(
    match.org_id, match.id, media.bytes, filename, media.mime ?? mime, caption, "wa"
  );
}
