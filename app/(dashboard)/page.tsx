"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useUI } from "@/context/UIContext";
import { AiTimelineCompact } from "@/components/AiTimeline";
import StatusBadge from "@/components/StatusBadge";
import { getAvatarColorClass } from "@/lib/avatarColor";
import { ACTION_CATEGORY_LABEL, ACTION_CATEGORY_ICON } from "@/lib/data";
import type { ActionCategory } from "@/lib/types";
import type { DashboardSummary } from "@/lib/store";

const ACTION_CATEGORIES: ActionCategory[] = ["compensation", "visa", "multiple_reschedules", "candidate_unavailable", "low_confidence", "manual_approval"];
const CAT_COLOR: Record<ActionCategory, string> = {
  compensation: "amber", visa: "blue", multiple_reschedules: "amber",
  candidate_unavailable: "coral", low_confidence: "coral", manual_approval: "purple",
};

export default function DashboardPage() {
  const { openInterviewDrawer, openEscalation, openCandidateDrawer } = useUI();
  const router = useRouter();
  const [data, setData] = useState<DashboardSummary | null>(null);

  useEffect(() => {
    fetch("/api/dashboard").then((r) => r.json()).then(setData);
  }, []);

  if (!data) return null;

  const { actionItems, todayInterviews, activeConversations, featuredInterview, weekGlance, performance } = data;

  return (
    <>
      {/* Action Required — everything that needs a human decision. Everything else stays automated. */}
      <div className="card action-required-card" style={{ marginBottom: 20 }}>
        <div className="section-header" style={{ padding: "16px 18px 4px 18px" }}>
          <div className="section-title">Action required <span className="section-badge">{actionItems.length}</span></div>
          <span className="muted">Everything else is handled automatically</span>
        </div>
        <div className="action-required-grid">
          {ACTION_CATEGORIES.map((cat) => {
            const items = actionItems.filter((a) => a.category === cat);
            const first = items[0];
            return (
              <div
                key={cat}
                className={`action-cat-tile ${items.length === 0 ? "empty" : ""}`}
                onClick={() => {
                  if (!first) return;
                  if (first.convId) openEscalation(first.convId);
                  else if (first.interviewId) openInterviewDrawer(first.interviewId);
                  else openCandidateDrawer(first.candId);
                }}
              >
                <div className="action-cat-icon" style={{ background: `var(--${CAT_COLOR[cat]}-tint)`, color: `var(--${CAT_COLOR[cat]})` }}>
                  <span className="material-symbols-outlined">{ACTION_CATEGORY_ICON[cat]}</span>
                </div>
                <div className="action-cat-title">{ACTION_CATEGORY_LABEL[cat]}</div>
                <div className="action-cat-count">{items.length === 0 ? "None right now" : `${items.length} item${items.length > 1 ? "s" : ""}`}</div>
                {first && <div className="action-cat-preview">{first.candName} — {first.summary}</div>}
              </div>
            );
          })}
        </div>
      </div>

      {/* Today's Interviews + Active Conversations */}
      <div className="split-row">
        <div className="card panel">
          <div className="section-header">
            <div className="section-title">Today&apos;s interviews <span className="section-badge">{todayInterviews.length}</span></div>
            <Link className="link-arrow" href="/interviews">View all →</Link>
          </div>

          {todayInterviews.length === 0 ? (
            <div className="empty-state" style={{ padding: "30px 20px" }}>
              <span className="material-symbols-outlined">event_available</span>
              <div className="empty-state-title">Nothing scheduled today</div>
            </div>
          ) : (
            <table className="data-table">
              <thead>
                <tr><th>Time</th><th>Candidate</th><th>Channel</th><th>Status</th><th>Handled By</th></tr>
              </thead>
              <tbody>
                {todayInterviews.map((iv) => (
                  <tr key={iv.id} className={iv.aiState === "escalated" ? "row-escalated" : ""} onClick={() => openInterviewDrawer(iv.id)}>
                    <td className="cell-time">{iv.time}</td>
                    <td>
                      <div className="cell-candidate">
                        <div className={`mini-avatar ${getAvatarColorClass(iv.candId)}`}>{iv.candId}</div>
                        <div><div className="cand-name">{iv.cand}</div><div className="cand-role">{iv.jobPosition}</div></div>
                      </div>
                    </td>
                    <td>
                      <span className={`chan-pill ${iv.channel}`}>
                        <span className="material-symbols-outlined">{iv.channel === "wa" ? "chat" : "mail"}</span>
                        {iv.channel === "wa" ? "WhatsApp" : "Email"}
                      </span>
                    </td>
                    <td><StatusBadge state={iv.aiState} /></td>
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
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>

        <div className="right-col">
          <div className="card panel">
            <div className="section-header">
              <div className="section-title">Active conversations <span className="live-dot-label"><span className="dot-green" />{activeConversations.length} active</span></div>
              <Link className="link-arrow" href="/conversations">Open all →</Link>
            </div>

            {activeConversations.length === 0 ? (
              <div className="empty-state" style={{ padding: "20px" }}>
                <span className="material-symbols-outlined">forum</span>
                <div className="empty-state-title">No active conversations</div>
              </div>
            ) : (
              activeConversations.map((c) => (
                <div key={c.id} className="live-convo-item" onClick={() => router.push(`/conversations?open=${c.id}`)} style={{ cursor: "pointer" }}>
                  <div className="live-convo-avatar-wrap"><div className={`mini-avatar ${getAvatarColorClass(c.candId)}`}>{c.candId}</div><span className="live-convo-dot" /></div>
                  <div className="live-convo-body">
                    <div className="live-convo-top"><span className="live-convo-name">{c.candName}</span><span className="live-convo-time">{c.time}</span></div>
                    <div className="live-convo-msg">{c.lastMessage}</div>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      </div>

      {/* AI Timeline showcase + Calendar */}
      <div className="split-row">
        <div className="card panel" style={{ cursor: featuredInterview ? "pointer" : "default" }} onClick={() => featuredInterview && openInterviewDrawer(featuredInterview.id)}>
          <div className="section-header">
            <div className="section-title">AI Timeline</div>
            <span className="muted">Most recent</span>
          </div>
          {featuredInterview ? (
            <AiTimelineCompact aiState={featuredInterview.aiState} candName={featuredInterview.cand} />
          ) : (
            <div className="empty-state" style={{ padding: "20px" }}>
              <span className="material-symbols-outlined">auto_awesome</span>
              <div className="empty-state-title">No activity yet</div>
            </div>
          )}
        </div>

        <div className="card panel">
          <div className="section-header">
            <div className="section-title">Week at a glance <span className="muted">{weekGlance[0]?.dow} {weekGlance[0]?.date} – {weekGlance[6]?.dow} {weekGlance[6]?.date}</span></div>
            <Link className="link-arrow" href="/calendar">Full calendar →</Link>
          </div>
          <div className="week-strip">
            {weekGlance.map((day) => {
              const isToday = day.date === String(new Date().getDate()) && day.dow === weekGlance.find((d) => new Date().getDate() === Number(d.date))?.dow;
              return (
                <div className={`day-col ${isToday ? "active" : ""}`} key={day.dow}>
                  <div className="day-name">{day.dow}</div>
                  <div className="day-num">{day.date}</div>
                  <div className="day-dots">
                    {day.dots.map((color, i) => <span key={i} style={{ background: `var(--${color})` }} />)}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>

      {/* Performance Summary — condensed, not a full analytics dump */}
      <div className="card panel">
        <div className="section-header">
          <div className="section-title">This week&apos;s performance</div>
          <Link className="link-arrow" href="/analytics">Full analytics →</Link>
        </div>
        <div className="perf-summary-row">
          <div className="perf-stat">
            <div className="perf-stat-value">{performance.interviewsScheduled}</div>
            <div className="perf-stat-label">Interviews scheduled</div>
            <TrendLabel current={performance.interviewsScheduled} previous={performance.interviewsScheduledPrevWeek} suffix=" vs last week" />
          </div>
          <div className="perf-stat">
            <div className="perf-stat-value">{performance.aiConfirmedPct}%</div>
            <div className="perf-stat-label">AI-confirmed</div>
            <TrendLabel current={performance.aiConfirmedPct} previous={performance.aiConfirmedPctPrevWeek} suffix="pt vs last week" isPoints />
          </div>
          <div className="perf-stat">
            <div className="perf-stat-value">{performance.avgResponseSeconds !== null ? `${performance.avgResponseSeconds}s` : "—"}</div>
            <div className="perf-stat-label">Avg. response time</div>
            <div className="perf-stat-trend neutral">{performance.avgResponseSeconds !== null ? "AI-handled replies" : "No AI replies yet"}</div>
          </div>
          <div className="perf-stat">
            <div className="perf-stat-value">{performance.hoursSaved}h</div>
            <div className="perf-stat-label">Hours saved this week</div>
            <div className="perf-stat-trend neutral">estimated, 2.5h/interview</div>
          </div>
        </div>
      </div>
    </>
  );
}

function TrendLabel({ current, previous, suffix, isPoints }: { current: number; previous: number; suffix: string; isPoints?: boolean }) {
  const diff = current - previous;
  if (previous === 0 && current === 0) return <div className="perf-stat-trend neutral">No data last week</div>;
  const sign = diff >= 0 ? "+" : "";
  const cls = diff > 0 ? "up" : diff < 0 ? "down" : "neutral";
  return <div className={`perf-stat-trend ${cls}`}>{sign}{isPoints ? diff : diff}{suffix}</div>;
}
