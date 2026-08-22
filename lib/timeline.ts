import type { AiState, TimelineStep } from "./types";

export interface TimelineStepInfo {
  key: TimelineStep;
  label: string;
  state: "done" | "current" | "future";
}

const STEP_LABELS: Record<TimelineStep, string> = {
  created: "Interview Created",
  invitation_sent: "Invitation Sent",
  candidate_responded: "Candidate Responded",
  ai_scheduled: "AI Scheduled",
  calendar_updated: "Calendar Updated",
  reminder_sent: "Reminder Sent",
  completed: "Completed",
};

const STEP_ORDER: TimelineStep[] = [
  "created", "invitation_sent", "candidate_responded", "ai_scheduled", "calendar_updated", "reminder_sent", "completed",
];

// Index of the timeline step each AI state corresponds to being "currently on".
const STATE_TO_STEP_INDEX: Record<Exclude<AiState, "escalated" | "withdrawn">, number> = {
  sending_invitation: 1,
  waiting_reply: 2,
  scheduling: 3,
  rescheduling: 3,
  reminder_sent: 5,
  calendar_updated: 4,
  completed: 6,
};

/**
 * Computes the 7-step AI Timeline for a given interview/candidate state.
 * "escalated" and "withdrawn" are both branches, not steps on the happy path
 * — each freezes progress right after the candidate responded, since that's
 * the earliest point either can occur, and waits there rather than
 * continuing to advance through scheduling steps that no longer apply.
 */
export function computeTimeline(aiState: AiState): { steps: TimelineStepInfo[]; escalated: boolean; withdrawn: boolean } {
  if (aiState === "escalated" || aiState === "withdrawn") {
    const steps: TimelineStepInfo[] = STEP_ORDER.map((key, i) => ({
      key,
      label: STEP_LABELS[key],
      state: i <= 2 ? "done" : "future",
    }));
    return { steps, escalated: aiState === "escalated", withdrawn: aiState === "withdrawn" };
  }
  const currentIdx = STATE_TO_STEP_INDEX[aiState];
  const steps: TimelineStepInfo[] = STEP_ORDER.map((key, i) => ({
    key,
    label: STEP_LABELS[key],
    state: i < currentIdx ? "done" : i === currentIdx ? "current" : "future",
  }));
  return { steps, escalated: false, withdrawn: false };
}
