import "server-only";

/**
 * Queries the connected Outlook calendar's busy blocks over a window, using
 * Microsoft Graph's getSchedule endpoint. Mirrors the Google freeBusy helper
 * so slot generation can treat both providers identically.
 */
export async function getOutlookFreeBusy(
  accessToken: string,
  timeMin: Date,
  timeMax: Date
): Promise<{ ok: boolean; busy?: { start: string; end: string }[]; error?: string }> {
  try {
    // getSchedule needs the mailbox address, so resolve it first.
    const meRes = await fetch("https://graph.microsoft.com/v1.0/me", {
      headers: { Authorization: `Bearer ${accessToken}` },
    });
    const me = await meRes.json();
    const address: string | undefined = me?.mail ?? me?.userPrincipalName;
    if (!meRes.ok || !address) {
      return { ok: false, error: me?.error?.message ?? "Couldn't resolve the connected mailbox" };
    }

    const res = await fetch("https://graph.microsoft.com/v1.0/me/calendar/getSchedule", {
      method: "POST",
      headers: { Authorization: `Bearer ${accessToken}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        schedules: [address],
        startTime: { dateTime: timeMin.toISOString(), timeZone: "UTC" },
        endTime: { dateTime: timeMax.toISOString(), timeZone: "UTC" },
        availabilityViewInterval: 30,
      }),
    });
    const json = await res.json();
    if (!res.ok) return { ok: false, error: json?.error?.message ?? `HTTP ${res.status}` };

    const items = json?.value?.[0]?.scheduleItems ?? [];
    // Graph returns naive datetimes with a separate timeZone field; we asked
    // for UTC above, so append Z to make them unambiguous Dates downstream.
    const busy = items
      .filter((i: { status?: string }) => i.status !== "free")
      .map((i: { start: { dateTime: string }; end: { dateTime: string } }) => ({
        start: `${i.start.dateTime.replace(/Z$/, "")}Z`,
        end: `${i.end.dateTime.replace(/Z$/, "")}Z`,
      }));

    return { ok: true, busy };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : "Unknown error" };
  }
}

/**
 * Creates a real event on the connected Outlook calendar and invites the
 * candidate. Requests an online meeting so Teams generates a join link.
 */
export async function createOutlookEvent(params: {
  accessToken: string;
  subject: string;
  body?: string;
  startISO: string;
  durationMinutes: number;
  attendeeEmail?: string;
}): Promise<{ ok: boolean; eventId?: string; meetingLink?: string; error?: string }> {
  const { accessToken, subject, body, startISO, durationMinutes, attendeeEmail } = params;
  const start = new Date(startISO);
  const end = new Date(start.getTime() + durationMinutes * 60_000);

  try {
    const res = await fetch("https://graph.microsoft.com/v1.0/me/events", {
      method: "POST",
      headers: { Authorization: `Bearer ${accessToken}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        subject,
        body: body ? { contentType: "text", content: body } : undefined,
        start: { dateTime: start.toISOString(), timeZone: "UTC" },
        end: { dateTime: end.toISOString(), timeZone: "UTC" },
        attendees: attendeeEmail
          ? [{ emailAddress: { address: attendeeEmail }, type: "required" }]
          : undefined,
        isOnlineMeeting: true,
        onlineMeetingProvider: "teamsForBusiness",
      }),
    });
    const json = await res.json();
    if (!res.ok) {
      console.error("[outlook] create event failed:", JSON.stringify(json));
      return { ok: false, error: json?.error?.message ?? `HTTP ${res.status}` };
    }
    return { ok: true, eventId: json.id, meetingLink: json.onlineMeeting?.joinUrl ?? json.webLink };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : "Unknown error" };
  }
}

/**
 * Deletes a real event from the connected Outlook calendar. Same fix as
 * Calendly's cancelCalendlyEvent — cancelling an interview in Schela used to
 * only message the candidate and never touched the actual calendar event
 * that createOutlookEvent had created.
 */
export async function deleteOutlookEvent(accessToken: string, eventId: string): Promise<{ ok: boolean; error?: string }> {
  try {
    const res = await fetch(`https://graph.microsoft.com/v1.0/me/events/${eventId}`, {
      method: "DELETE",
      headers: { Authorization: `Bearer ${accessToken}` },
    });
    // A 404 means the event is already gone (e.g. deleted manually in
    // Outlook) — that's the desired end state either way, not a failure.
    if (!res.ok && res.status !== 404) {
      const json = await res.json().catch(() => ({}));
      console.error("[outlook] delete event failed:", JSON.stringify(json));
      return { ok: false, error: json?.error?.message ?? `HTTP ${res.status}` };
    }
    return { ok: true };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : "Unknown error" };
  }
}
