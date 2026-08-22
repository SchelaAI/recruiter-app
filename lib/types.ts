/**
 * Unified AI state vocabulary — used for candidates, interviews, and the AI Timeline.
 * Mirrors exactly what Schela is doing right now, so the product always reads as an
 * autonomous coordinator rather than a static records system.
 */
export type AiState =
  | "sending_invitation"
  | "waiting_reply"
  | "scheduling"
  | "rescheduling"
  | "reminder_sent"
  | "calendar_updated"
  | "escalated"
  | "completed"
  | "withdrawn";

export type Channel = "wa" | "em";

export interface Candidate {
  id: string;
  name: string;
  jobPosition: string;
  countryCode: string;
  phone: string;
  email: string;
  preferredChannel: Channel;
  timeZone: string;
  notes?: string;
  aiState: AiState;
  active: string;
  score: number;
}

export interface Message {
  from: "schela" | "candidate" | "system";
  text: string;
  time: string;
  channel?: Channel;
  /** False when a send genuinely failed (e.g. WhatsApp not configured). Never spliced into `text`. */
  delivered?: boolean;
  deliveryError?: string;
  /** Who actually authored an outbound message — the AI auto-replying, or a human recruiter typing it. */
  senderKind?: "ai" | "human" | "candidate" | "system";
  /** Display name for the sender — "Schela" for AI, the recruiter's real name for human-sent messages. */
  senderName?: string;
  /** Public URL of an attached file, when the message carries one. */
  attachmentUrl?: string;
  attachmentName?: string;
  attachmentType?: string;
  attachmentSize?: number;
}

export interface Conversation {
  id: string;
  candId: string;
  candName: string;
  preview: string;
  time: string;
  channel: Channel;
  unread: boolean;
  escalated: boolean;
  confidence?: number;
  messages: Message[];
  suggestedReply?: string;
  /** Plain-language reason a human was pulled in — sensitive topic, ambiguity, low confidence, or AI outage. */
  escalationReason?: string;
}

export type NotificationType = "escalated" | "calendar_updated" | "rescheduling" | "reminder_sent";

export interface AppNotification {
  id: string;
  type: NotificationType;
  title: string;
  desc: string;
  time: string;
  unread: boolean;
  linkCandId?: string;
  linkConvId?: string;
  linkInterviewId?: number;
}

export interface Integration {
  id: string;
  name: string;
  icon: string;
  connected: boolean;
  account?: string;
  lastSynced?: string;
  /** For OAuth-based integrations (outlook/zoom): whether this deployment has the provider's client id/secret configured at all. */
  envConfigured?: boolean;
}

/** The tenant's hiring company. `name` is the brand candidates see — never "Schela". */
export interface Organization {
  id: string;
  name: string;
  website?: string;
  poweredBySchela: boolean;
  /** Name of the org's Meta-approved WhatsApp template, used for first contact outside the 24h window. */
  waTemplateName?: string;
  waTemplateLanguage?: string;
}

/** A real member of the org's hiring team. Replaces the old hardcoded interviewer list. */
export interface Interviewer {
  id: string;
  name: string;
  role?: string;
  email?: string;
  availability: "available" | "busy" | "away";
}

export interface Interview {
  id: number;
  time: string;
  group: string;
  cand: string;
  candId: string;
  jobPosition: string;
  channel: Channel;
  aiState: AiState;
  interviewer: string;
  handled: "ai" | "you";
  duration: string;
  format: string;
  hour: number;
  day: number;
  scheduledAt: string;
  /** Real Google Meet (or other) link, set only once a calendar event actually got created — not a placeholder. */
  meetingLink?: string;
}

/** The 7-step AI Timeline every interview progresses through. */
export type TimelineStep =
  | "created"
  | "invitation_sent"
  | "candidate_responded"
  | "ai_scheduled"
  | "calendar_updated"
  | "reminder_sent"
  | "completed";

/** The 6 categories that land in the Action Required workspace — everything else stays automated. */
export type ActionCategory =
  | "compensation"
  | "visa"
  | "multiple_reschedules"
  | "candidate_unavailable"
  | "low_confidence"
  | "manual_approval";

export interface ActionItem {
  id: string;
  category: ActionCategory;
  candId: string;
  candName: string;
  convId?: string;
  interviewId?: number;
  summary: string;
  time: string;
  confidence?: number;
}
