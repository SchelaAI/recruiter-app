import { requireAppUser } from "@/lib/auth";
import { WorkspaceHeader } from "@/components/workspace-header";
import { initials } from "@/lib/format";
import { endOfWeek, startOfWeek } from "@/lib/ui";

const START_HOUR = 8;
const END_HOUR = 18;
const SLOT_MINUTES = 30;

export default async function CalendarPage() {
  const { supabase, profile } = await requireAppUser();
  const orgId = profile.org_id!;
  const now = new Date();
  const weekStart = startOfWeek(now);
  const weekEnd = endOfWeek(now);
  const { data: interviews } = await supabase.from("interviews").select("id,candidate_id,role_title,scheduled_at,duration_minutes,ai_state").eq("org_id", orgId).gte("scheduled_at", weekStart.toISOString()).lt("scheduled_at", weekEnd.toISOString()).order("scheduled_at");
  const ids = [...new Set((interviews ?? []).map((x) => x.candidate_id))];
  const { data: candidates } = ids.length ? await supabase.from("candidates").select("id,name").eq("org_id", orgId).in("id", ids) : { data: [] as Array<{id:string;name:string}> };
  const names = new Map((candidates ?? []).map((c) => [c.id, c.name]));
  const days = Array.from({ length: 7 }, (_, i) => { const d = new Date(weekStart); d.setDate(d.getDate() + i); return d; });
  const range = `${new Intl.DateTimeFormat("en", { month: "long", day: "numeric" }).format(weekStart)} — ${new Intl.DateTimeFormat("en", { month: "long", day: "numeric" }).format(new Date(weekEnd.getTime() - 86400000))}`;
  const slots = Array.from({ length: ((END_HOUR - START_HOUR) * 60) / SLOT_MINUTES }, (_, i) => i);

  return <div className="workspace-page">
    <WorkspaceHeader title="Calendar" subtitle={`Week of ${range} · all scheduled interviews across every candidate`} />
    <section className="workspace-card calendar-card">
      <div className="week-calendar" style={{ gridTemplateRows: `48px repeat(${slots.length}, 34px)` }}>
        <div className="calendar-corner"/>
        {days.map((day, i) => <div className={`calendar-day-head ${day.toDateString() === now.toDateString() ? "today" : ""}`} style={{ gridColumn: i + 2 }} key={day.toISOString()}><b>{new Intl.DateTimeFormat("en", { weekday: "short" }).format(day).toUpperCase()}</b><span>{day.getDate()}</span></div>)}
        {slots.map((slot) => { const minutes = START_HOUR * 60 + slot * SLOT_MINUTES; const show = minutes % 60 === 0; const hour = Math.floor(minutes / 60); return <div className="calendar-time" style={{ gridRow: slot + 2 }} key={slot}>{show ? new Intl.DateTimeFormat("en", { hour: "numeric" }).format(new Date(2020,0,1,hour)) : ""}</div>; })}
        {days.map((_, dayIndex) => slots.map((slot) => <div className="calendar-cell" key={`${dayIndex}-${slot}`} style={{ gridColumn: dayIndex + 2, gridRow: slot + 2 }}/>))}
        {(interviews ?? []).map((item) => {
          if (!item.scheduled_at) return null;
          const d = new Date(item.scheduled_at);
          const dayIndex = Math.floor((new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime() - new Date(weekStart.getFullYear(), weekStart.getMonth(), weekStart.getDate()).getTime()) / 86400000);
          const minuteOfDay = d.getHours() * 60 + d.getMinutes();
          const row = Math.max(2, Math.min(slots.length + 1, 2 + Math.floor((minuteOfDay - START_HOUR * 60) / SLOT_MINUTES)));
          const span = Math.max(1, Math.ceil((item.duration_minutes ?? 30) / SLOT_MINUTES));
          const tone = item.ai_state === "rescheduling" ? "amber" : item.ai_state === "escalated" ? "red" : item.ai_state === "calendar_updated" || item.ai_state === "completed" ? "green" : "violet";
          const name = names.get(item.candidate_id) ?? item.candidate_id;
          return <div className={`calendar-event ${tone}`} style={{ gridColumn: dayIndex + 2, gridRow: `${row} / span ${span}` }} key={item.id}><small>{new Intl.DateTimeFormat("en", { hour:"numeric", minute:"2-digit" }).format(d)}</small><b>{initials(name)} · {name}</b><span>{item.role_title ?? "Interview"}</span></div>;
        })}
      </div>
    </section>
  </div>;
}
