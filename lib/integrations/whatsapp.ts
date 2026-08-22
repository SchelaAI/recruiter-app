import "server-only";

const GRAPH_VERSION = "v21.0";

export interface WhatsAppCredentials {
  phoneNumberId: string;
  accessToken: string;
}

/**
 * Sends a real WhatsApp message via Meta's WhatsApp Business Cloud API.
 * Prefers org-supplied credentials (connected via Settings → Integrations →
 * WhatsApp, stored per-org in the database), falling back to the server-wide
 * WHATSAPP_PHONE_NUMBER_ID / WHATSAPP_ACCESS_TOKEN env vars if the org hasn't
 * connected its own — see SETUP.md.
 *
 * `to` must be a phone number in international format without a leading
 * "+" (e.g. "919800011223"), matching what Meta's API expects and what
 * arrives in the inbound webhook payload's `from` field.
 */
export async function sendWhatsAppMessage(
  to: string,
  text: string,
  credentials?: WhatsAppCredentials
): Promise<{ ok: boolean; error?: string; messageId?: string }> {
  const phoneNumberId = credentials?.phoneNumberId ?? process.env.WHATSAPP_PHONE_NUMBER_ID;
  const accessToken = credentials?.accessToken ?? process.env.WHATSAPP_ACCESS_TOKEN;

  if (!phoneNumberId || !accessToken) {
    return { ok: false, error: "WhatsApp not configured — connect it in Settings → Integrations" };
  }

  const cleanTo = to.replace(/[^\d]/g, "");

  try {
    const res = await fetch(`https://graph.facebook.com/${GRAPH_VERSION}/${phoneNumberId}/messages`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        messaging_product: "whatsapp",
        to: cleanTo,
        type: "text",
        text: { body: text },
      }),
    });

    const json = await res.json();

    if (!res.ok) {
      console.error("[whatsapp send] Meta API error:", JSON.stringify(json));
      return { ok: false, error: json?.error?.message ?? `HTTP ${res.status}` };
    }

    return { ok: true, messageId: json?.messages?.[0]?.id };
  } catch (err) {
    console.error("[whatsapp send] network error:", err);
    return { ok: false, error: err instanceof Error ? err.message : "Unknown error" };
  }
}

export function isWhatsAppConfigured(): boolean {
  return Boolean(process.env.WHATSAPP_PHONE_NUMBER_ID && process.env.WHATSAPP_ACCESS_TOKEN);
}

/**
 * Validates a WhatsApp phone-number ID + access token by asking Meta's Graph
 * API for that number's own details — a lightweight, real credential check
 * (not just "did the fields get filled in") used by the Integrations connect
 * flow. Returns the number so the UI can show what got connected.
 */
export async function verifyWhatsAppCredentials(
  credentials: WhatsAppCredentials
): Promise<{ ok: boolean; displayNumber?: string; error?: string }> {
  try {
    const res = await fetch(
      `https://graph.facebook.com/${GRAPH_VERSION}/${credentials.phoneNumberId}?fields=display_phone_number,verified_name`,
      { headers: { Authorization: `Bearer ${credentials.accessToken}` } }
    );
    const json = await res.json();
    if (!res.ok) {
      return { ok: false, error: json?.error?.message ?? `Meta rejected these credentials (HTTP ${res.status})` };
    }
    return { ok: true, displayNumber: json?.display_phone_number ?? json?.verified_name ?? credentials.phoneNumberId };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : "Couldn't reach Meta's API" };
  }
}

/** Maps a MIME type to the message type Meta's API expects. */
export function whatsAppMediaKind(mime: string): "image" | "video" | "audio" | "document" {
  if (mime.startsWith("image/")) return "image";
  if (mime.startsWith("video/")) return "video";
  if (mime.startsWith("audio/")) return "audio";
  return "document";
}

/**
 * Sends a media message (image/document/etc) by public URL. Meta fetches the
 * file from that URL server-side, which is why the attachments bucket has to
 * be publicly readable.
 */
export async function sendWhatsAppMedia(
  to: string,
  mediaUrl: string,
  mime: string,
  filename?: string,
  caption?: string,
  credentials?: WhatsAppCredentials
): Promise<{ ok: boolean; error?: string; messageId?: string }> {
  const phoneNumberId = credentials?.phoneNumberId ?? process.env.WHATSAPP_PHONE_NUMBER_ID;
  const accessToken = credentials?.accessToken ?? process.env.WHATSAPP_ACCESS_TOKEN;
  if (!phoneNumberId || !accessToken) {
    return { ok: false, error: "WhatsApp not configured — connect it in Settings → Integrations" };
  }

  const kind = whatsAppMediaKind(mime);
  // Only document and image support a caption; audio/video reject unexpected fields.
  const payload: Record<string, unknown> = { link: mediaUrl };
  if (kind === "document" && filename) payload.filename = filename;
  if (caption && (kind === "document" || kind === "image" || kind === "video")) payload.caption = caption;

  try {
    const res = await fetch(`https://graph.facebook.com/${GRAPH_VERSION}/${phoneNumberId}/messages`, {
      method: "POST",
      headers: { Authorization: `Bearer ${accessToken}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        messaging_product: "whatsapp",
        to: to.replace(/[^\d]/g, ""),
        type: kind,
        [kind]: payload,
      }),
    });
    const json = await res.json();
    if (!res.ok) {
      console.error("[whatsapp media send] Meta API error:", JSON.stringify(json));
      return { ok: false, error: json?.error?.message ?? `HTTP ${res.status}` };
    }
    return { ok: true, messageId: json?.messages?.[0]?.id };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : "Unknown error" };
  }
}

/**
 * Downloads inbound media a candidate sent. Meta gives the webhook only a
 * media ID; the bytes need two calls — resolve the ID to a short-lived URL,
 * then fetch that URL with the access token attached.
 */
export async function downloadWhatsAppMedia(
  mediaId: string,
  credentials?: WhatsAppCredentials
): Promise<{ ok: boolean; bytes?: ArrayBuffer; mime?: string; error?: string }> {
  const accessToken = credentials?.accessToken ?? process.env.WHATSAPP_ACCESS_TOKEN;
  if (!accessToken) return { ok: false, error: "WhatsApp not configured" };

  try {
    const metaRes = await fetch(`https://graph.facebook.com/${GRAPH_VERSION}/${mediaId}`, {
      headers: { Authorization: `Bearer ${accessToken}` },
    });
    const meta = await metaRes.json();
    if (!metaRes.ok || !meta?.url) {
      return { ok: false, error: meta?.error?.message ?? `Could not resolve media ${mediaId}` };
    }

    const fileRes = await fetch(meta.url, { headers: { Authorization: `Bearer ${accessToken}` } });
    if (!fileRes.ok) return { ok: false, error: `Media download failed (HTTP ${fileRes.status})` };

    return { ok: true, bytes: await fileRes.arrayBuffer(), mime: meta.mime_type ?? "application/octet-stream" };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : "Unknown error" };
  }
}

export interface TemplateComponent {
  type: "body" | "header";
  parameters: { type: "text"; text: string }[];
}

/**
 * Sends a pre-approved WhatsApp message template.
 *
 * This is what makes COLD OUTREACH possible. WhatsApp only permits free-form
 * text within 24 hours of the candidate's last message; a first contact must
 * be an approved template or Meta rejects it. Templates are created and
 * approved by the business in WhatsApp Manager — see SETUP.md.
 */
export async function sendWhatsAppTemplate(
  to: string,
  templateName: string,
  languageCode: string,
  components: TemplateComponent[],
  credentials?: WhatsAppCredentials
): Promise<{ ok: boolean; error?: string; messageId?: string }> {
  const phoneNumberId = credentials?.phoneNumberId ?? process.env.WHATSAPP_PHONE_NUMBER_ID;
  const accessToken = credentials?.accessToken ?? process.env.WHATSAPP_ACCESS_TOKEN;
  if (!phoneNumberId || !accessToken) {
    return { ok: false, error: "WhatsApp not configured — connect it in Settings → Integrations" };
  }

  try {
    const res = await fetch(`https://graph.facebook.com/${GRAPH_VERSION}/${phoneNumberId}/messages`, {
      method: "POST",
      headers: { Authorization: `Bearer ${accessToken}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        messaging_product: "whatsapp",
        to: to.replace(/[^\d]/g, ""),
        type: "template",
        template: {
          name: templateName,
          language: { code: languageCode },
          components: components.length > 0 ? components : undefined,
        },
      }),
    });
    const json = await res.json();
    if (!res.ok) {
      console.error("[whatsapp template send] Meta API error:", JSON.stringify(json));
      return { ok: false, error: json?.error?.message ?? `HTTP ${res.status}` };
    }
    return { ok: true, messageId: json?.messages?.[0]?.id };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : "Unknown error" };
  }
}

/** Meta's error code for "outside the 24-hour customer service window". */
export const OUTSIDE_WINDOW_ERROR_CODES = [131047, 131026, 470];
