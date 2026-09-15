import "server-only";

/**
 * Creates a real scheduled Zoom meeting on the connected account and returns
 * its join URL. Zoom has no calendar/free-busy concept here — it only supplies
 * the meeting link; the interview time itself still lives in Schela (and on a
 * connected calendar, if there is one).
 */
export async function createZoomMeeting(params: {
  accessToken: string;
  topic: string;
  agenda?: string;
  startISO: string;
  durationMinutes: number;
}): Promise<{ ok: boolean; meetingId?: string; meetingLink?: string; error?: string }> {
  const { accessToken, topic, agenda, startISO, durationMinutes } = params;

  try {
    const res = await fetch("https://api.zoom.us/v2/users/me/meetings", {
      method: "POST",
      headers: { Authorization: `Bearer ${accessToken}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        topic,
        agenda,
        type: 2, // scheduled meeting
        start_time: new Date(startISO).toISOString().replace(/\.\d{3}Z$/, "Z"),
        duration: durationMinutes,
        timezone: "UTC",
        settings: { join_before_host: true, waiting_room: false },
      }),
    });
    const json = await res.json();
    if (!res.ok) {
      console.error("[zoom] create meeting failed:", JSON.stringify(json));
      return { ok: false, error: json?.message ?? `HTTP ${res.status}` };
    }
    return { ok: true, meetingId: String(json.id), meetingLink: json.join_url };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : "Unknown error" };
  }
}
