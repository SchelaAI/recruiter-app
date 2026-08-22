import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/server";
import { receiveInboundMessageForOrg, receiveInboundAttachment, getWhatsAppCredentialsForOrg } from "@/lib/store";

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

    for (const entry of entries) {
      for (const change of entry?.changes ?? []) {
        const value = change?.value ?? {};

        // Delivery/read receipts arrive here constantly and are not inbound
        // messages — acknowledge quietly so they don't look like failures.
        if (value.statuses?.length && !value.messages?.length) continue;

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
    } else if (textMessageCount === 0) {
      console.log("[whatsapp webhook] payload contained no inbound text messages (likely a status update)");
    }
  } catch (err) {
    console.error("[whatsapp webhook] processing error:", err);
    // Still return 200 — Meta retries aggressively on non-2xx and a bad
    // payload will just fail the same way every retry, no point in that.
  }

  return NextResponse.json({ received: true });
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
  const creds = await getWhatsAppCredentialsForOrg(match.org_id);
  const media = await downloadWhatsAppMedia(mediaId, creds ?? undefined);
  if (!media.ok || !media.bytes) {
    console.error(`[whatsapp webhook] media download failed for ${mediaId}:`, media.error);
    return;
  }

  console.log(`[whatsapp webhook] inbound media ${mediaId} (${media.mime ?? mime}) -> candidate ${match.id}`);
  await receiveInboundAttachment(
    match.org_id, match.id, media.bytes, filename, media.mime ?? mime, caption, "wa"
  );
}
