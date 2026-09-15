"use client";

import { Suspense, useEffect, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import { useUI } from "@/context/UIContext";
import { AI_STATE_LABEL } from "@/lib/data";
import { getAvatarColorClass } from "@/lib/avatarColor";
import StatusBadge from "@/components/StatusBadge";
import type { Interview } from "@/lib/types";

const DAYS = ["MON 7", "TUE 8", "WED 9", "THU 10", "FRI 11", "SAT 12", "SUN 13"];
const HOURS = Array.from({ length: 11 }, (_, i) => i + 8); // 8am - 6pm

function calEventClass(aiState: Interview["aiState"]) {
  if (aiState === "escalated") return "escalated";
  if (aiState === "calendar_updated" || aiState === "completed") return "confirmed";
  return "pending";
}

function InterviewsInner() {
  const { openInterviewDrawer } = useUI();
  const searchParams = useSearchParams();
  const initialFilter = searchParams.get("filter");
  const [interviews, setInterviews] = useState<Interview[] | null>(null);
  const [view, setView] = useState<"list" | "calendar">("list");
  const [filter, setFilter] = useState<"all" | "action" | "automated">(
    initialFilter === "action" || initialFilter === "automated" ? initialFilter : "all"
  );

  useEffect(() => {
    let cancelled = false;
    fetch("/api/interviews")
      .then((res) => res.json())
      .then((data) => { if (!cancelled) setInterviews(data.interviews); });
    return () => { cancelled = true; };
  }, []);

  const loaded = interviews !== null;

  const filtered = useMemo(() => {
    if (!interviews) return [];
    if (filter === "action") return interviews.filter((iv) => iv.aiState === "escalated");
    if (filter === "automated") return interviews.filter((iv) => iv.aiState !== "escalated" && iv.handled === "ai");
    return interviews;
  }, [interviews, filter]);

  const groups = useMemo(() => {
    const map = new Map<string, Interview[]>();
    filtered.forEach((iv) => {
      if (!map.has(iv.group)) map.set(iv.group, []);
      map.get(iv.group)!.push(iv);
    });
    return Array.from(map.entries());
  }, [filtered]);

  return (
    <div className="card panel">
      <div className="section-header">
        <div className="section-title">All interviews <span className="section-badge">{interviews?.length ?? "…"}</span></div>
        <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
          <div className="filter-pills">
            <span className={`filter-pill ${filter === "all" ? "active" : ""}`} onClick={() => setFilter("all")}>All</span>
            <span className={`filter-pill ${filter === "action" ? "active" : ""}`} onClick={() => setFilter("action")}>Needs you</span>
            <span className={`filter-pill ${filter === "automated" ? "active" : ""}`} onClick={() => setFilter("automated")}>AI-handled</span>
          </div>
          <div className="view-toggle">
            <div className={`view-toggle-btn ${view === "list" ? "active" : ""}`} onClick={() => setView("list")}>
              <span className="material-symbols-outlined">view_list</span>
            </div>
            <div className={`view-toggle-btn ${view === "calendar" ? "active" : ""}`} onClick={() => setView("calendar")}>
              <span className="material-symbols-outlined">calendar_view_week</span>
            </div>
          </div>
        </div>
      </div>

      {!loaded && (
        <div>
          <div className="skel-row" /><div className="skel-row" /><div className="skel-row" /><div className="skel-row" />
        </div>
      )}

      {loaded && view === "list" && groups.length > 0 && (
        <div>
          {groups.map(([group, items]) => (
            <div key={group}>
              <div className="date-group-label">{group}</div>
              <table className="data-table">
                <thead>
                  <tr><th>Time</th><th>Candidate</th><th>Position</th><th>Channel</th><th>AI State</th><th>Interviewer</th><th>Handled By</th><th></th></tr>
                </thead>
                <tbody>
                  {items.map((iv) => (
                    <tr key={iv.id} className={iv.aiState === "escalated" ? "row-escalated" : ""} onClick={() => openInterviewDrawer(iv.id)}>
                      <td className="cell-time">{iv.time}</td>
                      <td><div className="cell-candidate"><div className={`mini-avatar ${getAvatarColorClass(iv.candId)}`}>{iv.candId}</div><div className="cand-name">{iv.cand}</div></div></td>
                      <td style={{ fontSize: 12, color: "var(--slate)" }}>{iv.jobPosition}</td>
                      <td>
                        <span className={`chan-pill ${iv.channel}`}>
                          <span className="material-symbols-outlined">{iv.channel === "wa" ? "chat" : "mail"}</span>
                          {iv.channel === "wa" ? "WhatsApp" : "Email"}
                        </span>
                      </td>
                      <td><StatusBadge state={iv.aiState} /></td>
                      <td style={{ fontSize: 12, color: "var(--slate)" }}>{iv.interviewer}</td>
                      <td className="handled-cell">
                        <div className="handled-inner">
                          {iv.handled === "ai" ? (
                            <span className="handled-default"><span className="material-symbols-outlined">auto_awesome</span>AI</span>
                          ) : (
                            <span className="handled-you">You</span>
                          )}
                          <span className="open-btn"><span className="material-symbols-outlined" style={{ fontSize: 13 }}>open_in_new</span>Open</span>
                        </div>
                      </td>
                      <td></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ))}
        </div>
      )}

      {loaded && view === "list" && groups.length === 0 && (
        <div className="empty-state">
          <span className="material-symbols-outlined">event_available</span>
          <div className="empty-state-title">Nothing here</div>
          <div className="empty-state-sub">No interviews match this filter right now.</div>
        </div>
      )}

      {loaded && view === "calendar" && (
        <div className="cal-week-grid">
          <div className="cal-week-head">
            <div />
            {DAYS.map((d, i) => <div key={d} className={i === 2 ? "today-head" : ""}>{d}</div>)}
          </div>
          {HOURS.map((h) => (
            <div key={h} style={{ display: "contents" }}>
              <div className="cal-hour-label">{h > 12 ? h - 12 : h}{h >= 12 ? "pm" : "am"}</div>
              {DAYS.map((_, dayIdx) => (
                <div key={dayIdx} className="cal-day-col">
                  {filtered.filter((iv) => Math.floor(iv.hour) === h && iv.day === dayIdx).map((iv) => {
                    const offsetMin = (iv.hour % 1) * 56;
                    const durMin = parseInt(iv.duration) || 45;
                    const height = Math.max(24, (durMin / 60) * 56 - 3);
                    return (
                      <div
                        key={iv.id}
                        className={`cal-event ${calEventClass(iv.aiState)} tt`}
                        data-tooltip={`${iv.cand} · ${iv.jobPosition} · ${AI_STATE_LABEL[iv.aiState]}`}
                        style={{ top: offsetMin, height }}
                        onClick={() => openInterviewDrawer(iv.id)}
                      >
                        <span className="cal-event-time">{iv.time}</span>
                        {iv.cand.split(" ")[0]}
                      </div>
                    );
                  })}
                </div>
              ))}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

export default function InterviewsPage() {
  return (
    <Suspense fallback={<div className="card panel" />}>
      <InterviewsInner />
    </Suspense>
  );
}
