import type { AiState, ActionCategory } from "./types";

/** Single source of truth for how every AI state reads and is colored across the app. */
export const AI_STATE_LABEL: Record<AiState, string> = {
  sending_invitation: "Sending Invitation",
  waiting_reply: "Waiting for Reply",
  scheduling: "Scheduling",
  rescheduling: "Rescheduling",
  reminder_sent: "Reminder Sent",
  calendar_updated: "Calendar Updated",
  escalated: "Escalated",
  completed: "Completed",
  withdrawn: "Withdrawn",
};

export const AI_STATE_ICON: Record<AiState, string> = {
  sending_invitation: "send",
  waiting_reply: "hourglass_top",
  scheduling: "auto_awesome",
  rescheduling: "history",
  reminder_sent: "schedule",
  calendar_updated: "event_available",
  escalated: "priority_high",
  completed: "task_alt",
  withdrawn: "person_off",
};

// Backwards-compatible alias used by a few older components.
export const STATUS_LABEL = AI_STATE_LABEL;

// CANDIDATES mock array removed — this app reads real data from Supabase via lib/store.ts.

// INTERVIEWS mock array removed — this app reads real data from Supabase via lib/store.ts.

// WEEK_SLOTS (a static "Mon 9am"/"Tue 3pm"... list disconnected from any real
// date) has been removed. Available interview slots are now generated for
// real — see getAvailableSlots() in lib/store.ts, which produces actual
// upcoming business-day datetimes (filtered against a connected Google
// Calendar's real free/busy when one is connected) and is served from
// /api/scheduling/slots.

// INTERVIEWERS mock list removed — interviewers are now real per-org rows
// read from Supabase (see lib/store.ts listInterviewers / the interviewers
// table). A fresh org starts with none; the recruiter adds their own team
// in Settings → Company.

export const COUNTRY_CODES = [
  { code: "+91", label: "India (+91)" },
  { code: "+1", label: "US/Canada (+1)" },
  { code: "+44", label: "United Kingdom (+44)" },
  { code: "+971", label: "UAE (+971)" },
  { code: "+65", label: "Singapore (+65)" },
  { code: "+61", label: "Australia (+61)" },
  { code: "+49", label: "Germany (+49)" },
];

export const TIME_ZONES = [
  "Asia/Kolkata (IST)",
  "Asia/Dubai (GST)",
  "Asia/Singapore (SGT)",
  "Europe/London (GMT)",
  "Europe/Berlin (CET)",
  "America/New_York (ET)",
  "America/Los_Angeles (PT)",
  "Australia/Sydney (AEST)",
];

/** Best-guess timezone for a candidate based on the country code actually picked for them — not a fixed default applied regardless of selection. */
export const TIMEZONE_BY_COUNTRY_CODE: Record<string, string> = {
  "+91": "Asia/Kolkata (IST)",
  "+1": "America/New_York (ET)",
  "+44": "Europe/London (GMT)",
  "+971": "Asia/Dubai (GST)",
  "+65": "Asia/Singapore (SGT)",
  "+61": "Australia/Sydney (AEST)",
  "+49": "Europe/Berlin (CET)",
};

/* ============ CONVERSATIONS ============ */
// CONVERSATIONS mock array removed — this app reads real data from Supabase via lib/store.ts.

/* ============ ACTION REQUIRED ============ */
export const ACTION_CATEGORY_LABEL: Record<ActionCategory, string> = {
  compensation: "Compensation Questions",
  visa: "Visa Questions",
  multiple_reschedules: "Multiple Reschedules",
  candidate_unavailable: "Candidate Unavailable",
  low_confidence: "AI Low Confidence",
  manual_approval: "Manual Approval Required",
};

export const ACTION_CATEGORY_ICON: Record<ActionCategory, string> = {
  compensation: "payments",
  visa: "flight_takeoff",
  multiple_reschedules: "history",
  candidate_unavailable: "event_busy",
  low_confidence: "help",
  manual_approval: "how_to_reg",
};

// ACTION_ITEMS mock array removed — the dashboard's Action Required workspace
// reads real rows from the action_items table (see getDashboardSummary).

// NOTIFICATIONS mock array removed — notifications are read from the
// notifications table per-org (see listNotifications).

/* ============ ASK SCHELA STARTER PROMPTS ============
 * Generic, name-free starter prompts. The old versions referenced specific
 * (mock) candidates; these work for any org because Ask Schela resolves the
 * candidate/interview from the org's real data at execution time — e.g. typing
 * "Schedule <first name>" matches a real candidate, "Move <first name> to
 * Friday" opens their real interview's reschedule flow. */
export const ASK_SCHELA_PROMPTS = [
  { icon: "notifications_active", color: "blue", text: "Send reminders", type: "action" as const },
  { icon: "priority_high", color: "coral", text: "Show today's escalations", type: "action" as const },
  { icon: "group", color: "purple", text: "Which candidates haven't replied in 48h?", type: "question" as const },
  { icon: "help", color: "mint", text: "What needs my attention right now?", type: "question" as const },
];

// Chart data and CONNECTED_INTEGRATIONS/AVAILABLE_INTEGRATIONS mock arrays removed —
// Analytics computes everything from real Supabase data (see /api/analytics),
// and Integrations reads real rows via /api/integrations.

/** Visible on the Integrations screen as a locked "coming soon" strip — communicates
 * roadmap ambition without exposing functionality in V1, per product spec. */
export const COMING_SOON_INTEGRATIONS = [
  { id: "voice", name: "AI Voice Calls", icon: "call" },
  { id: "screening", name: "AI Screening", icon: "fact_check" },
  { id: "sms", name: "SMS", icon: "sms" },
  { id: "slack", name: "Slack", icon: "tag" },
  { id: "teams", name: "Microsoft Teams", icon: "groups" },
  { id: "greenhouse", name: "Greenhouse", icon: "eco" },
  { id: "lever", name: "Lever", icon: "compare_arrows" },
  { id: "calendly", name: "Calendly", icon: "event_available" },
  { id: "bamboohr", name: "BambooHR", icon: "park" },
];
