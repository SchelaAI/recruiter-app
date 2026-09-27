const dateTimeFormatter = new Intl.DateTimeFormat("en", {
  dateStyle: "medium",
  timeStyle: "short",
});

const relativeTimeFormatter = new Intl.RelativeTimeFormat("en", { numeric: "auto" });

export function formatDateTime(value: string | null) {
  if (!value) return "Not scheduled yet";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Not scheduled yet";
  return dateTimeFormatter.format(date);
}

export function formatRelativeTime(value: string | null) {
  if (!value) return "";
  const then = new Date(value).getTime();
  const now = Date.now();
  const diffMinutes = Math.round((then - now) / 60000);
  const abs = Math.abs(diffMinutes);
  if (abs < 60) return relativeTimeFormatter.format(diffMinutes, "minute");
  const hours = Math.round(diffMinutes / 60);
  if (Math.abs(hours) < 24) return relativeTimeFormatter.format(hours, "hour");
  return relativeTimeFormatter.format(Math.round(hours / 24), "day");
}

export function initials(name: string) {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (!parts.length) return "?";
  return (parts[0][0] + (parts[1]?.[0] ?? "")).toUpperCase();
}
