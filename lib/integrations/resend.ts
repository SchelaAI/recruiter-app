import "server-only";
import { createHmac, timingSafeEqual } from "crypto";

const RESEND_API = "https://api.resend.com";

/**
 * Sends a real email via Resend's API.
 *
 * Resend replaces SendGrid as the email provider: same shape (an API key,
 * no OAuth), but with first-class inbound support, which is what makes a
 * candidate's email REPLY actually reach Schela.
 */
export async function sendEmail(params: {
  apiKey: string;
  to: string;
  from: string;
  fromName?: string;
  replyTo?: string;
  subject: string;
  text: string;
  /** Optional file to attach, already read into memory. */
  attachment?: { base64: string; filename: string; mime: string };
}): Promise<{ ok: boolean; error?: string; id?: string }> {
  const { apiKey, to, from, fromName, replyTo, subject, text, attachment } = params;

  // Resend expects "Name <address@domain>" for a display name.
  const fromField = fromName ? `${fromName} <${from}>` : from;

  try {
    const res = await fetch(`${RESEND_API}/emails`, {
      method: "POST",
      headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        from: fromField,
        to: [to],
        reply_to: replyTo || undefined,
        subject,
        text,
        attachments: attachment
          ? [{ content: attachment.base64, filename: attachment.filename, content_type: attachment.mime }]
          : undefined,
      }),
    });

    const json = await res.json().catch(() => ({}));
    if (!res.ok) {
      const message = json?.message ?? json?.error?.message ?? `HTTP ${res.status}`;
      console.error("[resend send] API error:", JSON.stringify(json));
      return { ok: false, error: message };
    }
    return { ok: true, id: json?.id };
  } catch (err) {
    console.error("[resend send] network error:", err);
    return { ok: false, error: err instanceof Error ? err.message : "Unknown error" };
  }
}

/**
 * Validates a Resend API key by listing domains — a real credential check
 * used by the Integrations connect flow, not just "is the field non-empty."
 */
export async function verifyResendApiKey(apiKey: string): Promise<{ ok: boolean; account?: string; error?: string }> {
  try {
    const res = await fetch(`${RESEND_API}/domains`, {
      headers: { Authorization: `Bearer ${apiKey}` },
    });
    const json = await res.json().catch(() => ({}));
    if (!res.ok) {
      return { ok: false, error: json?.message ?? `Resend rejected this key (HTTP ${res.status})` };
    }
    const domains: { name?: string }[] = json?.data ?? [];
    const label = domains.length > 0
      ? `Resend (${domains.map((d) => d.name).filter(Boolean).join(", ")})`
      : "Resend account (no verified domain yet)";
    return { ok: true, account: label };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : "Couldn't reach Resend's API" };
  }
}

/**
 * Fetches the body of a received email.
 *
 * Resend's inbound webhook deliberately omits the message body — it sends
 * metadata plus an email_id, and the content is retrieved separately. Without
 * this call the webhook would only know that *an* email arrived, not what it
 * said.
 */
export async function fetchInboundEmail(
  apiKey: string,
  emailId: string
): Promise<{ ok: boolean; text?: string; html?: string; subject?: string; from?: string; error?: string }> {
  try {
    const res = await fetch(`${RESEND_API}/emails/${emailId}`, {
      headers: { Authorization: `Bearer ${apiKey}` },
    });
    const json = await res.json().catch(() => ({}));
    if (!res.ok) {
      return { ok: false, error: json?.message ?? `Couldn't fetch email ${emailId} (HTTP ${res.status})` };
    }
    return { ok: true, text: json?.text, html: json?.html, subject: json?.subject, from: json?.from };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : "Unknown error" };
  }
}

/** Crude HTML→text fallback for emails that arrive without a plain-text part. */
export function htmlToText(html: string): string {
  return html
    .replace(/<style[\s\S]*?<\/style>/gi, "")
    .replace(/<script[\s\S]*?<\/script>/gi, "")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/(p|div|tr|h[1-6])>/gi, "\n")
    .replace(/<[^>]+>/g, "")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

/**
 * Verifies a Resend webhook request came from Resend and hasn't been
 * tampered with, using the Standard Webhooks / Svix signing scheme Resend
 * follows. Without this, the inbound email endpoint accepts ANY POST — an
 * attacker who finds the URL could forge a fake candidate reply and trigger
 * the AI pipeline (including its scheduling/withdrawal tool calls) as if it
 * came from a real message.
 *
 * Implemented by hand with Node's built-in crypto rather than pulling in the
 * `svix` package — the scheme is a straightforward HMAC-SHA256 and this
 * avoids an extra dependency for three lines of actual crypto.
 */
export function verifyResendWebhookSignature(
  rawBody: string,
  headers: { id: string | null; timestamp: string | null; signature: string | null },
  secret: string
): boolean {
  const { id, timestamp, signature } = headers;
  if (!id || !timestamp || !signature) return false;

  // Reject stale requests — a valid signature only proves the payload was
  // signed by Resend, not when. Without a freshness check, an intercepted
  // webhook could be replayed later to re-trigger the same action.
  const ts = Number(timestamp);
  if (!Number.isFinite(ts) || Math.abs(Date.now() / 1000 - ts) > 5 * 60) return false;

  // Secret format is "whsec_<base64>"; only the part after the prefix is the actual key.
  const secretBytes = Buffer.from(secret.replace(/^whsec_/, ""), "base64");
  const signedContent = `${id}.${timestamp}.${rawBody}`;
  const expected = createHmac("sha256", secretBytes).update(signedContent).digest("base64");

  // svix-signature is a space-delimited list of "v1,<base64>" entries — any
  // match is valid (covers in-progress secret rotation on Resend's side).
  return signature
    .split(" ")
    .map((s) => s.split(",")[1])
    .filter(Boolean)
    .some((candidate) => {
      const a = Buffer.from(candidate);
      const b = Buffer.from(expected);
      return a.length === b.length && timingSafeEqual(a, b);
    });
}
