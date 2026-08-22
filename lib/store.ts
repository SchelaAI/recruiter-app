import "server-only";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/server";
import type { Candidate, Interview, Conversation, Message, AppNotification, Integration, Organization, Interviewer } from "./types";
import type { Database } from "@/lib/supabase/database.types";

/**
 * This module is the ONLY thing that talks to the database — every API
 * route imports functions from here and nothing else. That seam is what
 * let this file get rewritten from a local JSON file to real Supabase
 * without touching a single UI component or API route.
 *
 * Every function below is scoped to the caller's organization. RLS enforces
 * this at the database level too (see supabase/migrations/0001_init.sql) —
 * this is defense in depth, not the only thing standing between orgs.
 */

async function getOrgId(): Promise<string> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error("Not authenticated");

  const { data: profile } = await supabase
    .from("profiles")
    .select("org_id")
    .eq("id", user.id)
    .single();

  if (!profile?.org_id) throw new Error("No organization — onboarding incomplete");
  return profile.org_id;
}

/** Public wrapper for API routes (e.g. OAuth callbacks) that need the current org id directly. */
export async function getCurrentOrgId(): Promise<string> {
  return getOrgId();
}

/* ============ display formatting helpers ============
 * The UI expects human strings ("2m ago", "TODAY · WED 9 JUL", "09:00 AM")
 * that the database deliberately does NOT store — storing them would make
 * them go stale immediately. They're derived from real timestamps here,
 * every time they're read. */

function formatRelativeTime(iso: string): string {
  const diffMs = Date.now() - new Date(iso).getTime();
  const mins = Math.round(diffMs / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.round(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.round(hours / 24);
  return `${days}d ago`;
}

const DOW = ["SUN", "MON", "TUE", "WED", "THU", "FRI", "SAT"];
const MONTHS = ["JAN", "FEB", "MAR", "APR", "MAY", "JUN", "JUL", "AUG", "SEP", "OCT", "NOV", "DEC"];

function deriveGroupLabel(iso: string): string {
  const date = new Date(iso);
  const today = new Date();
  const d0 = new Date(date.getFullYear(), date.getMonth(), date.getDate());
  const t0 = new Date(today.getFullYear(), today.getMonth(), today.getDate());
  const diffDays = Math.round((d0.getTime() - t0.getTime()) / 86400000);
  const label = `${DOW[date.getDay()]} ${date.getDate()} ${MONTHS[date.getMonth()]}`;
  if (diffDays === 0) return `TODAY · ${label}`;
  if (diffDays === 1) return `TOMORROW · ${label}`;
  if (diffDays >= 2 && diffDays <= 6) return `THIS WEEK · ${label}`;
  return `LATER · ${label}`;
}

function formatTimeLabel(iso: string): string {
  const d = new Date(iso);
  let h = d.getHours();
  const m = String(d.getMinutes()).padStart(2, "0");
  const ampm = h >= 12 ? "PM" : "AM";
  h = h % 12 || 12;
  return `${String(h).padStart(2, "0")}:${m} ${ampm}`;
}

/** Shape of `interviews` joined with `candidates(id, name)` — cast explicitly
 * at each call site below. Postgrest's automatic join-typing needs full FK
 * relationship metadata in the Database type (normally from `supabase gen
 * types`), which the hand-authored type in database.types.ts doesn't have;
 * casting here is simpler than hand-describing every foreign key. */
interface InterviewRowWithCandidate {
  id: number;
  candidate_id: string;
  scheduled_at: string;
  duration_minutes: number;
  format: string;
  channel: "wa" | "em";
  ai_state: string;
  interviewer: string;
  handled_by: "ai" | "you";
  meeting_link: string | null;
  candidates: { id: string; name: string } | null;
}

/* ============ CANDIDATES ============ */

export async function listCandidates(): Promise<Candidate[]> {
  const supabase = await createClient();
  const orgId = await getOrgId();

  const { data, error } = await supabase
    .from("candidates")
    .select("*")
    .eq("org_id", orgId)
    .order("created_at", { ascending: false });

  if (error) throw error;

  return (data ?? []).map((row) => ({
    id: row.id,
    name: row.name,
    jobPosition: row.job_position ?? "",
    countryCode: row.country_code,
    phone: row.phone,
    email: row.email,
    preferredChannel: (row.preferred_channel ?? "wa") as Candidate["preferredChannel"],
    timeZone: row.time_zone ?? "",
    notes: row.notes ?? "",
    aiState: row.ai_state as Candidate["aiState"],
    active: formatRelativeTime(row.updated_at),
    score: row.score,
  }));
}

export async function createCandidate(input: Partial<Candidate>): Promise<Candidate> {
  const supabase = await createClient();
  const orgId = await getOrgId();

  const idPrefix =
    (input.name ?? "New Candidate")
      .split(" ")
      .map((w) => w[0])
      .join("")
      .toUpperCase()
      .slice(0, 2) || "NC";
  const id = `${idPrefix}${Math.floor(Math.random() * 90 + 10)}`;

  const { data, error } = await supabase
    .from("candidates")
    .insert({
      id,
      org_id: orgId,
      name: input.name ?? "New Candidate",
      job_position: input.jobPosition || null,
      country_code: input.countryCode ?? "+91",
      phone: input.phone ?? "",
      email: input.email ?? "",
      preferred_channel: input.preferredChannel ?? null,
      time_zone: input.timeZone || null,
      notes: input.notes || null,
      ai_state: "sending_invitation",
      score: input.score ?? 75,
    })
    .select()
    .single();

  if (error) throw error;

  return {
    id: data.id,
    name: data.name,
    jobPosition: data.job_position ?? "",
    countryCode: data.country_code,
    phone: data.phone,
    email: data.email,
    preferredChannel: (data.preferred_channel ?? "wa") as Candidate["preferredChannel"],
    timeZone: data.time_zone ?? "",
    notes: data.notes ?? "",
    aiState: data.ai_state as Candidate["aiState"],
    active: "just now",
    score: data.score,
  };
}

export async function updateCandidate(id: string, patch: Partial<Candidate>): Promise<Candidate | null> {
  const supabase = await createClient();
  const orgId = await getOrgId();

  const dbPatch: Database["public"]["Tables"]["candidates"]["Update"] = { updated_at: new Date().toISOString() };
  if (patch.name !== undefined) dbPatch.name = patch.name;
  if (patch.jobPosition !== undefined) dbPatch.job_position = patch.jobPosition || null;
  if (patch.countryCode !== undefined) dbPatch.country_code = patch.countryCode;
  if (patch.phone !== undefined) dbPatch.phone = patch.phone;
  if (patch.email !== undefined) dbPatch.email = patch.email;
  if (patch.preferredChannel !== undefined) dbPatch.preferred_channel = patch.preferredChannel;
  if (patch.timeZone !== undefined) dbPatch.time_zone = patch.timeZone || null;
  if (patch.notes !== undefined) dbPatch.notes = patch.notes || null;
  if (patch.aiState !== undefined) dbPatch.ai_state = patch.aiState;
  if (patch.score !== undefined) dbPatch.score = patch.score;

  const { data, error } = await supabase
    .from("candidates")
    .update(dbPatch)
    .eq("id", id)
    .eq("org_id", orgId)
    .select()
    .single();

  if (error || !data) return null;

  return {
    id: data.id,
    name: data.name,
    jobPosition: data.job_position ?? "",
    countryCode: data.country_code,
    phone: data.phone,
    email: data.email,
    preferredChannel: (data.preferred_channel ?? "wa") as Candidate["preferredChannel"],
    timeZone: data.time_zone ?? "",
    notes: data.notes ?? "",
    aiState: data.ai_state as Candidate["aiState"],
    active: formatRelativeTime(data.updated_at),
    score: data.score,
  };
}

export async function deleteCandidate(id: string): Promise<boolean> {
  const supabase = await createClient();
  const orgId = await getOrgId();

  // Interviews, conversations, messages, action_items and notifications all
  // reference candidates with ON DELETE CASCADE / SET NULL (see 0001_init.sql),
  // so removing the candidate cleans up cleanly without orphan rows.
  const { error, count } = await supabase
    .from("candidates")
    .delete({ count: "exact" })
    .eq("id", id)
    .eq("org_id", orgId);

  if (error) return false;
  return (count ?? 0) > 0;
}

/** Real, date-correct slot label — e.g. "Wed, Jul 23 · 10:00 AM". Never a static placeholder. */
function formatSlotLabel(d: Date): string {
  const DOW = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
  const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
  let h = d.getHours();
  const period = h >= 12 ? "PM" : "AM";
  h = h % 12;
  if (h === 0) h = 12;
  return `${DOW[d.getDay()]}, ${MONTHS[d.getMonth()]} ${d.getDate()} · ${h}:${String(d.getMinutes()).padStart(2, "0")} ${period}`;
}

/**
 * Refreshes and returns a valid Google Calendar access token for this org,
 * if it has one connected. Handles token refresh transparently using the
 * stored refresh_token, persisting the new token back to the DB.
 */
async function getOAuthAccessTokenForOrg(orgId: string, provider: "outlook" | "zoom" | "calendly"): Promise<string | null> {
  const admin = createAdminClient();
  const { data } = await admin.from("integrations").select("config").eq("org_id", orgId).eq("id", provider).single();
  const cfg = data?.config as { access_token?: string; refresh_token?: string; expires_at?: string } | null;
  if (!cfg?.access_token) return null;

  const expiresAt = cfg.expires_at ? new Date(cfg.expires_at).getTime() : null;
  const needsRefresh = expiresAt !== null && expiresAt - Date.now() < 60_000;
  if (!needsRefresh || !cfg.refresh_token) return cfg.access_token;

  const { refreshAccessToken } = await import("@/lib/integrations/oauth");
  const result = await refreshAccessToken(provider, cfg.refresh_token);
  if (!result.ok || !result.tokens) return cfg.access_token; // stale but might still work

  const newExpiresAt = result.tokens.expires_in ? new Date(Date.now() + result.tokens.expires_in * 1000).toISOString() : null;
  await admin
    .from("integrations")
    .update({ config: { access_token: result.tokens.access_token, refresh_token: result.tokens.refresh_token ?? cfg.refresh_token, expires_at: newExpiresAt } })
    .eq("org_id", orgId)
    .eq("id", provider);

  return result.tokens.access_token;
}


export interface TimeSlot {
  iso: string;
  label: string;
  dayLabel: string;
}

/**
 * Generates real, date-correct interview slots — the next 4 weekdays,
 * two proposed times each, as actual Date objects (not hardcoded "Mon 9am"
 * strings disconnected from any real calendar date). If the org has Google
 * Calendar connected, slots that overlap a real busy block are dropped.
 *
 * Simplification worth being upfront about: hours are anchored to the
 * server's own clock, not a per-org/per-candidate timezone — this app
 * doesn't track a reliable org timezone yet, so this matches the level of
 * timezone-awareness already used elsewhere (e.g. relative-time labels).
 */
export async function getAvailableSlots(): Promise<TimeSlot[]> {
  return getAvailableSlotsForOrg(await getOrgId());
}

/**
 * Org-scoped variant. The inbound webhook path has no user session (Meta's
 * servers aren't logged in), so it can't use getOrgId() — it resolves the org
 * from the candidate and passes it in explicitly.
 */
export async function getAvailableSlotsForOrg(orgId: string): Promise<TimeSlot[]> {
  const BUSINESS_HOURS = [10, 14]; // 10:00 and 2:00pm

  const candidateSlots: Date[] = [];
  const cursor = new Date();
  cursor.setDate(cursor.getDate() + 1); // start tomorrow — no same-day invites
  cursor.setHours(0, 0, 0, 0);
  let daysAdded = 0;
  while (daysAdded < 4) {
    const dow = cursor.getDay();
    if (dow !== 0 && dow !== 6) {
      for (const h of BUSINESS_HOURS) {
        const d = new Date(cursor);
        d.setHours(h, 0, 0, 0);
        candidateSlots.push(d);
      }
      daysAdded++;
    }
    cursor.setDate(cursor.getDate() + 1);
  }

  // Drop slots that clash with real events on whichever calendar is connected.
  // Both providers are checked, so an org connecting either (or both) gets
  // accurate availability rather than proposed times it can't actually make.
  const timeMin = candidateSlots[0];
  const timeMax = new Date(candidateSlots[candidateSlots.length - 1].getTime() + 60 * 60_000);
  const busyBlocks: { start: string; end: string }[] = [];

  const outlookToken = await getOAuthAccessTokenForOrg(orgId, "outlook");
  if (outlookToken) {
    const { getOutlookFreeBusy } = await import("@/lib/integrations/outlook");
    const fb = await getOutlookFreeBusy(outlookToken, timeMin, timeMax);
    if (fb.ok && fb.busy) busyBlocks.push(...fb.busy);
    else if (!fb.ok) console.error("[getAvailableSlots] Outlook free/busy failed:", fb.error);
  }

  let available = candidateSlots;
  if (busyBlocks.length > 0) {
    available = candidateSlots.filter((slot) => {
      const slotEnd = new Date(slot.getTime() + 45 * 60_000);
      return !busyBlocks.some((b) => {
        const busyStart = new Date(b.start).getTime();
        const busyEnd = new Date(b.end).getTime();
        return slot.getTime() < busyEnd && slotEnd.getTime() > busyStart;
      });
    });
  }

  const DOW3 = ["SUN", "MON", "TUE", "WED", "THU", "FRI", "SAT"];
  return available.map((d) => ({ iso: d.toISOString(), label: formatSlotLabel(d), dayLabel: DOW3[d.getDay()] }));
}

/* ============ INTERVIEWS ============ */
export async function listInterviews(): Promise<Interview[]> {
  const supabase = await createClient();
  const orgId = await getOrgId();

  const { data, error } = await supabase
    .from("interviews")
    .select("*, candidates(id, name)")
    .eq("org_id", orgId)
    .order("scheduled_at", { ascending: true });

  if (error) throw error;

  const rows = (data ?? []) as unknown as InterviewRowWithCandidate[];
  return rows.map((row) => {
    const scheduled = new Date(row.scheduled_at);
    const candidate = row.candidates;
    return {
      id: row.id,
      time: formatTimeLabel(row.scheduled_at),
      group: deriveGroupLabel(row.scheduled_at),
      cand: candidate?.name ?? "Unknown",
      candId: row.candidate_id,
      jobPosition: "", // joined from candidates.job_position if needed — kept minimal here
      channel: row.channel as Interview["channel"],
      aiState: row.ai_state as Interview["aiState"],
      interviewer: row.interviewer,
      handled: row.handled_by as Interview["handled"],
      duration: `${row.duration_minutes} min`,
      format: row.format,
      hour: scheduled.getHours() + scheduled.getMinutes() / 60,
      day: scheduled.getDay(),
      scheduledAt: row.scheduled_at,
    meetingLink: row.meeting_link ?? undefined,
    };
  });
}

export interface CreateInterviewInput {
  candId: string;
  cand: string;
  jobPosition: string;
  channel: Interview["channel"];
  aiState: Interview["aiState"];
  interviewer: string;
  handled: Interview["handled"];
  duration: string;
  format: string;
  /** Real ISO datetime for the interview — e.g. from /api/scheduling/slots. Never reconstructed from a display label. */
  scheduledAt: string;
}

export async function createInterview(input: CreateInterviewInput): Promise<Interview> {
  const supabase = await createClient();
  const orgId = await getOrgId();

  const scheduledAt = new Date(input.scheduledAt);
  if (isNaN(scheduledAt.getTime())) {
    throw new Error("scheduledAt must be a valid ISO datetime");
  }

  const { data, error } = await supabase
    .from("interviews")
    .insert({
      org_id: orgId,
      candidate_id: input.candId,
      scheduled_at: scheduledAt.toISOString(),
      duration_minutes: parseInt(input.duration) || 45,
      format: input.format,
      channel: input.channel,
      ai_state: input.aiState,
      interviewer: input.interviewer,
      handled_by: input.handled,
    })
    .select("*, candidates(id, name, email, phone, country_code)")
    .single();

  if (error) throw error;

  const row = data as unknown as InterviewRowWithCandidate & { candidates: { id: string; name: string; email: string; phone: string; country_code: string } | null };
  const candidate = row.candidates;

  // Create the real meeting link and calendar event using whichever providers
  // the org has connected. The recruiter's chosen `format` decides where the
  // link comes from when there's a choice; the calendar event is created on
  // Outlook when connected.
  let meetingLink: string | undefined;
  let calendarEventId: string | undefined;

  const wantsZoom = /zoom/i.test(input.format);
  const outlookToken = await getOAuthAccessTokenForOrg(orgId, "outlook");
  const zoomToken = wantsZoom ? await getOAuthAccessTokenForOrg(orgId, "zoom") : null;

  const summary = `Interview: ${candidate?.name ?? input.cand} — ${input.jobPosition}`;
  const { data: orgRow } = await supabase.from("organizations").select("name").eq("id", orgId).single();
  const companyName = orgRow?.name?.trim() || "our team";
  const description = `Scheduled via Schela. Interviewer: ${input.interviewer}.`;

  // 1. Zoom, when the recruiter picked it and the account is connected. Done
  //    first so the link can be embedded in the calendar invite below.
  if (zoomToken) {
    const { createZoomMeeting } = await import("@/lib/integrations/zoom");
    const result = await createZoomMeeting({
      accessToken: zoomToken,
      topic: summary,
      agenda: description,
      startISO: row.scheduled_at,
      durationMinutes: row.duration_minutes,
    });
    if (result.ok) meetingLink = result.meetingLink;
    else console.error("[createInterview] Zoom meeting creation failed:", result.error);
  }

  // 2. Calendar event. Supplies a Teams link too when we don't already have
  //    one from Zoom.
  const eventDescription = meetingLink ? `${description}\n\nJoin: ${meetingLink}` : description;
  if (outlookToken) {
    const { createOutlookEvent } = await import("@/lib/integrations/outlook");
    const result = await createOutlookEvent({
      accessToken: outlookToken,
      subject: summary,
      body: eventDescription,
      startISO: row.scheduled_at,
      durationMinutes: row.duration_minutes,
      attendeeEmail: candidate?.email,
    });
    if (result.ok) {
      calendarEventId = result.eventId;
      if (!meetingLink) meetingLink = result.meetingLink;
    } else {
      console.error("[createInterview] Outlook event creation failed:", result.error);
    }
  }

  // Actually send the invitation. Without this the interview row was created
  // and the wizard reported success, but nothing ever reached the candidate —
  // the state said "sending_invitation" while no message was sent at all.
  if (candidate) {
    const firstName = candidate.name.split(" ")[0];
    const when = new Date(row.scheduled_at);
    const dateStr = when.toLocaleDateString(undefined, { weekday: "long", month: "long", day: "numeric" });
    const timeStr = when.toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" });

    // Calendly is a genuinely different model from Google Meet/Zoom/Phone/
    // In-person: for those, Schela already picked a specific real time before
    // this point. Calendly's whole value is the candidate picking their OWN
    // slot — so instead of stating a fixed time, send a real single-use
    // booking link. The row's scheduled_at stays a placeholder (the nearest
    // proposed slot) until the candidate actually books; the Calendly webhook
    // then updates it to the real chosen time — see /api/webhooks/calendly.
    let invitation: string;
    if (input.format === "Calendly") {
      const calendlyToken = await getOAuthAccessTokenForOrg(orgId, "calendly");
      const { data: calendlyRow } = await supabase.from("integrations").select("config").eq("org_id", orgId).eq("id", "calendly").single();
      const eventTypeUri = (calendlyRow?.config as { event_type_uri?: string } | null)?.event_type_uri;

      let bookingUrl: string | undefined;
      if (calendlyToken && eventTypeUri) {
        const { createCalendlySchedulingLink } = await import("@/lib/integrations/calendly");
        const link = await createCalendlySchedulingLink(calendlyToken, eventTypeUri);
        if (link.ok) bookingUrl = link.bookingUrl;
        else console.error(`[createInterview] Calendly booking link failed for ${row.id}:`, link.error);
      }

      invitation = bookingUrl
        ? `Hi ${firstName} 👋\n\nI'm Schela, the AI Recruiting Coordinator assisting with the hiring process for the ${input.jobPosition} position at ${companyName}.\n\nPlease pick a time that works for you:\n\n${bookingUrl}\n\nOnce you've booked, I'll confirm here.`
        : `Hi ${firstName} 👋\n\nI'm Schela, the AI Recruiting Coordinator assisting with the hiring process for the ${input.jobPosition} position at ${companyName}.\n\nWe'd like to confirm your interview.\n\nDate: ${dateStr}\nTime: ${timeStr}\n\nReply YES to confirm, or let me know if another time works better.`;
      if (bookingUrl) meetingLink = bookingUrl;
    } else {
      const linkLine = meetingLink ? `\nMeeting Link: ${meetingLink}` : "";
      invitation =
        `Hi ${firstName} 👋\n\n` +
        `I'm Schela, the AI Recruiting Coordinator assisting with the hiring process for the ${input.jobPosition} position at ${companyName}.\n\n` +
        `We'd like to confirm your interview.\n\n` +
        `Date: ${dateStr}\nTime: ${timeStr}${linkLine}\n\n` +
        `Reply YES to confirm, or let me know if another time works better.`;
    }

    let delivered = true;
    let deliveryError: string | undefined;

    if (row.channel === "wa") {
      const res = await sendWhatsAppWithTemplateFallback(
        orgId, `${candidate.country_code ?? ""}${candidate.phone}`, invitation, [firstName, `${dateStr} at ${timeStr}`]
      );
      delivered = res.ok;
      deliveryError = res.error;
    } else if (candidate.email) {
      const res = await sendEmailForOrg(
        orgId, candidate.email, `Your interview — ${input.jobPosition}`, invitation
      );
      delivered = res.ok;
      deliveryError = res.error;
    } else {
      delivered = false;
      deliveryError = "Candidate has no email on file";
    }

    if (!delivered) console.error(`[createInterview] invitation delivery failed for ${row.id}:`, deliveryError);

    // Record it in the thread either way, so the recruiter sees exactly what
    // was sent (or attempted), same as every other send path in the app.
    const conversationId = `c-${candidate.id.toLowerCase()}`;
    await supabase
      .from("conversations")
      .upsert({ id: conversationId, org_id: orgId, candidate_id: candidate.id, channel: row.channel }, { onConflict: "id" });
    await supabase.from("messages").insert({
      conversation_id: conversationId,
      from_role: "schela",
      text: invitation,
      channel: row.channel,
      delivered,
      delivery_error: delivered ? null : deliveryError,
      sender_kind: "ai",
      sender_name: "Schela",
    });
    await supabase
      .from("conversations")
      .update({ updated_at: new Date().toISOString() })
      .eq("id", conversationId);
  }

  if (meetingLink || calendarEventId) {
    await supabase
      .from("interviews")
      .update({ meeting_link: meetingLink ?? null, calendar_event_id: calendarEventId ?? null })
      .eq("id", row.id);
  }

  return {
    id: row.id,
    time: formatTimeLabel(row.scheduled_at),
    group: deriveGroupLabel(row.scheduled_at),
    cand: candidate?.name ?? input.cand,
    candId: row.candidate_id,
    jobPosition: input.jobPosition,
    channel: row.channel,
    aiState: row.ai_state as Interview["aiState"],
    interviewer: row.interviewer,
    handled: row.handled_by,
    duration: `${row.duration_minutes} min`,
    format: row.format,
    hour: new Date(row.scheduled_at).getHours(),
    day: new Date(row.scheduled_at).getDay(),
    scheduledAt: row.scheduled_at,
    meetingLink,
  };
}

export async function updateInterview(id: number, patch: Partial<Interview>): Promise<Interview | null> {
  const supabase = await createClient();
  const orgId = await getOrgId();

  const dbPatch: Database["public"]["Tables"]["interviews"]["Update"] = {};
  if (patch.aiState) dbPatch.ai_state = patch.aiState;
  if (patch.interviewer) dbPatch.interviewer = patch.interviewer;
  if (patch.format) dbPatch.format = patch.format;
  if (patch.handled) dbPatch.handled_by = patch.handled;
  if (patch.channel) dbPatch.channel = patch.channel;
  dbPatch.updated_at = new Date().toISOString();

  const { data, error } = await supabase
    .from("interviews")
    .update(dbPatch)
    .eq("id", id)
    .eq("org_id", orgId)
    .select("*, candidates(id, name)")
    .single();

  if (error || !data) return null;

  const row = data as unknown as InterviewRowWithCandidate;
  const candidate = row.candidates;
  return {
    id: row.id,
    time: formatTimeLabel(row.scheduled_at),
    group: deriveGroupLabel(row.scheduled_at),
    cand: candidate?.name ?? "Unknown",
    candId: row.candidate_id,
    jobPosition: "",
    channel: row.channel,
    aiState: row.ai_state as Interview["aiState"],
    interviewer: row.interviewer,
    handled: row.handled_by,
    duration: `${row.duration_minutes} min`,
    format: row.format,
    hour: new Date(row.scheduled_at).getHours(),
    day: new Date(row.scheduled_at).getDay(),
    scheduledAt: row.scheduled_at,
    meetingLink: row.meeting_link ?? undefined,
  };
}

export async function deleteInterview(id: number): Promise<boolean> {  const supabase = await createClient();
  const orgId = await getOrgId();

  const { error, count } = await supabase
    .from("interviews")
    .delete({ count: "exact" })
    .eq("id", id)
    .eq("org_id", orgId);

  if (error) return false;
  return (count ?? 0) > 0;
}

/**
 * A real reschedule: moves the interview to a new time, flips it into the
 * "rescheduling" state, and actually sends the candidate the new proposed
 * slot (over WhatsApp when that's the channel), recording it in the thread.
 * `newTimeISO` must be a real ISO datetime (e.g. from /api/scheduling/slots)
 * — no more parsing a display label like "Wed 11am" back into a guessed date.
 */
export async function rescheduleInterview(id: number, newTimeISO: string): Promise<{ interview: Interview | null; delivered: boolean; deliveryError?: string }> {
  const supabase = await createClient();
  const orgId = await getOrgId();

  const newDate = new Date(newTimeISO);
  if (isNaN(newDate.getTime())) return { interview: null, delivered: false, deliveryError: "Invalid date/time" };

  const { data, error } = await supabase
    .from("interviews")
    .update({ scheduled_at: newDate.toISOString(), ai_state: "rescheduling", updated_at: new Date().toISOString() })
    .eq("id", id)
    .eq("org_id", orgId)
    .select("*, candidates(id, name, phone, country_code, email)")
    .single();

  if (error || !data) return { interview: null, delivered: false, deliveryError: "Interview not found" };

  const row = data as unknown as InterviewRowWithCandidate & { candidates: { id: string; name: string; phone: string; country_code: string; email: string } | null };
  const candidate = row.candidates;
  const slotLabel = formatSlotLabel(newDate);

  // Send the candidate the new proposed time and record it in their thread.
  let delivered = true;
  let deliveryError: string | undefined;
  if (candidate) {
    const firstName = candidate.name.split(" ")[0];
    const text = `Hi ${firstName},\n\nWe need to reschedule your interview.\n\nProposed new time:\n\n• ${slotLabel}\n\nReply YES to confirm, or let me know a time that suits you better.`;
    const conversationId = `c-${candidate.id.toLowerCase()}`;
    await supabase
      .from("conversations")
      .upsert({ id: conversationId, org_id: orgId, candidate_id: candidate.id, channel: row.channel }, { onConflict: "id" });

    let deliveryFailed = false;
    if (row.channel === "wa") {
      const sendResult = await sendWhatsAppWithTemplateFallback(
        orgId, `${candidate.country_code ?? ""}${candidate.phone}`, text, [firstName, slotLabel]
      );
      if (!sendResult.ok) { delivered = false; deliveryError = sendResult.error; deliveryFailed = true; }
    } else {
      const emailResult = await sendEmailForOrg(orgId, candidate.email, "Rescheduling your interview", text);
      if (!emailResult.ok) { delivered = false; deliveryError = emailResult.error; deliveryFailed = true; }
    }

    await supabase.from("messages").insert({
      conversation_id: conversationId,
      from_role: "schela",
      text,
      channel: row.channel,
      delivered: !deliveryFailed,
      delivery_error: deliveryFailed ? deliveryError : null,
      sender_kind: "ai",
      sender_name: "Schela",
    });
    await supabase.from("conversations").update({ updated_at: new Date().toISOString() }).eq("id", conversationId);
  }

  const interview: Interview = {
    id: row.id,
    time: formatTimeLabel(row.scheduled_at),
    group: deriveGroupLabel(row.scheduled_at),
    cand: candidate?.name ?? "Unknown",
    candId: row.candidate_id,
    jobPosition: "",
    channel: row.channel as Interview["channel"],
    aiState: row.ai_state as Interview["aiState"],
    interviewer: row.interviewer,
    handled: row.handled_by as Interview["handled"],
    duration: `${row.duration_minutes} min`,
    format: row.format,
    hour: new Date(row.scheduled_at).getHours(),
    day: new Date(row.scheduled_at).getDay(),
    scheduledAt: row.scheduled_at,
    meetingLink: row.meeting_link ?? undefined,
  };

  return { interview, delivered, deliveryError };
}

/* ============ CONVERSATIONS & MESSAGES ============ */

export async function listConversations(): Promise<Conversation[]> {
  const supabase = await createClient();
  const orgId = await getOrgId();

  const { data: convRows, error } = await supabase
    .from("conversations")
    .select("*, candidates(id, name)")
    .eq("org_id", orgId)
    .order("updated_at", { ascending: false });

  if (error) throw error;

  const conversations = (convRows ?? []) as unknown as Array<{
    id: string; candidate_id: string; channel: "wa" | "em"; unread: boolean;
    escalated: boolean; confidence: number | null; suggested_reply: string | null; escalation_reason: string | null;
    updated_at: string; candidates: { id: string; name: string } | null;
  }>;

  const results: Conversation[] = [];
  for (const c of conversations) {
    const { data: msgRows } = await supabase
      .from("messages")
      .select("*")
      .eq("conversation_id", c.id)
      .order("created_at", { ascending: true });

    const messages: Message[] = (msgRows ?? []).map((m) => ({
      from: m.from_role,
      text: m.text,
      time: formatRelativeTime(m.created_at),
      channel: (m.channel ?? undefined) as Message["channel"],
      delivered: m.delivered,
      deliveryError: m.delivery_error ?? undefined,
      senderKind: m.sender_kind,
      senderName: m.sender_name ?? undefined,
      attachmentUrl: m.attachment_url ?? undefined,
      attachmentName: m.attachment_name ?? undefined,
      attachmentType: m.attachment_type ?? undefined,
      attachmentSize: m.attachment_size ?? undefined,
    }));

    results.push({
      id: c.id,
      candId: c.candidate_id,
      candName: c.candidates?.name ?? "Unknown",
      preview: messages[messages.length - 1]?.text ?? "",
      time: formatRelativeTime(c.updated_at),
      channel: c.channel,
      unread: c.unread,
      escalated: c.escalated,
      confidence: c.confidence ?? undefined,
      messages,
      suggestedReply: c.suggested_reply ?? undefined,
      escalationReason: c.escalation_reason ?? undefined,
    });
  }
  return results;
}

export async function sendMessage(
  conversationId: string,
  text: string,
  from: "schela" | "candidate" | "system" = "schela"
): Promise<{ message: Message; delivered: boolean; deliveryError?: string; escalationResolved: boolean }> {
  const supabase = await createClient();
  const orgId = await getOrgId();

  // Ownership check before writing — conversationId comes from the client.
  const { data: conv } = await supabase
    .from("conversations")
    .select("id, channel, candidate_id")
    .eq("id", conversationId)
    .eq("org_id", orgId)
    .single();
  if (!conv) throw new Error("Conversation not found");

  // Every call site for `from: "schela"` is a human typing into the Conversations
  // composer or the Escalation reply box — never the AI itself (the AI's own
  // auto-replies go through processInbound below, tagged sender_kind 'ai').
  // Look up who's actually sending so the thread can show a real name, not
  // just "Schela" for everything the recruiter's team sends.
  let senderName: string | undefined;
  if (from === "schela") {
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (user) {
      const { data: profile } = await supabase.from("profiles").select("full_name").eq("id", user.id).single();
      senderName = profile?.full_name?.trim() || user.email?.split("@")[0] || "Admin";
    }
  }

  let delivered = true;
  let deliveryError: string | undefined;
  if (from === "schela") {
    if (conv.channel === "wa") {
      const { data: candidate } = await supabase
        .from("candidates")
        .select("phone, country_code")
        .eq("id", conv.candidate_id)
        .single();
      if (candidate) {
        const { sendWhatsAppMessage } = await import("@/lib/integrations/whatsapp");
        const creds = await getWhatsAppCredentialsForOrg(orgId);
        const sendResult = await sendWhatsAppMessage(`${candidate.country_code ?? ""}${candidate.phone}`, text, creds ?? undefined);
        if (!sendResult.ok) {
          delivered = false;
          deliveryError = sendResult.error;
        }
      } else {
        delivered = false;
        deliveryError = "Candidate has no phone number on file";
      }
    } else {
      const { data: candidate } = await supabase
        .from("candidates")
        .select("email")
        .eq("id", conv.candidate_id)
        .single();
      if (candidate?.email) {
        const emailResult = await sendEmailForOrg(orgId, candidate.email, "Regarding your interview", text);
        if (!emailResult.ok) {
          delivered = false;
          deliveryError = emailResult.error;
        }
      } else {
        delivered = false;
        deliveryError = "Candidate has no email on file";
      }
    }
  }

  const { data, error } = await supabase
    .from("messages")
    .insert({
      conversation_id: conversationId,
      from_role: from,
      text,
      channel: conv.channel,
      delivered,
      delivery_error: delivered ? null : deliveryError,
      sender_kind: from === "schela" ? "human" : from === "candidate" ? "candidate" : "system",
      sender_name: from === "schela" ? senderName : null,
    })
    .select()
    .single();
  if (error) throw error;

  // A human recruiter replying IS the human takeover — resolve the escalation:
  // clear the flag + held draft on the conversation, and mark any open action
  // items for this conversation resolved so they leave the Action Required list.
  let escalationResolved = false;
  if (from === "schela") {
    await supabase
      .from("conversations")
      .update({ updated_at: new Date().toISOString(), unread: false, escalated: false, suggested_reply: null, confidence: null })
      .eq("id", conversationId)
      .eq("org_id", orgId);

    const { count } = await supabase
      .from("action_items")
      .update({ resolved: true }, { count: "exact" })
      .eq("org_id", orgId)
      .eq("conversation_id", conversationId)
      .eq("resolved", false);
    escalationResolved = (count ?? 0) > 0;
  } else {
    await supabase
      .from("conversations")
      .update({ updated_at: new Date().toISOString(), unread: from === "candidate" })
      .eq("id", conversationId)
      .eq("org_id", orgId);
  }

  return {
    message: {
      from: data.from_role,
      text: data.text,
      time: formatRelativeTime(data.created_at),
      channel: (data.channel ?? undefined) as Message["channel"],
      delivered: data.delivered,
      deliveryError: data.delivery_error ?? undefined,
      senderKind: data.sender_kind,
      senderName: data.sender_name ?? undefined,
    },
    delivered,
    deliveryError,
    escalationResolved,
  };
}

/**
 * The one entry point real inbound WhatsApp/Email traffic (or, until that's
 * wired up, a manual test call) goes through. Creates the conversation if
 * this is the candidate's first message, stores the message, then hands off
 * to the AI orchestrator — see lib/ai/orchestrator.ts.
 */
export async function receiveInboundMessage(candidateId: string, text: string, channel: "wa" | "em") {
  const supabase = await createClient();
  const orgId = await getOrgId();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return processInbound(supabase as any, orgId, candidateId, text, channel);
}

/**
 * Same pipeline, but for callers with no user session — the WhatsApp
 * webhook (Meta's servers calling us directly) and any future email
 * inbound-parse webhook. Uses the admin client since there's no session
 * for RLS to scope against; orgId is resolved by the caller instead
 * (see app/api/webhooks/whatsapp/route.ts, which matches on phone number).
 */
export async function receiveInboundMessageForOrg(orgId: string, candidateId: string, text: string, channel: "wa" | "em") {
  const admin = createAdminClient();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return processInbound(admin as any, orgId, candidateId, text, channel);
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function processInbound(client: any, orgId: string, candidateId: string, text: string, channel: "wa" | "em") {
  const { data: candidate } = await client
    .from("candidates")
    .select("id, name, job_position, phone, country_code, email")
    .eq("id", candidateId)
    .eq("org_id", orgId)
    .single();
  if (!candidate) throw new Error("Candidate not found");

  // Identity Schela speaks with, per the Conversation Design System: the
  // hiring company as the employer, and the recruiter it assists by name.
  const { data: org } = await client.from("organizations").select("name").eq("id", orgId).single();
  const companyName: string | undefined = org?.name ?? undefined;

  const { data: recruiterProfile } = await client
    .from("profiles")
    .select("full_name")
    .eq("org_id", orgId)
    .limit(1)
    .maybeSingle();
  const recruiterName: string | undefined = recruiterProfile?.full_name?.trim() || undefined;

  // Real meeting link for this candidate's upcoming interview, if one exists.
  // Passed through so confirmations can include it; the prompt omits the line
  // entirely when it's absent rather than inventing one.
  const { data: upcoming } = await client
    .from("interviews")
    .select("meeting_link")
    .eq("org_id", orgId)
    .eq("candidate_id", candidateId)
    .order("scheduled_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  const meetingLink: string | undefined = upcoming?.meeting_link ?? undefined;

  // Real availability for this org, checked against any connected calendar.
  // Non-fatal: if this fails the AI simply won't offer times, per its prompt.
  let availableSlots: TimeSlot[] = [];
  try {
    availableSlots = await getAvailableSlotsForOrg(orgId);
  } catch (err) {
    console.error("[processInbound] couldn't load available slots:", err);
  }

  const conversationId = `c-${candidateId.toLowerCase()}`;
  await client
    .from("conversations")
    .upsert({ id: conversationId, org_id: orgId, candidate_id: candidateId, channel }, { onConflict: "id" });

  // upsert() with onConflict leaves an EXISTING row's channel untouched, so a
  // thread first created for WhatsApp would stay flagged "wa" even after the
  // candidate replies by email — showing under the wrong channel filter and
  // sending Schela's reply back out on the wrong channel. Keep it in step
  // with the channel the candidate actually just used.
  await client
    .from("conversations")
    .update({ channel })
    .eq("id", conversationId)
    .eq("org_id", orgId);

  const { data: msgRow, error: msgError } = await client
    .from("messages")
    .insert({ conversation_id: conversationId, from_role: "candidate", text, channel, sender_kind: "candidate", sender_name: candidate.name })
    .select()
    .single();
  if (msgError) throw msgError;

  await client
    .from("conversations")
    .update({ updated_at: new Date().toISOString(), unread: true })
    .eq("id", conversationId);

  // Recent turns, so the AI can resolve references like "the other slot" or
  // "as I mentioned" instead of reading every message in isolation.
  const { data: historyRows } = await client
    .from("messages")
    .select("from_role, text")
    .eq("conversation_id", conversationId)
    .order("created_at", { ascending: false })
    .limit(9);
  const history = (historyRows ?? [])
    .reverse()
    .slice(0, -1) // drop the message we just inserted; it's passed separately
    .map((m: { from_role: "schela" | "candidate" | "system"; text: string }) => ({ from: m.from_role, text: m.text }));

  const { processInboundMessage } = await import("@/lib/ai/orchestrator");

  // FAIL-SAFE: if the AI is unreachable (provider outage, timeout, missing
  // key), the previous behaviour let the error bubble to the webhook's catch,
  // which logged and returned 200 — the candidate's message sat unread with
  // no escalation and no notification, so nobody knew a reply was waiting.
  // An AI that cannot think must hand the conversation to a human, which is
  // exactly what the escalation path already does.
  let result: Awaited<ReturnType<typeof processInboundMessage>>;
  try {
    result = await processInboundMessage({
      orgId,
      conversationId,
      messageId: msgRow.id,
      messageText: text,
      context: {
        candidateName: candidate.name,
        jobPosition: candidate.job_position ?? "this role",
        channel,
        companyName,
        recruiterName,
        meetingLink,
        // Real bookable times, so the AI can answer "any other slots?" and
        // reschedule requests with actual availability instead of escalating.
        availableSlots: availableSlots.map((sl) => sl.label),
        history,
      },
    });
  } catch (err) {
    console.error("[processInbound] AI unavailable — sending holding reply:", err);
    // Even with the AI down, the candidate gets an immediate acknowledgement
    // rather than silence. No tool calls: nothing is interpreted, so nothing
    // should move. The recruiter is notified to pick it up.
    const firstName = candidate.name.split(" ")[0];
    result = {
      classification: {
        reasoning: "",
        intent: "other",
        confidence: 0,
        ambiguities: [],
        proposed_datetime: null,
        reason: "ai_unavailable",
        summary: `New message from ${candidate.name} — needs a reply.`,
      },
      action: "auto_reply",
      draftReply: `Hi ${firstName},\n\nThanks for your message.\n\nI'm looking into this and will get back to you shortly.`,
      toolCalls: [],
      escalationReason: "Schela's AI was unavailable — the candidate got a holding reply, so this needs your response.",
      draftIsSuggestionOnly: false,
    };
  }

  if (result.action === "auto_reply" && result.draftReply) {
    let deliveryFailed = false;
    let deliveryErrorMsg: string | undefined;
    if (channel === "wa") {
      const { sendWhatsAppMessage } = await import("@/lib/integrations/whatsapp");
      const phone = `${candidate.country_code ?? ""}${candidate.phone}`;
      const creds = await getWhatsAppCredentialsForOrg(orgId);
      const sendResult = await sendWhatsAppMessage(phone, result.draftReply, creds ?? undefined);
      if (!sendResult.ok) {
        console.error(`[processInbound] WhatsApp send failed for ${candidateId}:`, sendResult.error);
        deliveryFailed = true;
        deliveryErrorMsg = sendResult.error;
      }
    } else {
      const emailResult = await sendEmailForOrg(orgId, candidate.email, `Re: your interview — ${candidate.job_position ?? "your application"}`, result.draftReply);
      if (!emailResult.ok) {
        deliveryFailed = true;
        deliveryErrorMsg = emailResult.error;
      }
    }

    await client
      .from("messages")
      .insert({
        conversation_id: conversationId,
        from_role: "schela",
        text: result.draftReply,
        channel,
        delivered: !deliveryFailed,
        delivery_error: deliveryFailed ? deliveryErrorMsg : null,
        sender_kind: "ai",
        sender_name: "Schela",
      });
    await client
      .from("conversations")
      .update({ updated_at: new Date().toISOString(), escalated: false, unread: false })
      .eq("id", conversationId);

    // Act on the scheduling tools the model called — otherwise the AI "talks"
    // (drafts a reply) but never "does" (moves the interview). Tool calls are
    // only collected when the read was confident, so this is safe to run
    // unconditionally here.
    await executeSchedulingToolCalls(client, orgId, candidateId, candidate.name, conversationId, result.toolCalls);
  }

  // Schela has already replied by this point. These records are a HEADS-UP,
  // not a queue blocking the candidate: they let the recruiter follow up on
  // things Schela answered but couldn't resolve (a salary question it
  // deferred, a low-confidence read, a message it had to ask about). The
  // conversation is never left waiting on a human.
  if (result.escalationReason) {
    await client
      .from("conversations")
      .update({
        escalated: true,
        confidence: result.classification.confidence,
        escalation_reason: result.escalationReason,
      })
      .eq("id", conversationId);

    await client.from("action_items").insert({
      id: `ai-${Date.now()}`,
      org_id: orgId,
      category: result.classification.intent === "question_sensitive" ? "compensation" : "low_confidence",
      candidate_id: candidateId,
      conversation_id: conversationId,
      summary: result.classification.summary,
      confidence: result.classification.confidence,
    });

    await client.from("notifications").insert({
      org_id: orgId,
      type: "escalated",
      title: `${candidate.name} — Needs your follow-up`,
      description: `${result.classification.summary} — ${result.escalationReason}`,
      link_candidate_id: candidateId,
      link_conversation_id: conversationId,
    });
  }

  return result;
}

/**
 * Applies the AI's scheduling tool calls to real rows. Finds the candidate's
 * most recent interview and transitions it (+ the candidate's own ai_state)
 * to match what the model decided, and files the matching notification so the
 * recruiter sees it happened. Best-effort and non-fatal: a failure here must
 * never break the inbound pipeline, but it's logged rather than swallowed.
 */
async function executeSchedulingToolCalls(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  client: any,
  orgId: string,
  candidateId: string,
  candidateName: string,
  conversationId: string,
  toolCalls: { name: string; args: unknown }[]
) {
  if (!toolCalls || toolCalls.length === 0) return;

  // Map each actionable tool to the state it should drive the interview into,
  // plus the notification (if any) it should raise.
  const TRANSITIONS: Record<string, { state: string; notif?: { type: string; title: string; desc: string } }> = {
    confirm_interview: {
      state: "calendar_updated",
      notif: { type: "calendar_updated", title: `${candidateName} confirmed`, desc: "Candidate confirmed the interview time." },
    },
    reschedule_interview: {
      state: "rescheduling",
      notif: { type: "rescheduling", title: `${candidateName} rescheduling`, desc: "Candidate asked to move the interview." },
    },
    propose_slots: { state: "scheduling" },
    withdraw_application: {
      state: "withdrawn",
      notif: { type: "withdrawn", title: `${candidateName} withdrew`, desc: "Candidate withdrew their application." },
    },
  };

  // Take the first actionable tool call (the model rarely emits more than one
  // meaningful scheduling action per turn; confirm wins if both appear).
  const priority = (name: string) => (name === "withdraw_application" ? 0 : name === "confirm_interview" ? 1 : 2);
  const ordered = [...toolCalls].sort((a, b) => priority(a.name) - priority(b.name));
  const actionable = ordered.find((tc) => TRANSITIONS[tc.name]);
  if (!actionable) return;

  const transition = TRANSITIONS[actionable.name];

  try {
    const { data: iv } = await client
      .from("interviews")
      .select("id")
      .eq("org_id", orgId)
      .eq("candidate_id", candidateId)
      .order("scheduled_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (iv) {
      await client
        .from("interviews")
        .update({ ai_state: transition.state, updated_at: new Date().toISOString() })
        .eq("id", iv.id)
        .eq("org_id", orgId);
    }

    await client
      .from("candidates")
      .update({ ai_state: transition.state, updated_at: new Date().toISOString() })
      .eq("id", candidateId)
      .eq("org_id", orgId);

    if (transition.notif) {
      await client.from("notifications").insert({
        org_id: orgId,
        type: transition.notif.type,
        title: transition.notif.title,
        description: transition.notif.desc,
        link_candidate_id: candidateId,
        link_conversation_id: conversationId,
        link_interview_id: iv?.id ?? null,
      });
    }
  } catch (err) {
    console.error("[executeSchedulingToolCalls] failed:", err instanceof Error ? err.message : err);
  }
}

export interface DashboardSummary {
  actionItems: {
    id: string;
    category: string;
    candId: string;
    candName: string;
    summary: string;
    convId: string | null;
    interviewId: number | null;
  }[];
  todayInterviews: Interview[];
  activeConversations: {
    id: string;
    candId: string;
    candName: string;
    lastMessage: string;
    lastFrom: "schela" | "candidate" | "system";
    time: string;
  }[];
  featuredInterview: Interview | null;
  weekGlance: { date: string; dow: string; dots: ("mint" | "amber" | "coral")[] }[];
  performance: {
    interviewsScheduled: number;
    interviewsScheduledPrevWeek: number;
    aiConfirmedPct: number;
    aiConfirmedPctPrevWeek: number;
    avgResponseSeconds: number | null;
    hoursSaved: number;
  };
}

export async function getDashboardSummary(): Promise<DashboardSummary> {
  const supabase = await createClient();
  const orgId = await getOrgId();

  // Action required
  const { data: actionRows } = await supabase
    .from("action_items")
    .select("*, candidates(id, name)")
    .eq("org_id", orgId)
    .eq("resolved", false)
    .order("created_at", { ascending: false });

  const actionItems = (actionRows ?? []).map((a) => {
    const row = a as unknown as {
      id: string; category: string; candidate_id: string | null; summary: string;
      conversation_id: string | null; interview_id: number | null;
      candidates: { id: string; name: string } | null;
    };
    return {
      id: row.id, category: row.category, candId: row.candidate_id ?? "",
      candName: row.candidates?.name ?? "Unknown", summary: row.summary,
      convId: row.conversation_id, interviewId: row.interview_id,
    };
  });

  // Today's interviews
  const now = new Date();
  const dayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const dayEnd = new Date(dayStart);
  dayEnd.setDate(dayEnd.getDate() + 1);

  const allInterviews = await listInterviews();
  const todayInterviews = allInterviews.filter((iv) => iv.group.startsWith("TODAY"));

  // Active conversations — most recently updated, unread or recently active
  const conversations = await listConversations();
  const activeConversations = conversations.slice(0, 3).map((c) => {
    const last = c.messages[c.messages.length - 1];
    return {
      id: c.id, candId: c.candId, candName: c.candName,
      lastMessage: last?.text ?? c.preview, lastFrom: last?.from ?? "system" as const,
      time: c.time,
    };
  });

  // Featured interview for the AI Timeline widget — most recently updated
  const featuredInterview = allInterviews[0] ?? null;

  // Week glance — real interview counts + status color per day, current week (Mon-Sun)
  const dow = now.getDay();
  const mondayOffset = dow === 0 ? -6 : 1 - dow;
  const monday = new Date(dayStart);
  monday.setDate(monday.getDate() + mondayOffset);

  const DOW_LABELS = ["MON", "TUE", "WED", "THU", "FRI", "SAT", "SUN"];
  const weekGlance: DashboardSummary["weekGlance"] = [];
  for (let i = 0; i < 7; i++) {
    const d = new Date(monday);
    d.setDate(d.getDate() + i);
    const dayInterviews = allInterviews.filter((iv) => {
      // group label already carries the right relative day for this week's dates
      const ivDate = interviewDateFromGroupAndTime(iv);
      return ivDate && ivDate.toDateString() === d.toDateString();
    });
    const dots = dayInterviews.slice(0, 4).map((iv): "mint" | "amber" | "coral" => {
      if (iv.aiState === "escalated") return "coral";
      if (iv.aiState === "calendar_updated" || iv.aiState === "completed") return "mint";
      return "amber";
    });
    weekGlance.push({ date: String(d.getDate()), dow: DOW_LABELS[i], dots });
  }

  // Performance — genuinely computed, not estimated where possible
  const weekAgo = new Date(now);
  weekAgo.setDate(weekAgo.getDate() - 7);
  const twoWeeksAgo = new Date(now);
  twoWeeksAgo.setDate(twoWeeksAgo.getDate() - 14);

  const { count: thisWeekCount } = await supabase
    .from("interviews")
    .select("id", { count: "exact", head: true })
    .eq("org_id", orgId)
    .gte("created_at", weekAgo.toISOString());

  const { count: prevWeekCount } = await supabase
    .from("interviews")
    .select("id", { count: "exact", head: true })
    .eq("org_id", orgId)
    .gte("created_at", twoWeeksAgo.toISOString())
    .lt("created_at", weekAgo.toISOString());

  const { count: confirmedThisWeek } = await supabase
    .from("interviews")
    .select("id", { count: "exact", head: true })
    .eq("org_id", orgId)
    .eq("ai_state", "calendar_updated")
    .gte("created_at", weekAgo.toISOString());

  const { count: confirmedPrevWeek } = await supabase
    .from("interviews")
    .select("id", { count: "exact", head: true })
    .eq("org_id", orgId)
    .eq("ai_state", "calendar_updated")
    .gte("created_at", twoWeeksAgo.toISOString())
    .lt("created_at", weekAgo.toISOString());

  const { data: aiDecisionRows } = await supabase
    .from("ai_decisions")
    .select("created_at, message_id")
    .eq("org_id", orgId)
    .gte("created_at", weekAgo.toISOString());

  // Avg response time: time between the candidate message and the AI
  // decision logged against it. Null (not "0s") when there's no data yet —
  // an honest empty state beats a fabricated number.
  let avgResponseSeconds: number | null = null;
  if (aiDecisionRows && aiDecisionRows.length > 0) {
    const messageIds = aiDecisionRows.map((r) => r.message_id).filter((id): id is number => id !== null);
    if (messageIds.length > 0) {
      const { data: msgRows } = await supabase.from("messages").select("id, created_at").in("id", messageIds);
      const msgTimeById = new Map((msgRows ?? []).map((m) => [m.id, new Date(m.created_at).getTime()]));
      const deltas = aiDecisionRows
        .filter((r) => r.message_id !== null && msgTimeById.has(r.message_id))
        .map((r) => (new Date(r.created_at).getTime() - msgTimeById.get(r.message_id!)!) / 1000)
        .filter((s) => s >= 0);
      if (deltas.length > 0) avgResponseSeconds = Math.round(deltas.reduce((a, b) => a + b, 0) / deltas.length);
    }
  }

  const thisWeek = thisWeekCount ?? 0;
  const confirmedPct = thisWeek > 0 ? Math.round(((confirmedThisWeek ?? 0) / thisWeek) * 100) : 0;
  const prevWeek = prevWeekCount ?? 0;
  const confirmedPctPrev = prevWeek > 0 ? Math.round(((confirmedPrevWeek ?? 0) / prevWeek) * 100) : 0;

  // "Hours saved" is a stated estimate (AI-handled interviews × assumed
  // manual-coordination time), not a directly measured quantity — flagged
  // as such in the UI, not presented as a hard metric.
  const aiHandledCount = allInterviews.filter((iv) => iv.handled === "ai").length;
  const hoursSaved = Math.round(aiHandledCount * 2.5 * 10) / 10;

  return {
    actionItems, todayInterviews, activeConversations, featuredInterview, weekGlance,
    performance: {
      interviewsScheduled: thisWeek,
      interviewsScheduledPrevWeek: prevWeek,
      aiConfirmedPct: confirmedPct,
      aiConfirmedPctPrevWeek: confirmedPctPrev,
      avgResponseSeconds,
      hoursSaved,
    },
  };
}

function interviewDateFromGroupAndTime(iv: Interview): Date | null {
  // Reconstructs an approximate real Date from the display-only `group`
  // label + `time` string for weekly bucketing. Good enough for "which
  // day of the current week does this fall on," not used for anything
  // that needs second-level precision.
  const now = new Date();
  if (iv.group.startsWith("TODAY")) return now;
  if (iv.group.startsWith("TOMORROW")) { const d = new Date(now); d.setDate(d.getDate() + 1); return d; }
  const match = iv.group.match(/(\d{1,2}) (\w{3})/);
  if (!match) return null;
  const day = parseInt(match[1]);
  const monthAbbr = match[2].toUpperCase();
  const months = ["JAN", "FEB", "MAR", "APR", "MAY", "JUN", "JUL", "AUG", "SEP", "OCT", "NOV", "DEC"];
  const month = months.indexOf(monthAbbr);
  if (month === -1) return null;
  return new Date(now.getFullYear(), month, day);
}

export async function listNotifications(): Promise<AppNotification[]> {
  const supabase = await createClient();
  const orgId = await getOrgId();

  const { data, error } = await supabase
    .from("notifications")
    .select("*")
    .eq("org_id", orgId)
    .order("created_at", { ascending: false })
    .limit(50);
  if (error) throw error;

  return (data ?? []).map((n) => ({
    id: String(n.id),
    type: n.type as AppNotification["type"],
    title: n.title,
    desc: n.description,
    time: formatRelativeTime(n.created_at),
    unread: n.unread,
    linkCandId: n.link_candidate_id ?? undefined,
    linkConvId: n.link_conversation_id ?? undefined,
    linkInterviewId: n.link_interview_id ?? undefined,
  }));
}

export async function markAllNotificationsRead(): Promise<void> {
  const supabase = await createClient();
  const orgId = await getOrgId();
  await supabase.from("notifications").update({ unread: false }).eq("org_id", orgId);
}

export async function markNotificationRead(id: string): Promise<void> {
  const supabase = await createClient();
  const orgId = await getOrgId();
  await supabase.from("notifications").update({ unread: false }).eq("id", Number(id)).eq("org_id", orgId);
}

/* ============ INTEGRATIONS ============ */

/** Single source of truth for the integration catalog — also what onboarding seeds for a new org. */
export const INTEGRATION_CATALOG: { id: string; name: string; icon: string }[] = [
  { id: "whatsapp", name: "WhatsApp Business API", icon: "chat" },
  { id: "resend", name: "Resend Email", icon: "mail" },
  { id: "outlook", name: "Outlook Calendar", icon: "forward_to_inbox" },
  { id: "zoom", name: "Zoom", icon: "videocam" },
  { id: "calendly", name: "Calendly", icon: "event_available" },
];

/**
 * Makes sure every org has a row for every catalog integration, regardless of
 * whether onboarding's seed insert ran (or silently failed — see actions.ts).
 * Idempotent and cheap; safe to call on every Integrations page load.
 */
async function ensureDefaultIntegrations(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabase: any,
  orgId: string,
  existingIds: Set<string>
) {
  const missing = INTEGRATION_CATALOG.filter((i) => !existingIds.has(i.id));
  if (missing.length === 0) return;
  await supabase.from("integrations").insert(missing.map((i) => ({ ...i, org_id: orgId, connected: false })));
}

export async function listIntegrations(): Promise<Integration[]> {
  const supabase = await createClient();
  const orgId = await getOrgId();

  const { data, error } = await supabase.from("integrations").select("*").eq("org_id", orgId);
  if (error) throw error;

  // Only ever show rows for providers Schela currently offers. Without this,
  // a row left over from a removed provider (e.g. Google Calendar) falls
  // through every branch below into the generic fallback and renders as a
  // confusing half-broken card — "Connect your account to get started" next
  // to a disabled "Not yet available" button — instead of not appearing at
  // all. This makes that impossible regardless of whether the migration that
  // deletes old rows has been run yet.
  const catalogIds = new Set(INTEGRATION_CATALOG.map((c) => c.id));
  let rows = (data ?? []).filter((r) => catalogIds.has(r.id));
  const existingIds = new Set(rows.map((r) => r.id));
  if (existingIds.size < INTEGRATION_CATALOG.length) {
    await ensureDefaultIntegrations(supabase, orgId, existingIds);
    const refetch = await supabase.from("integrations").select("*").eq("org_id", orgId);
    rows = refetch.data ?? rows;
  }

  const { isWhatsAppConfigured } = await import("@/lib/integrations/whatsapp");
  const { isOAuthProviderConfigured } = await import("@/lib/integrations/oauth");
  const envWhatsAppConfigured = isWhatsAppConfigured();

  return rows.map((i) => {
    // WhatsApp: connected via an org-stored credential (Settings → Integrations)
    // OR the server-wide env vars — never a bare toggle with nothing behind it.
    if (i.id === "whatsapp") {
      const orgConfigured = Boolean(i.config?.phone_number_id && i.config?.access_token);
      const connected = orgConfigured || envWhatsAppConfigured;
      return {
        id: i.id, name: i.name, icon: i.icon, connected,
        account: connected ? (i.account ?? "Configured via environment variables") : undefined,
        lastSynced: i.last_synced ? formatRelativeTime(i.last_synced) : undefined,
      };
    }
    if (i.id === "resend") {
      const connected = Boolean(i.config?.api_key) || Boolean(process.env.RESEND_API_KEY);
      return {
        id: i.id, name: i.name, icon: i.icon, connected,
        account: connected ? (i.account ?? "Configured via environment variables") : undefined,
        lastSynced: i.last_synced ? formatRelativeTime(i.last_synced) : undefined,
      };
    }
    if (i.id === "outlook" || i.id === "zoom" || i.id === "calendly") {
      const connected = Boolean(i.config?.access_token);
      return {
        id: i.id, name: i.name, icon: i.icon, connected,
        account: connected ? (i.account ?? undefined) : undefined,
        lastSynced: i.last_synced ? formatRelativeTime(i.last_synced) : undefined,
        // Lets the UI distinguish "not connected, click to connect" from
        // "not connected because this deployment hasn't set up OAuth credentials yet."
        envConfigured: isOAuthProviderConfigured(i.id as "outlook" | "zoom" | "calendly"),
      };
    }
    return {
      id: i.id, name: i.name, icon: i.icon, connected: i.connected,
      account: i.account ?? undefined,
      lastSynced: i.last_synced ? formatRelativeTime(i.last_synced) : undefined,
    };
  });
}

/** Resolves the real WhatsApp credentials to send with for this org: its own connected account first, then env vars. */
export async function getWhatsAppCredentialsForOrg(orgId: string): Promise<{ phoneNumberId: string; accessToken: string } | null> {
  const admin = createAdminClient();
  const { data } = await admin.from("integrations").select("config").eq("org_id", orgId).eq("id", "whatsapp").single();
  const cfg = data?.config as { phone_number_id?: string; access_token?: string } | null;
  if (cfg?.phone_number_id && cfg?.access_token) {
    return { phoneNumberId: cfg.phone_number_id, accessToken: cfg.access_token };
  }
  if (process.env.WHATSAPP_PHONE_NUMBER_ID && process.env.WHATSAPP_ACCESS_TOKEN) {
    return { phoneNumberId: process.env.WHATSAPP_PHONE_NUMBER_ID, accessToken: process.env.WHATSAPP_ACCESS_TOKEN };
  }
  return null;
}

/**
 * Sends an email on behalf of an org, resolving its connected Resend key
 * (falling back to a server-wide SENDGRID_API_KEY) and its Settings →
 * Channels "from" identity. This is the real implementation behind every
 * "email sending isn't configured yet" message elsewhere in the app.
 */
export async function sendEmailForOrg(orgId: string, toEmail: string, subject: string, text: string, attachment?: { base64: string; filename: string; mime: string }): Promise<{ ok: boolean; error?: string }> {
  const admin = createAdminClient();

  const apiKey = await getResendApiKeyForOrg(orgId);
  if (!apiKey) return { ok: false, error: "Email sending isn't configured yet — connect Resend in Settings → Integrations" };

  const { data: profile } = await admin
    .from("profiles")
    .select("email_from_name, email_from_address, email_reply_to")
    .eq("org_id", orgId)
    .limit(1)
    .maybeSingle();

  // Resolution order: what the recruiter set in Settings → Channels, then the
  // deployment-wide default. The env vars are what make one shared Resend
  // account work for every org without each recruiter configuring anything.
  const fromAddress = profile?.email_from_address?.trim() || process.env.EMAIL_FROM_ADDRESS?.trim();
  const fromName = profile?.email_from_name?.trim() || process.env.EMAIL_FROM_NAME?.trim() || undefined;
  const replyTo = profile?.email_reply_to?.trim() || process.env.EMAIL_REPLY_TO?.trim() || undefined;

  // No usable sender: fail with something actionable rather than falling back
  // to a placeholder domain nobody owns, which Resend rejects every time and
  // which looks like a mysterious "email just doesn't work" bug.
  if (!fromAddress) {
    return {
      ok: false,
      error:
        "No sender address configured. Set EMAIL_FROM_ADDRESS in your environment (must be on a domain you've " +
        "verified in Resend), or set a From address in Settings → Channels.",
    };
  }

  const { sendEmail } = await import("@/lib/integrations/resend");
  return sendEmail({ apiKey, to: toEmail, from: fromAddress, fromName, replyTo, subject, text, attachment });
}

export async function connectWhatsAppCredentials(phoneNumberId: string, accessToken: string): Promise<{ ok: boolean; account?: string; error?: string }> {
  const supabase = await createClient();
  const orgId = await getOrgId();

  const { verifyWhatsAppCredentials } = await import("@/lib/integrations/whatsapp");
  const result = await verifyWhatsAppCredentials({ phoneNumberId, accessToken });
  if (!result.ok) return { ok: false, error: result.error };

  await supabase.from("integrations").upsert(
    {
      id: "whatsapp", org_id: orgId, name: "WhatsApp Business API", icon: "chat",
      connected: true, account: result.displayNumber, last_synced: new Date().toISOString(),
      config: { phone_number_id: phoneNumberId, access_token: accessToken },
    },
    { onConflict: "id,org_id" }
  );
  return { ok: true, account: result.displayNumber };
}

export async function connectResendApiKey(apiKey: string): Promise<{ ok: boolean; account?: string; error?: string }> {
  const supabase = await createClient();
  const orgId = await getOrgId();

  const { verifyResendApiKey } = await import("@/lib/integrations/resend");
  const result = await verifyResendApiKey(apiKey);
  if (!result.ok) return { ok: false, error: result.error };

  await supabase.from("integrations").upsert(
    {
      id: "resend", org_id: orgId, name: "Resend Email", icon: "mail",
      connected: true, account: result.account, last_synced: new Date().toISOString(),
      config: { api_key: apiKey },
    },
    { onConflict: "id,org_id" }
  );
  return { ok: true, account: result.account };
}

/**
 * Resolves the Resend API key to use for an org: its own connected key first,
 * then the deployment-wide RESEND_API_KEY. The env-var fallback is what lets
 * you run ONE Resend account for every recruiter, so they never need to
 * create one or paste a key themselves.
 */
export async function getResendApiKeyForOrg(orgId: string): Promise<string | null> {
  const admin = createAdminClient();
  const { data } = await admin.from("integrations").select("config").eq("org_id", orgId).eq("id", "resend").single();
  const key = (data?.config as { api_key?: string } | null)?.api_key;
  return key ?? process.env.RESEND_API_KEY ?? null;
}

export async function disconnectIntegration(id: string): Promise<boolean> {
  const supabase = await createClient();
  const orgId = await getOrgId();

  const { error } = await supabase
    .from("integrations")
    .update({ connected: false, account: null, config: null, last_synced: null })
    .eq("id", id)
    .eq("org_id", orgId);
  return !error;
}

/* ============ OAUTH-BASED INTEGRATIONS (Google Calendar, Outlook, Zoom) ============ */

export async function storeOAuthConnection(
  id: "outlook" | "zoom" | "calendly",
  orgId: string,
  tokens: { access_token: string; refresh_token?: string; expires_in?: number },
  account: string | undefined
): Promise<void> {
  const admin = createAdminClient();
  const catalogEntry = INTEGRATION_CATALOG.find((c) => c.id === id)!;
  const expiresAt = tokens.expires_in ? new Date(Date.now() + tokens.expires_in * 1000).toISOString() : null;

  await admin.from("integrations").upsert(
    {
      id, org_id: orgId, name: catalogEntry.name, icon: catalogEntry.icon,
      connected: true, account: account ?? "Connected", last_synced: new Date().toISOString(),
      config: { access_token: tokens.access_token, refresh_token: tokens.refresh_token, expires_at: expiresAt },
    },
    { onConflict: "id,org_id" }
  );
}

/* ============ CALENDLY: EVENT TYPE SELECTION ============ */

/**
 * Lists the connected Calendly account's event types, for the recruiter to
 * pick which one Schela books interviews through. Booking links can't be
 * generated without one selected.
 */
export async function listCalendlyEventTypesForOrg(orgId: string): Promise<{ ok: boolean; eventTypes?: { uri: string; name: string; durationMinutes: number }[]; selectedUri?: string; error?: string }> {
  const admin = createAdminClient();
  const token = await getOAuthAccessTokenForOrg(orgId, "calendly");
  if (!token) return { ok: false, error: "Calendly isn't connected" };

  const { getCurrentCalendlyUser, listCalendlyEventTypes } = await import("@/lib/integrations/calendly");
  const userResult = await getCurrentCalendlyUser(token);
  if (!userResult.ok || !userResult.user) return { ok: false, error: userResult.error ?? "Couldn't resolve the connected Calendly account" };

  const result = await listCalendlyEventTypes(token, userResult.user.uri);
  if (!result.ok) return { ok: false, error: result.error };

  const { data: row } = await admin.from("integrations").select("config").eq("org_id", orgId).eq("id", "calendly").single();
  const selectedUri = (row?.config as { event_type_uri?: string } | null)?.event_type_uri;

  return { ok: true, eventTypes: result.eventTypes, selectedUri };
}

export async function setCalendlyEventType(eventTypeUri: string): Promise<{ ok: boolean; error?: string }> {
  const supabase = await createClient();
  const orgId = await getOrgId();

  const { data: row } = await supabase.from("integrations").select("config").eq("org_id", orgId).eq("id", "calendly").single();
  if (!row) return { ok: false, error: "Calendly isn't connected" };

  const currentConfig = (row.config as Record<string, unknown> | null) ?? {};
  await supabase
    .from("integrations")
    .update({ config: { ...currentConfig, event_type_uri: eventTypeUri } })
    .eq("org_id", orgId)
    .eq("id", "calendly");
  return { ok: true };
}

/* ============ ANALYTICS ============ */

export interface AnalyticsSummary {
  totalInterviews: number;
  totalInterviewsPrev: number;
  aiDeflectionPct: number;
  aiDeflectionPctPrev: number;
  avgResponseSeconds: number | null;
  dailyLabels: string[];
  dailyInterviews: number[];
  dailyDeflectionPct: number[];
  weeklyChannel: { week: string; wa: number; em: number }[];
  confidenceBuckets: { label: string; count: number; zone: "coral" | "amber" | "mint" }[];
  funnel: { label: string; count: number; pct: number; color: "purple" | "mint" | "amber" | "coral" }[];
  timeToConfirm: { day: number; hours: number }[];
}

export async function getAnalyticsSummary(): Promise<AnalyticsSummary> {
  const supabase = await createClient();
  const orgId = await getOrgId();

  const now = new Date();
  const period30 = new Date(now); period30.setDate(period30.getDate() - 30);
  const period60 = new Date(now); period60.setDate(period60.getDate() - 60);
  const period7 = new Date(now); period7.setDate(period7.getDate() - 7);

  const { data: interviews30 } = await supabase
    .from("interviews").select("ai_state, handled_by, created_at, updated_at")
    .eq("org_id", orgId).gte("created_at", period30.toISOString());
  const { data: interviewsPrev30 } = await supabase
    .from("interviews").select("ai_state, handled_by")
    .eq("org_id", orgId).gte("created_at", period60.toISOString()).lt("created_at", period30.toISOString());

  const totalInterviews = interviews30?.length ?? 0;
  const totalInterviewsPrev = interviewsPrev30?.length ?? 0;
  const confirmedCount = (interviews30 ?? []).filter((iv) => iv.ai_state === "calendar_updated" || iv.ai_state === "completed").length;
  const confirmedPrevCount = (interviewsPrev30 ?? []).filter((iv) => iv.ai_state === "calendar_updated" || iv.ai_state === "completed").length;
  const aiDeflectionPct = totalInterviews > 0 ? Math.round((confirmedCount / totalInterviews) * 100) : 0;
  const aiDeflectionPctPrev = totalInterviewsPrev > 0 ? Math.round((confirmedPrevCount / totalInterviewsPrev) * 100) : 0;

  // Avg response time (same real computation as the dashboard widget)
  const { data: decisions7 } = await supabase
    .from("ai_decisions").select("created_at, message_id").eq("org_id", orgId).gte("created_at", period7.toISOString());
  let avgResponseSeconds: number | null = null;
  if (decisions7 && decisions7.length > 0) {
    const ids = decisions7.map((r) => r.message_id).filter((id): id is number => id !== null);
    if (ids.length > 0) {
      const { data: msgs } = await supabase.from("messages").select("id, created_at").in("id", ids);
      const msgTime = new Map((msgs ?? []).map((m) => [m.id, new Date(m.created_at).getTime()]));
      const deltas = decisions7
        .filter((r) => r.message_id !== null && msgTime.has(r.message_id))
        .map((r) => (new Date(r.created_at).getTime() - msgTime.get(r.message_id!)!) / 1000)
        .filter((s) => s >= 0);
      if (deltas.length > 0) avgResponseSeconds = Math.round(deltas.reduce((a, b) => a + b, 0) / deltas.length);
    }
  }

  // Daily interviews + deflection, last 7 days (real, by day of created_at)
  const dailyLabels: string[] = [];
  const dailyInterviews: number[] = [];
  const dailyDeflectionPct: number[] = [];
  for (let i = 6; i >= 0; i--) {
    const dayStart = new Date(now); dayStart.setDate(dayStart.getDate() - i); dayStart.setHours(0, 0, 0, 0);
    const dayEnd = new Date(dayStart); dayEnd.setDate(dayEnd.getDate() + 1);
    const dayRows = (interviews30 ?? []).filter((iv) => {
      const t = new Date(iv.created_at).getTime();
      return t >= dayStart.getTime() && t < dayEnd.getTime();
    });
    dailyLabels.push(["SUN", "MON", "TUE", "WED", "THU", "FRI", "SAT"][dayStart.getDay()]);
    dailyInterviews.push(dayRows.length);
    const confirmed = dayRows.filter((iv) => iv.ai_state === "calendar_updated" || iv.ai_state === "completed").length;
    dailyDeflectionPct.push(dayRows.length > 0 ? Math.round((confirmed / dayRows.length) * 100) : 0);
  }

  // Weekly channel performance, last 4 weeks (real confirm rate per channel)
  const { data: interviewsForChannel } = await supabase
    .from("interviews").select("channel, ai_state, created_at").eq("org_id", orgId).gte("created_at", period30.toISOString());
  const weeklyChannel: AnalyticsSummary["weeklyChannel"] = [];
  for (let w = 3; w >= 0; w--) {
    const wStart = new Date(now); wStart.setDate(wStart.getDate() - (w + 1) * 7);
    const wEnd = new Date(now); wEnd.setDate(wEnd.getDate() - w * 7);
    const wRows = (interviewsForChannel ?? []).filter((iv) => {
      const t = new Date(iv.created_at).getTime();
      return t >= wStart.getTime() && t < wEnd.getTime();
    });
    const rate = (channel: string) => {
      const rows = wRows.filter((r) => r.channel === channel);
      const confirmed = rows.filter((r) => r.ai_state === "calendar_updated" || r.ai_state === "completed").length;
      return rows.length > 0 ? Math.round((confirmed / rows.length) * 100) : 0;
    };
    weeklyChannel.push({ week: `W${4 - w}`, wa: rate("wa"), em: rate("em") });
  }

  // Confidence distribution — real ai_decisions confidence values, bucketed
  const { data: allDecisions } = await supabase
    .from("ai_decisions").select("confidence").eq("org_id", orgId).not("confidence", "is", null);
  const buckets = [
    { label: "<0.65", min: 0, max: 0.65, zone: "coral" as const },
    { label: "0.65–0.75", min: 0.65, max: 0.75, zone: "amber" as const },
    { label: "0.75–0.85", min: 0.75, max: 0.85, zone: "mint" as const },
    { label: "0.85–0.95", min: 0.85, max: 0.95, zone: "mint" as const },
    { label: ">0.95", min: 0.95, max: 1.01, zone: "mint" as const },
  ];
  const confidenceBuckets = buckets.map((b) => ({
    label: b.label, zone: b.zone,
    count: (allDecisions ?? []).filter((d) => (d.confidence ?? 0) >= b.min && (d.confidence ?? 0) < b.max).length,
  }));

  // Funnel — redefined around what this product actually tracks (scheduling
  // states), not a generic recruiting pipeline (screening/offer/hired) this
  // schema has no data for. Invited → Responded → Scheduled → Confirmed.
  const { count: candidateCount } = await supabase.from("candidates").select("id", { count: "exact", head: true }).eq("org_id", orgId);
  const { count: respondedCount } = await supabase
    .from("candidates").select("id", { count: "exact", head: true }).eq("org_id", orgId).neq("ai_state", "sending_invitation").neq("ai_state", "waiting_reply");
  const { count: scheduledCount } = await supabase
    .from("interviews").select("id", { count: "exact", head: true }).eq("org_id", orgId);
  const { count: confirmedFunnelCount } = await supabase
    .from("interviews").select("id", { count: "exact", head: true }).eq("org_id", orgId).in("ai_state", ["calendar_updated", "completed"]);

  const invited = candidateCount ?? 0;
  const funnel: AnalyticsSummary["funnel"] = [
    { label: "Invited", count: invited, pct: 100, color: "mint" },
    { label: "Responded", count: respondedCount ?? 0, pct: invited > 0 ? Math.round(((respondedCount ?? 0) / invited) * 100) : 0, color: "purple" },
    { label: "Scheduled", count: scheduledCount ?? 0, pct: invited > 0 ? Math.round(((scheduledCount ?? 0) / invited) * 100) : 0, color: "amber" },
    { label: "Confirmed", count: confirmedFunnelCount ?? 0, pct: invited > 0 ? Math.round(((confirmedFunnelCount ?? 0) / invited) * 100) : 0, color: "coral" },
  ];

  // Time to confirm — real hours from interview creation to its last update,
  // for interviews actually confirmed, over the last 14 created.
  const { data: confirmedInterviews } = await supabase
    .from("interviews").select("created_at, updated_at").eq("org_id", orgId)
    .in("ai_state", ["calendar_updated", "completed"]).order("created_at", { ascending: false }).limit(14);
  const timeToConfirm = (confirmedInterviews ?? []).map((iv, i) => ({
    day: i + 1,
    hours: Math.max(0.1, Math.round(((new Date(iv.updated_at).getTime() - new Date(iv.created_at).getTime()) / 3600000) * 10) / 10),
  })).reverse();

  return {
    totalInterviews, totalInterviewsPrev, aiDeflectionPct, aiDeflectionPctPrev, avgResponseSeconds,
    dailyLabels, dailyInterviews, dailyDeflectionPct, weeklyChannel, confidenceBuckets, funnel, timeToConfirm,
  };
}

/* ============ NAV BADGE COUNTS ============ */

export interface NavCounts {
  interviews: number;
  candidates: number;
  unreadConversations: number;
  /** Total conversation threads (not just unread) — used for header subtitles. */
  conversationsTotal: number;
  /** Interviews with scheduled_at inside the current Mon–Sun week. */
  interviewsThisWeek: number;
  /** Candidates created inside the current Mon–Sun week. */
  candidatesAddedThisWeek: number;
  /** Integrations currently connected (mirrors what the Integrations page shows). */
  integrationsConnected: number;
}

export async function getNavCounts(): Promise<NavCounts> {
  const supabase = await createClient();
  const orgId = await getOrgId();

  // Monday 00:00 of the current week, in the server's local time — same
  // "current week" definition used everywhere else in this file (dashboard
  // week-glance, analytics weekly channel breakdown).
  const now = new Date();
  const dayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const dow = now.getDay();
  const mondayOffset = dow === 0 ? -6 : 1 - dow;
  const monday = new Date(dayStart);
  monday.setDate(monday.getDate() + mondayOffset);

  const [interviewsRes, candidatesRes, unreadRes, conversationsRes, interviewsWeekRes, candidatesWeekRes, integrations] = await Promise.all([
    supabase.from("interviews").select("id", { count: "exact", head: true }).eq("org_id", orgId),
    supabase.from("candidates").select("id", { count: "exact", head: true }).eq("org_id", orgId),
    supabase.from("conversations").select("id", { count: "exact", head: true }).eq("org_id", orgId).eq("unread", true),
    supabase.from("conversations").select("id", { count: "exact", head: true }).eq("org_id", orgId),
    supabase.from("interviews").select("id", { count: "exact", head: true }).eq("org_id", orgId).gte("scheduled_at", monday.toISOString()),
    supabase.from("candidates").select("id", { count: "exact", head: true }).eq("org_id", orgId).gte("created_at", monday.toISOString()),
    listIntegrations(),
  ]);

  return {
    interviews: interviewsRes.count ?? 0,
    candidates: candidatesRes.count ?? 0,
    unreadConversations: unreadRes.count ?? 0,
    conversationsTotal: conversationsRes.count ?? 0,
    interviewsThisWeek: interviewsWeekRes.count ?? 0,
    candidatesAddedThisWeek: candidatesWeekRes.count ?? 0,
    integrationsConnected: integrations.filter((i) => i.connected).length,
  };
}

/* ============ SIDEBAR LIVE ACTIVITY WIDGET ============ */

export async function getLiveActivity(): Promise<{
  liveCount: number;
  recent: { icon: string; text: string; time: string }[];
}> {
  const supabase = await createClient();
  const orgId = await getOrgId();

  const { count: liveCount } = await supabase
    .from("candidates")
    .select("id", { count: "exact", head: true })
    .eq("org_id", orgId)
    .not("ai_state", "in", '("completed","escalated")');

  const { data: notifRows } = await supabase
    .from("notifications")
    .select("type, title, created_at")
    .eq("org_id", orgId)
    .order("created_at", { ascending: false })
    .limit(3);

  const ICON: Record<string, string> = {
    calendar_updated: "event_available",
    rescheduling: "history",
    reminder_sent: "schedule",
    escalated: "priority_high",
  };

  const recent = (notifRows ?? []).map((n) => ({
    icon: ICON[n.type] ?? "auto_awesome",
    text: n.title,
    time: formatRelativeTime(n.created_at),
  }));

  return { liveCount: liveCount ?? 0, recent };
}

/* ============ CANCELLATION NOTIFICATION ============ */

export async function notifyCancellation(interviewId: number, reason: string): Promise<{ notified: boolean; error?: string }> {
  const supabase = await createClient();
  const orgId = await getOrgId();

  const { data: ivRaw } = await supabase
    .from("interviews")
    .select("channel, scheduled_at, candidates(id, name, phone, country_code, email)")
    .eq("id", interviewId)
    .eq("org_id", orgId)
    .single();

  if (!ivRaw) return { notified: false, error: "Interview not found" };
  const iv = ivRaw as unknown as { channel: "wa" | "em"; scheduled_at: string; candidates: { id: string; name: string; phone: string; country_code: string; email: string } | null };
  const candidate = iv.candidates;
  if (!candidate) return { notified: false, error: "No candidate on this interview" };

  const text = `Hi ${candidate.name.split(" ")[0]},\n\nYour interview scheduled for ${new Date(iv.scheduled_at).toLocaleString()} has been cancelled due to an update from the hiring team.${reason ? `\n\nReason: ${reason}` : ""}\n\nWe'll contact you if a new slot becomes available.`;

  let result: { ok: boolean; error?: string };
  if (iv.channel === "wa") {
    const { sendWhatsAppMessage } = await import("@/lib/integrations/whatsapp");
    const creds = await getWhatsAppCredentialsForOrg(orgId);
    result = await sendWhatsAppMessage(`${candidate.country_code ?? ""}${candidate.phone}`, text, creds ?? undefined);
  } else {
    result = await sendEmailForOrg(orgId, candidate.email, "Your interview has been cancelled", text);
  }

  // Record it in the conversation thread regardless, so the recruiter can
  // see what was (or attempted to be) said, same as every other send path.
  const conversationId = `c-${candidate.id.toLowerCase()}`;
  await supabase.from("conversations").upsert({ id: conversationId, org_id: orgId, candidate_id: candidate.id, channel: iv.channel }, { onConflict: "id" });
  await supabase.from("messages").insert({
    conversation_id: conversationId,
    from_role: "schela",
    text,
    channel: iv.channel,
    delivered: result.ok,
    delivery_error: result.ok ? null : result.error,
    sender_kind: "ai",
    sender_name: "Schela",
  });

  return { notified: result.ok, error: result.error };
}

/* ============ SETTINGS ============ */

export type SettingsRow = Database["public"]["Tables"]["profiles"]["Row"];

export async function getSettings(): Promise<SettingsRow> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error("Not authenticated");

  const { data, error } = await supabase.from("profiles").select("*").eq("id", user.id).single();
  if (error) throw error;
  return data;
}

export async function updateSettings(patch: Partial<SettingsRow>): Promise<SettingsRow> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error("Not authenticated");

  // Never let the client overwrite fields it has no business touching
  // through this endpoint — org_id, onboarding_completed, id, email.
  const {
    org_id: _org_id, onboarding_completed: _onboarding_completed, id: _id, email: _email,
    created_at: _created_at, updated_at: _updated_at,
    ...safePatch
  } = patch;
  void _org_id; void _onboarding_completed; void _id; void _email; void _created_at; void _updated_at;

  const { data, error } = await supabase
    .from("profiles")
    .update({ ...safePatch, updated_at: new Date().toISOString() })
    .eq("id", user.id)
    .select("*")
    .single();
  if (error) throw error;
  return data;
}

/* ============ REMINDERS ============ */

/**
 * Sends a nudge to every candidate who's been invited but hasn't replied yet
 * (ai_state waiting_reply / sending_invitation). This is what the "Send
 * reminders" action actually does now — real WhatsApp sends recorded in each
 * thread — instead of the old fabricated "reminders sent" message.
 */
export async function sendReminders(): Promise<{ sent: number; failed: number; names: string[] }> {
  const supabase = await createClient();
  const orgId = await getOrgId();

  const { data: candidates } = await supabase
    .from("candidates")
    .select("id, name, phone, country_code, email, job_position, preferred_channel")
    .eq("org_id", orgId)
    .in("ai_state", ["waiting_reply", "sending_invitation"])
    .limit(25);

  if (!candidates || candidates.length === 0) return { sent: 0, failed: 0, names: [] };

  let sent = 0;
  let failed = 0;
  const names: string[] = [];

  for (const c of candidates) {
    const first = c.name.split(" ")[0];
    const role = c.job_position ?? "the role";
    const text = `Hi ${first},\n\nJust checking in regarding your interview invitation for ${role}.\n\nIf you're still interested, simply reply with your preferred interview slot.`;
    const channel = (c.preferred_channel ?? "wa") as "wa" | "em";
    const conversationId = `c-${c.id.toLowerCase()}`;

    await supabase
      .from("conversations")
      .upsert({ id: conversationId, org_id: orgId, candidate_id: c.id, channel }, { onConflict: "id" });

    let ok = false;
    let deliveryErrorMsg: string | undefined;
    if (channel === "wa") {
      const res = await sendWhatsAppWithTemplateFallback(
        orgId, `${c.country_code ?? ""}${c.phone}`, text, [first, role]
      );
      ok = res.ok;
      if (!res.ok) deliveryErrorMsg = res.error;
    } else {
      const res = await sendEmailForOrg(orgId, c.email, `Your interview invitation — ${role}`, text);
      ok = res.ok;
      if (!res.ok) deliveryErrorMsg = res.error;
    }

    await supabase.from("messages").insert({
      conversation_id: conversationId,
      from_role: "schela",
      text,
      channel,
      delivered: ok,
      delivery_error: ok ? null : deliveryErrorMsg,
      sender_kind: "ai",
      sender_name: "Schela",
    });
    await supabase.from("conversations").update({ updated_at: new Date().toISOString() }).eq("id", conversationId);
    await supabase.from("candidates").update({ ai_state: "reminder_sent", updated_at: new Date().toISOString() }).eq("id", c.id).eq("org_id", orgId);

    if (ok) { sent++; names.push(c.name); } else { failed++; }
  }

  await supabase.from("notifications").insert({
    org_id: orgId,
    type: "reminder_sent",
    title: `${sent} reminder${sent === 1 ? "" : "s"} sent`,
    description: names.length > 0 ? `Nudged: ${names.join(", ")}` : "No candidates were awaiting a reply.",
  });

  return { sent, failed, names };
}

/* ============ ORGANIZATION (the tenant's hiring company) ============ */

export async function getOrganization(): Promise<Organization> {
  const supabase = await createClient();
  const orgId = await getOrgId();

  const { data, error } = await supabase
    .from("organizations")
    .select("id, name, website, powered_by_schela, wa_template_name, wa_template_language")
    .eq("id", orgId)
    .single();
  if (error) throw error;

  return {
    id: data.id,
    name: data.name,
    website: data.website ?? undefined,
    poweredBySchela: data.powered_by_schela,
    waTemplateName: data.wa_template_name ?? undefined,
    waTemplateLanguage: data.wa_template_language ?? undefined,
  };
}

export async function updateOrganization(patch: { name?: string; website?: string | null; poweredBySchela?: boolean; waTemplateName?: string | null; waTemplateLanguage?: string }): Promise<Organization> {
  const supabase = await createClient();
  const orgId = await getOrgId();

  const dbPatch: Database["public"]["Tables"]["organizations"]["Update"] = { updated_at: new Date().toISOString() };
  if (typeof patch.name === "string") {
    const trimmed = patch.name.trim();
    if (!trimmed) throw new Error("Company name can't be empty");
    dbPatch.name = trimmed;
  }
  if (patch.website !== undefined) dbPatch.website = patch.website?.trim() || null;
  if (typeof patch.poweredBySchela === "boolean") dbPatch.powered_by_schela = patch.poweredBySchela;
  if (patch.waTemplateName !== undefined) dbPatch.wa_template_name = patch.waTemplateName?.trim() || null;
  if (patch.waTemplateLanguage !== undefined) dbPatch.wa_template_language = patch.waTemplateLanguage.trim() || "en_US";

  const { data, error } = await supabase
    .from("organizations")
    .update(dbPatch)
    .eq("id", orgId)
    .select("id, name, website, powered_by_schela, wa_template_name, wa_template_language")
    .single();
  if (error) throw error;

  return {
    id: data.id,
    name: data.name,
    website: data.website ?? undefined,
    poweredBySchela: data.powered_by_schela,
    waTemplateName: data.wa_template_name ?? undefined,
    waTemplateLanguage: data.wa_template_language ?? undefined,
  };
}

/* ============ INTERVIEWERS (the org's real hiring team) ============ */

export async function listInterviewers(): Promise<Interviewer[]> {
  const supabase = await createClient();
  const orgId = await getOrgId();

  const { data, error } = await supabase
    .from("interviewers")
    .select("*")
    .eq("org_id", orgId)
    .order("created_at", { ascending: true });
  if (error) throw error;

  return (data ?? []).map((row) => ({
    id: row.id,
    name: row.name,
    role: row.role ?? undefined,
    email: row.email ?? undefined,
    availability: row.availability,
  }));
}

export async function createInterviewer(input: { name: string; role?: string; email?: string }): Promise<Interviewer> {
  const supabase = await createClient();
  const orgId = await getOrgId();

  const name = input.name?.trim();
  if (!name) throw new Error("Interviewer name is required");

  const { data, error } = await supabase
    .from("interviewers")
    .insert({ org_id: orgId, name, role: input.role?.trim() || null, email: input.email?.trim() || null })
    .select("*")
    .single();
  if (error) throw error;

  return {
    id: data.id,
    name: data.name,
    role: data.role ?? undefined,
    email: data.email ?? undefined,
    availability: data.availability,
  };
}

export async function deleteInterviewer(id: string): Promise<boolean> {
  const supabase = await createClient();
  const orgId = await getOrgId();

  const { error, count } = await supabase
    .from("interviewers")
    .delete({ count: "exact" })
    .eq("id", id)
    .eq("org_id", orgId);
  if (error) return false;
  return (count ?? 0) > 0;
}

/* ============ ATTACHMENTS ============ */

/** Uploads bytes to the public attachments bucket and returns the URL Meta/Resend can fetch. */
async function uploadAttachmentBytes(
  orgId: string,
  scope: string,
  bytes: ArrayBuffer,
  filename: string,
  mime: string
): Promise<{ ok: boolean; url?: string; path?: string; error?: string }> {
  const admin = createAdminClient();
  // Random segment keeps object names unguessable, since the bucket is public.
  const safeName = filename.replace(/[^a-zA-Z0-9._-]/g, "_").slice(-80) || "file";
  const path = `${orgId}/${scope}/${Date.now()}-${Math.random().toString(36).slice(2, 10)}-${safeName}`;

  const { error } = await admin.storage.from("attachments").upload(path, bytes, { contentType: mime, upsert: false });
  if (error) {
    console.error("[attachments] upload failed:", error.message);
    return { ok: false, error: error.message };
  }

  const { data } = admin.storage.from("attachments").getPublicUrl(path);
  return { ok: true, url: data.publicUrl, path };
}

const MAX_ATTACHMENT_BYTES = 16 * 1024 * 1024; // Meta's own cap for most media types

/**
 * Sends a file to the candidate on the conversation's channel and records it
 * in the thread. Mirrors sendMessage's delivery-status handling so a failed
 * send is reported honestly rather than shown as delivered.
 */
export async function sendAttachment(
  conversationId: string,
  bytes: ArrayBuffer,
  filename: string,
  mime: string,
  caption?: string
): Promise<{ message: Message; delivered: boolean; deliveryError?: string }> {
  const supabase = await createClient();
  const orgId = await getOrgId();

  if (bytes.byteLength > MAX_ATTACHMENT_BYTES) {
    throw new Error("File is too large — 16MB maximum");
  }

  const { data: conv } = await supabase
    .from("conversations")
    .select("id, channel, candidate_id")
    .eq("id", conversationId)
    .eq("org_id", orgId)
    .single();
  if (!conv) throw new Error("Conversation not found");

  const upload = await uploadAttachmentBytes(orgId, conversationId, bytes, filename, mime);
  if (!upload.ok || !upload.url) throw new Error(upload.error ?? "Upload failed");

  // Who's sending — same rule as sendMessage: the composer is always a human.
  let senderName: string | undefined;
  const { data: { user } } = await supabase.auth.getUser();
  if (user) {
    const { data: profile } = await supabase.from("profiles").select("full_name").eq("id", user.id).single();
    senderName = profile?.full_name?.trim() || user.email?.split("@")[0] || "Admin";
  }

  let delivered = true;
  let deliveryError: string | undefined;

  if (conv.channel === "wa") {
    const { data: candidate } = await supabase
      .from("candidates").select("phone, country_code").eq("id", conv.candidate_id).single();
    if (candidate) {
      const { sendWhatsAppMedia } = await import("@/lib/integrations/whatsapp");
      const creds = await getWhatsAppCredentialsForOrg(orgId);
      const res = await sendWhatsAppMedia(
        `${candidate.country_code ?? ""}${candidate.phone}`, upload.url, mime, filename, caption, creds ?? undefined
      );
      if (!res.ok) { delivered = false; deliveryError = res.error; }
    } else {
      delivered = false; deliveryError = "Candidate has no phone number on file";
    }
  } else {
    const { data: candidate } = await supabase
      .from("candidates").select("email").eq("id", conv.candidate_id).single();
    if (candidate?.email) {
      const base64 = Buffer.from(bytes).toString("base64");
      const res = await sendEmailForOrg(
        orgId, candidate.email, caption?.trim() || `Attachment: ${filename}`, caption?.trim() || "Please find the attached file.",
        { base64, filename, mime }
      );
      if (!res.ok) { delivered = false; deliveryError = res.error; }
    } else {
      delivered = false; deliveryError = "Candidate has no email on file";
    }
  }

  const { data, error } = await supabase
    .from("messages")
    .insert({
      conversation_id: conversationId,
      from_role: "schela",
      text: caption?.trim() || "",
      channel: conv.channel,
      delivered,
      delivery_error: delivered ? null : deliveryError,
      sender_kind: "human",
      sender_name: senderName,
      attachment_url: upload.url,
      attachment_name: filename,
      attachment_type: mime,
      attachment_size: bytes.byteLength,
    })
    .select()
    .single();
  if (error) throw error;

  await supabase
    .from("conversations")
    .update({ updated_at: new Date().toISOString(), unread: false })
    .eq("id", conversationId).eq("org_id", orgId);

  return {
    message: {
      from: data.from_role,
      text: data.text,
      time: formatRelativeTime(data.created_at),
      channel: (data.channel ?? undefined) as Message["channel"],
      delivered: data.delivered,
      deliveryError: data.delivery_error ?? undefined,
      senderKind: data.sender_kind,
      senderName: data.sender_name ?? undefined,
      attachmentUrl: data.attachment_url ?? undefined,
      attachmentName: data.attachment_name ?? undefined,
      attachmentType: data.attachment_type ?? undefined,
      attachmentSize: data.attachment_size ?? undefined,
    },
    delivered,
    deliveryError,
  };
}

/**
 * Stores a file a candidate sent in. Called from the WhatsApp webhook, which
 * previously discarded every non-text message entirely.
 */
export async function receiveInboundAttachment(
  orgId: string,
  candidateId: string,
  bytes: ArrayBuffer,
  filename: string,
  mime: string,
  caption: string,
  channel: "wa" | "em"
): Promise<void> {
  const admin = createAdminClient();

  const upload = await uploadAttachmentBytes(orgId, `inbound-${candidateId}`, bytes, filename, mime);
  if (!upload.ok || !upload.url) {
    console.error("[attachments] inbound upload failed:", upload.error);
    return;
  }

  const { data: candidate } = await admin
    .from("candidates").select("name").eq("id", candidateId).eq("org_id", orgId).single();

  const conversationId = `c-${candidateId.toLowerCase()}`;
  await admin.from("conversations").upsert(
    { id: conversationId, org_id: orgId, candidate_id: candidateId, channel },
    { onConflict: "id" }
  );

  await admin.from("messages").insert({
    conversation_id: conversationId,
    from_role: "candidate",
    text: caption || "",
    channel,
    sender_kind: "candidate",
    sender_name: candidate?.name ?? null,
    attachment_url: upload.url,
    attachment_name: filename,
    attachment_type: mime,
    attachment_size: bytes.byteLength,
  });

  await admin.from("conversations")
    .update({ updated_at: new Date().toISOString(), unread: true })
    .eq("id", conversationId).eq("org_id", orgId);
}

/* ============ WHATSAPP SEND WITH TEMPLATE FALLBACK ============ */

/**
 * Sends WhatsApp text, falling back to the org's approved template when the
 * 24-hour customer-service window is closed.
 *
 * Order matters and is deliberate: free-form is tried FIRST so the existing,
 * working in-window path is completely unchanged. Only when Meta rejects it
 * for being outside the window do we attempt a template. That means an
 * ordinary reply behaves exactly as before, and cold outreach — which used to
 * simply fail — now works when a template is configured.
 */
async function sendWhatsAppWithTemplateFallback(
  orgId: string,
  toPhone: string,
  text: string,
  templateParams: string[]
): Promise<{ ok: boolean; error?: string; usedTemplate?: boolean }> {
  const { sendWhatsAppMessage, sendWhatsAppTemplate, OUTSIDE_WINDOW_ERROR_CODES } = await import("@/lib/integrations/whatsapp");
  const creds = await getWhatsAppCredentialsForOrg(orgId);

  const direct = await sendWhatsAppMessage(toPhone, text, creds ?? undefined);
  if (direct.ok) return { ok: true };

  const isWindowError =
    OUTSIDE_WINDOW_ERROR_CODES.some((code) => (direct.error ?? "").includes(String(code))) ||
    /24 hour|24-hour|outside.*window|re-?engagement|message template/i.test(direct.error ?? "");
  if (!isWindowError) return { ok: false, error: direct.error };

  const admin = createAdminClient();
  const { data: org } = await admin
    .from("organizations")
    .select("wa_template_name, wa_template_language")
    .eq("id", orgId)
    .single();

  if (!org?.wa_template_name) {
    return {
      ok: false,
      error:
        "This candidate hasn't messaged you in the last 24 hours, so WhatsApp requires an approved template. " +
        "Add one in Settings → Company → WhatsApp template.",
    };
  }

  const result = await sendWhatsAppTemplate(
    toPhone,
    org.wa_template_name,
    org.wa_template_language ?? "en_US",
    templateParams.length > 0
      ? [{ type: "body", parameters: templateParams.map((t) => ({ type: "text" as const, text: t })) }]
      : [],
    creds ?? undefined
  );

  if (!result.ok) return { ok: false, error: `Template send failed: ${result.error}` };
  return { ok: true, usedTemplate: true };
}

/* ============ SCHEDULED REMINDERS (design system templates 7 & 8) ============ */

/**
 * Sends 24-hour and 1-hour interview reminders. Called by the cron route.
 *
 * Idempotent by design: each send stamps reminder_24h_sent_at /
 * reminder_1h_sent_at, and only interviews with a null stamp are picked up,
 * so a retry or overlapping run can't double-message a candidate.
 */
export async function sendDueReminders(): Promise<{ sent24h: number; sent1h: number; failed: number }> {
  const admin = createAdminClient();
  const now = Date.now();

  const { data: interviews, error } = await admin
    .from("interviews")
    .select("id, org_id, scheduled_at, channel, meeting_link, reminder_24h_sent_at, reminder_1h_sent_at, candidates(id, name, phone, country_code, email)")
    .gte("scheduled_at", new Date(now).toISOString())
    .lte("scheduled_at", new Date(now + 25 * 60 * 60_000).toISOString())
    .in("ai_state", ["calendar_updated", "scheduling", "reminder_sent"]);

  if (error) {
    console.error("[reminders] interview lookup failed:", error.message);
    return { sent24h: 0, sent1h: 0, failed: 0 };
  }

  let sent24h = 0;
  let sent1h = 0;
  let failed = 0;

  for (const raw of interviews ?? []) {
    const iv = raw as unknown as {
      id: number; org_id: string; scheduled_at: string; channel: "wa" | "em";
      meeting_link: string | null; reminder_24h_sent_at: string | null; reminder_1h_sent_at: string | null;
      candidates: { id: string; name: string; phone: string; country_code: string; email: string } | null;
    };
    const candidate = iv.candidates;
    if (!candidate) continue;

    const minutesUntil = (new Date(iv.scheduled_at).getTime() - now) / 60_000;
    const first = candidate.name.split(" ")[0];
    const when = new Date(iv.scheduled_at);
    const dateStr = when.toLocaleDateString(undefined, { weekday: "long", month: "long", day: "numeric" });
    const timeStr = when.toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" });
    const linkLine = iv.meeting_link ? `\nMeeting Link: ${iv.meeting_link}` : "";

    let text: string | null = null;
    let stampColumn: "reminder_24h_sent_at" | "reminder_1h_sent_at" | null = null;

    // 1-hour window checked first: if both are somehow due, the more urgent wins.
    if (minutesUntil <= 60 && minutesUntil > 0 && !iv.reminder_1h_sent_at) {
      text = `Hi ${first},\n\nYour interview begins in 1 hour.${linkLine}\n\nWe wish you all the best.`;
      stampColumn = "reminder_1h_sent_at";
    } else if (minutesUntil <= 24 * 60 && minutesUntil > 60 && !iv.reminder_24h_sent_at) {
      text = `Hi ${first},\n\nReminder: Your interview is tomorrow.\n\nDate: ${dateStr}\nTime: ${timeStr}${linkLine}`;
      stampColumn = "reminder_24h_sent_at";
    }

    if (!text || !stampColumn) continue;

    let ok = false;
    if (iv.channel === "wa") {
      const res = await sendWhatsAppWithTemplateFallback(
        iv.org_id, `${candidate.country_code ?? ""}${candidate.phone}`, text, [first, `${dateStr} at ${timeStr}`]
      );
      ok = res.ok;
      if (!ok) console.error(`[reminders] interview ${iv.id} WhatsApp send failed:`, res.error);
    } else if (candidate.email) {
      const res = await sendEmailForOrg(iv.org_id, candidate.email, "Interview reminder", text);
      ok = res.ok;
      if (!ok) console.error(`[reminders] interview ${iv.id} email send failed:`, res.error);
    }

    // Stamp regardless of delivery outcome: a failed send that keeps retrying
    // every cron tick would spam the candidate if it later starts succeeding.
    await admin.from("interviews").update({ [stampColumn]: new Date().toISOString() }).eq("id", iv.id);

    const conversationId = `c-${candidate.id.toLowerCase()}`;
    await admin.from("conversations").upsert(
      { id: conversationId, org_id: iv.org_id, candidate_id: candidate.id, channel: iv.channel },
      { onConflict: "id" }
    );
    await admin.from("messages").insert({
      conversation_id: conversationId,
      from_role: "schela",
      text,
      channel: iv.channel,
      delivered: ok,
      delivery_error: ok ? null : "Reminder could not be delivered",
      sender_kind: "ai",
      sender_name: "Schela",
    });

    if (!ok) failed++;
    else if (stampColumn === "reminder_1h_sent_at") sent1h++;
    else sent24h++;
  }

  return { sent24h, sent1h, failed };
}
