export function interviewStatusLabel(state: string | null | undefined, scheduledAt?: string | null) {
  if (scheduledAt && state !== "rescheduling" && state !== "escalated") return "Confirmed";
  switch (state) {
    case "sending_invitation": return "Invited";
    case "waiting_reply": return "Awaiting Reply";
    case "scheduling": return "Scheduling";
    case "rescheduling": return "Rescheduling";
    case "reminder_sent": return "Confirmed";
    case "calendar_updated": return "Confirmed";
    case "escalated": return "Escalated";
    case "completed": return "Completed";
    default: return "Invited";
  }
}

export function statusTone(state: string | null | undefined, scheduledAt?: string | null) {
  const label = interviewStatusLabel(state, scheduledAt);
  if (["Confirmed", "Completed"].includes(label)) return "green";
  if (["Rescheduling", "Scheduling"].includes(label)) return "amber";
  if (label === "Escalated") return "red";
  return "violet";
}

export function formatShortTime(value: string | null) {
  if (!value) return "—";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return "—";
  return new Intl.DateTimeFormat("en", { hour: "numeric", minute: "2-digit" }).format(d);
}

export function formatShortDate(value: string | null) {
  if (!value) return "Unscheduled";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return "Unscheduled";
  const today = new Date();
  const startToday = new Date(today.getFullYear(), today.getMonth(), today.getDate()).getTime();
  const startTarget = new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
  const days = Math.round((startTarget - startToday) / 86400000);
  if (days === 0) return "Today";
  if (days === 1) return "Tomorrow";
  return new Intl.DateTimeFormat("en", { weekday: "short", month: "short", day: "numeric" }).format(d);
}

export function startOfWeek(date = new Date()) {
  const d = new Date(date);
  const day = d.getDay();
  const diff = day === 0 ? -6 : 1 - day;
  d.setDate(d.getDate() + diff);
  d.setHours(0, 0, 0, 0);
  return d;
}

export function endOfWeek(date = new Date()) {
  const start = startOfWeek(date);
  const end = new Date(start);
  end.setDate(start.getDate() + 7);
  return end;
}
