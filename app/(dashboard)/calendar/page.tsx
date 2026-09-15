"use client";

import { useEffect, useMemo, useState } from "react";
import { useUI } from "@/context/UIContext";
import { AI_STATE_LABEL } from "@/lib/data";
import type { Interview } from "@/lib/types";

const DOW_SHORT = ["S", "M", "T", "W", "T", "F", "S"];
const DOW_FULL = ["SUN", "MON", "TUE", "WED", "THU", "FRI", "SAT"];
const MONTH_NAMES = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
const HOURS = Array.from({ length: 11 }, (_, i) => i + 8);

function sameDay(a: Date, b: Date) {
  return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
}
function startOfWeek(d: Date) {
  const day = d.getDay();
  const diff = day === 0 ? -6 : 1 - day;
  const s = new Date(d);
  s.setDate(s.getDate() + diff);
  s.setHours(0, 0, 0, 0);
  return s;
}
function buildMonthGrid(year: number, month: number) {
  const first = new Date(year, month, 1);
  const leadPad = first.getDay() === 0 ? 6 : first.getDay() - 1; // Monday-first grid
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const daysInPrevMonth = new Date(year, month, 0).getDate();
  const days: { date: number; muted: boolean; full: Date }[] = [];
  for (let i = leadPad - 1; i >= 0; i--) days.push({ date: daysInPrevMonth - i, muted: true, full: new Date(year, month - 1, daysInPrevMonth - i) });
  for (let d = 1; d <= daysInMonth; d++) days.push({ date: d, muted: false, full: new Date(year, month, d) });
  let next = 1;
  while (days.length < 42) days.push({ date: next, muted: true, full: new Date(year, month + 1, next++) });
  return days;
}

export default function CalendarPage() {
  const { openInterviewDrawer, openWizard } = useUI();
  const [view, setView] = useState<"day" | "week" | "month">("week");
  const [cursor, setCursor] = useState(new Date());
  const [expandedDay, setExpandedDay] = useState<string | null>(null);
  const [interviews, setInterviews] = useState<Interview[]>([]);
  const today = useMemo(() => new Date(), []);

  useEffect(() => {
    fetch("/api/interviews").then((r) => r.json()).then((d) => setInterviews(d.interviews ?? []));
  }, []);

  const monthDays = useMemo(() => buildMonthGrid(cursor.getFullYear(), cursor.getMonth()), [cursor]);
  const weekStart = useMemo(() => startOfWeek(cursor), [cursor]);
  const weekDays = useMemo(() => Array.from({ length: 7 }, (_, i) => { const d = new Date(weekStart); d.setDate(d.getDate() + i); return d; }), [weekStart]);
  const displayDays = view === "day" ? [cursor] : weekDays;

  const eventsByDate = useMemo(() => {
    const map = new Map<string, Interview[]>();
    for (const iv of interviews) {
      const key = new Date(iv.scheduledAt).toDateString();
      if (!map.has(key)) map.set(key, []);
      map.get(key)!.push(iv);
    }
    return map;
  }, [interviews]);

  function navigate(delta: number) {
    const next = new Date(cursor);
    if (view === "month") next.setMonth(next.getMonth() + delta);
    else if (view === "day") next.setDate(next.getDate() + delta);
    else next.setDate(next.getDate() + delta * 7);
    setCursor(next);
  }

  const rangeLabel =
    view === "month"
      ? `${MONTH_NAMES[cursor.getMonth()]} ${cursor.getFullYear()}`
      : view === "day"
      ? `${DOW_FULL[cursor.getDay()]}, ${MONTH_NAMES[cursor.getMonth()]} ${cursor.getDate()}`
      : `${MONTH_NAMES[weekStart.getMonth()].slice(0, 3)} ${weekStart.getDate()} – ${weekDays[6].getDate()}, ${weekDays[6].getFullYear()}`;

  return (
    <div className="cal-layout">
      <div className="card cal-mini-card">
        <div className="cal-mini-head">
          <span className="cal-mini-title">{MONTH_NAMES[cursor.getMonth()]} {cursor.getFullYear()}</span>
          <div className="cal-mini-nav">
            <span className="material-symbols-outlined" onClick={() => navigate(-1)} style={{ cursor: "pointer" }}>chevron_left</span>
            <span className="material-symbols-outlined" onClick={() => navigate(1)} style={{ cursor: "pointer" }}>chevron_right</span>
          </div>
        </div>
        <div className="cal-mini-grid">
          {DOW_SHORT.map((d, i) => <div key={i} className="cal-mini-dow">{d}</div>)}
          {monthDays.map((d, i) => (
            <div
              key={i}
              className={`cal-mini-cell ${d.muted ? "muted" : ""} ${sameDay(d.full, today) ? "today" : ""}`}
              style={{ cursor: d.muted ? "default" : "pointer" }}
              onClick={() => { if (!d.muted) { setCursor(d.full); setView("day"); } }}
            >
              {d.date}
              {!d.muted && eventsByDate.has(d.full.toDateString()) && <span className="cal-mini-dot" />}
            </div>
          ))}
        </div>
      </div>

      <div className="card panel">
        <div className="cal-main-head">
          <div className="cal-main-nav">
            <span className="material-symbols-outlined" onClick={() => navigate(-1)} style={{ cursor: "pointer" }}>chevron_left</span>
            <span className="cal-range-label">{rangeLabel}</span>
            <span className="material-symbols-outlined" onClick={() => navigate(1)} style={{ cursor: "pointer" }}>chevron_right</span>
            <button className="btn btn-outline" style={{ padding: "5px 11px", fontSize: 11, marginLeft: 8 }} onClick={() => setCursor(new Date())}>Today</button>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
            <div className="range-toggle">
              {(["day", "week", "month"] as const).map((v) => (
                <div key={v} className={`range-pill ${view === v ? "active" : ""}`} onClick={() => setView(v)}>
                  {v[0].toUpperCase() + v.slice(1)}
                </div>
              ))}
            </div>
          </div>
        </div>

        {view === "month" ? (
          <div className="cal-month-grid">
            {DOW_FULL.map((d, i) => <div key={i} className="cal-month-dow">{d}</div>)}
            {monthDays.map((d, i) => {
              const events = !d.muted ? eventsByDate.get(d.full.toDateString()) ?? [] : [];
              const dayKey = d.full.toDateString();
              const shown = expandedDay === dayKey ? events : events.slice(0, 3);
              return (
                <div key={i} className={`cal-month-cell ${d.muted ? "muted" : ""}`}>
                  <div className={`cal-month-date ${sameDay(d.full, today) ? "today" : ""}`}>{d.date}</div>
                  {shown.map((iv) => {
                    const cls = iv.aiState === "calendar_updated" || iv.aiState === "completed" ? "confirmed" : iv.aiState === "escalated" ? "escalated" : "pending";
                    return (
                      <div key={iv.id} className={`cal-month-pill ${cls}`} onClick={() => openInterviewDrawer(iv.id)}>
                        {iv.cand.split(" ")[0]} · {iv.time}
                      </div>
                    );
                  })}
                  {events.length > 3 && expandedDay !== dayKey && (
                    <div className="cal-month-more" onClick={() => setExpandedDay(dayKey)}>+{events.length - 3} more</div>
                  )}
                </div>
              );
            })}
          </div>
        ) : (
          <div className="cal-week-grid">
            <div className="cal-week-head">
              <div />
              {displayDays.map((d) => (
                <div key={d.toDateString()} className={sameDay(d, today) ? "today-head" : ""}>
                  {DOW_FULL[d.getDay()]} {d.getDate()}
                </div>
              ))}
            </div>
            {HOURS.map((h) => (
              <div key={h} style={{ display: "contents" }}>
                <div className="cal-hour-label">{h > 12 ? h - 12 : h}{h >= 12 ? "pm" : "am"}</div>
                {displayDays.map((day) => {
                  const dayEvents = (eventsByDate.get(day.toDateString()) ?? []).filter((iv) => Math.floor(iv.hour) === h);
                  return (
                    <div key={day.toDateString()} className="cal-day-col" onClick={() => openWizard()}>
                      {dayEvents.map((iv) => {
                        const offsetMin = (iv.hour % 1) * 56;
                        const durMin = parseInt(iv.duration) || 45;
                        const height = Math.max(24, (durMin / 60) * 56 - 3);
                        const cls = iv.aiState === "calendar_updated" || iv.aiState === "completed" ? "confirmed" : iv.aiState === "escalated" ? "escalated" : "pending";
                        return (
                          <div
                            key={iv.id}
                            className={`cal-event ${cls} tt`}
                            data-tooltip={`${iv.cand} · ${iv.jobPosition} · ${AI_STATE_LABEL[iv.aiState]}`}
                            style={{ top: offsetMin, height }}
                            onClick={(e) => { e.stopPropagation(); openInterviewDrawer(iv.id); }}
                          >
                            <span className="cal-event-time">{iv.time}</span>
                            {iv.cand.split(" ")[0]}
                          </div>
                        );
                      })}
                    </div>
                  );
                })}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
