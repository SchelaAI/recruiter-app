import "server-only";
import { createHmac, timingSafeEqual } from "crypto";

const API_BASE = "https://api.calendly.com";

/**
 * Verifies a Calendly webhook actually came from Calendly, using the scheme
 * documented at developer.calendly.com/api-docs — a "Calendly-Webhook-Signature"
 * header shaped "t=<timestamp>,v1=<hex hmac>", HMAC-SHA256 over
 * "<timestamp>.<raw body>", hex-encoded (not base64, unlike Resend's scheme).
 *
 * The signing key is generated ONCE when the OAuth app itself is created in
 * Calendly's developer portal — it's a property of the app, not returned per
 * webhook subscription or per connecting org, so it's a single deployment-wide
 * secret (CALENDLY_WEBHOOK_SIGNING_KEY), the same shape as Resend's webhook
 * secret elsewhere in this codebase.
 */
export function verifyCalendlyWebhookSignature(rawBody: string, signatureHeader: string | null, signingKey: string): boolean {
  if (!signatureHeader) return false;

  const parts = Object.fromEntries(
    signatureHeader.split(",").map((p) => {
      const [k, v] = p.split("=");
      return [k?.trim(), v?.trim()];
    })
  );
  const timestamp = parts.t;
  const signature = parts.v1;
  if (!timestamp || !signature) return false;

  // Reject stale requests — same replay protection as the Resend webhook.
  const ts = Number(timestamp);
  if (!Number.isFinite(ts) || Math.abs(Date.now() / 1000 - ts) > 5 * 60) return false;

  const signedContent = `${timestamp}.${rawBody}`;
  const expected = createHmac("sha256", signingKey).update(signedContent).digest("hex");

  const a = Buffer.from(signature, "hex");
  const b = Buffer.from(expected, "hex");
  return a.length === b.length && timingSafeEqual(a, b);
}

interface CalendlyUser {
  uri: string;
  name: string;
  email: string;
  currentOrganizationUri: string;
}

export async function getCurrentCalendlyUser(accessToken: string): Promise<{ ok: boolean; user?: CalendlyUser; error?: string }> {
  try {
    const res = await fetch(`${API_BASE}/users/me`, { headers: { Authorization: `Bearer ${accessToken}` } });
    const json = await res.json();
    if (!res.ok) return { ok: false, error: json?.message ?? `HTTP ${res.status}` };
    const r = json.resource;
    return {
      ok: true,
      user: { uri: r.uri, name: r.name, email: r.email, currentOrganizationUri: r.current_organization },
    };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : "Unknown error" };
  }
}

export interface CalendlyEventType {
  uri: string;
  name: string;
  durationMinutes: number;
  schedulingUrl: string;
}

/** Lists the connected user's active event types, so the recruiter can pick which one Schela books interviews through. */
export async function listCalendlyEventTypes(accessToken: string, userUri: string): Promise<{ ok: boolean; eventTypes?: CalendlyEventType[]; error?: string }> {
  try {
    const params = new URLSearchParams({ user: userUri, active: "true", count: "50" });
    const res = await fetch(`${API_BASE}/event_types?${params}`, { headers: { Authorization: `Bearer ${accessToken}` } });
    const json = await res.json();
    if (!res.ok) return { ok: false, error: json?.message ?? `HTTP ${res.status}` };
    const eventTypes: CalendlyEventType[] = (json.collection ?? []).map((e: { uri: string; name: string; duration: number; scheduling_url: string }) => ({
      uri: e.uri,
      name: e.name,
      durationMinutes: e.duration,
      schedulingUrl: e.scheduling_url,
    }));
    return { ok: true, eventTypes };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : "Unknown error" };
  }
}

/**
 * Creates a real single-use Calendly booking link for the org's chosen event
 * type. This is the actual "booking" mechanism for Calendly: unlike Google
 * Calendar / Outlook (where Schela picks and books a specific time itself),
 * Calendly's strength is letting the candidate pick their own slot through
 * Calendly's own interface — Schela hands them a link, then finds out what
 * they picked via the invitee.created webhook. The link is single-use and
 * expires in 90 days per Calendly's own limits.
 */
export async function createCalendlySchedulingLink(
  accessToken: string,
  eventTypeUri: string
): Promise<{ ok: boolean; bookingUrl?: string; error?: string }> {
  try {
    const res = await fetch(`${API_BASE}/scheduling_links`, {
      method: "POST",
      headers: { Authorization: `Bearer ${accessToken}`, "Content-Type": "application/json" },
      body: JSON.stringify({ max_event_count: 1, owner: eventTypeUri, owner_type: "EventType" }),
    });
    const json = await res.json();
    if (!res.ok) {
      console.error("[calendly] scheduling link creation failed:", JSON.stringify(json));
      return { ok: false, error: json?.message ?? `HTTP ${res.status}` };
    }
    return { ok: true, bookingUrl: json?.resource?.booking_url };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : "Unknown error" };
  }
}

/**
 * Registers a webhook subscription so Schela is told the moment a candidate
 * books (or cancels) through a Calendly link. Called once, right after the
 * OAuth connection completes — see the oauth callback route.
 */
export async function setUpCalendlyWebhook(
  orgId: string,
  accessToken: string,
  callbackUrl: string
): Promise<{ ok: boolean; error?: string }> {
  const userResult = await getCurrentCalendlyUser(accessToken);
  if (!userResult.ok || !userResult.user) {
    return { ok: false, error: userResult.error ?? "Couldn't resolve the connected Calendly user" };
  }

  try {
    const res = await fetch(`${API_BASE}/webhook_subscriptions`, {
      method: "POST",
      headers: { Authorization: `Bearer ${accessToken}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        url: callbackUrl,
        events: ["invitee.created", "invitee.canceled"],
        organization: userResult.user.currentOrganizationUri,
        user: userResult.user.uri,
        scope: "user",
      }),
    });
    const json = await res.json();
    if (!res.ok) {
      // A duplicate-subscription error on reconnect is expected and harmless
      // — the webhook from the first connection is still live.
      const message = json?.message ?? `HTTP ${res.status}`;
      if (res.status === 409 || /already exists/i.test(message)) return { ok: true };
      console.error(`[calendly] webhook subscription failed for org ${orgId}:`, JSON.stringify(json));
      return { ok: false, error: message };
    }
    return { ok: true };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : "Unknown error" };
  }
}

/**
 * Real availability for an event type over a window, computed by Calendly
 * itself from the recruiter's connected calendar, working hours, and buffers
 * — Schela doesn't need to do its own free/busy filtering the way it does
 * for Google/Outlook, because Calendly already accounts for all of that.
 */
export async function getCalendlyAvailableTimes(
  accessToken: string,
  eventTypeUri: string,
  startTime: Date,
  endTime: Date
): Promise<{ ok: boolean; slots?: { startTime: string }[]; error?: string }> {
  try {
    const params = new URLSearchParams({
      event_type: eventTypeUri,
      start_time: startTime.toISOString(),
      end_time: endTime.toISOString(),
    });
    const res = await fetch(`${API_BASE}/event_type_available_times?${params}`, {
      headers: { Authorization: `Bearer ${accessToken}` },
    });
    const json = await res.json();
    if (!res.ok) {
      console.error("[calendly] available-times lookup failed:", JSON.stringify(json));
      return { ok: false, error: json?.message ?? `HTTP ${res.status}` };
    }
    const slots = (json.collection ?? []).map((s: { start_time: string }) => ({ startTime: s.start_time }));
    return { ok: true, slots };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : "Unknown error" };
  }
}
