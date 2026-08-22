"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useUI } from "@/context/UIContext";
import { AiTimelineVertical } from "@/components/AiTimeline";
import StatusBadge from "@/components/StatusBadge";
import type { Conversation } from "@/lib/types";

export default function InterviewDrawer() {
  const { interviewDrawerId, selectedInterview, closeInterviewDrawer, openReschedule, openCancel } = useUI();
  const router = useRouter();

  const open = !!interviewDrawerId && !!selectedInterview;
  const iv = selectedInterview;

  const [messages, setMessages] = useState<Conversation["messages"] | null>(null);

  useEffect(() => {
    if (!iv) { setMessages(null); return; }
    setMessages(null);
    fetch("/api/conversations")
      .then((r) => r.json())
      .then((d) => {
        const conv = (d.conversations ?? []).find((c: Conversation) => c.candId === iv.candId);
        setMessages(conv?.messages ?? []);
      })
      .catch(() => setMessages([]));
  }, [iv]);

  if (!iv) {
    return <div className="overlay-bg" />;
  }

  function goToConversation() {
    const convId = `c-${iv!.candId.toLowerCase()}`;
    closeInterviewDrawer();
    router.push(`/conversations?open=${convId}`);
  }

  const recentMessages = (messages ?? []).slice(-3);

  return (
    <>
      <div className={`overlay-bg ${open ? "show" : ""}`} onClick={closeInterviewDrawer} />
      <div className={`drawer ${open ? "show" : ""}`}>
        <div className="drawer-header">
          <div className="drawer-header-top">
            <div style={{ display: "flex", gap: 12 }}>
              <div className="drawer-avatar">{iv.candId}</div>
              <div>
                <div className="drawer-name">{iv.cand}</div>
                <div className="drawer-role">{iv.jobPosition}</div>
              </div>
            </div>
            <span className="close-x" onClick={closeInterviewDrawer}>
              <span className="material-symbols-outlined">close</span>
            </span>
          </div>
          <StatusBadge state={iv.aiState} className="drawer-status-badge" />
        </div>

        <div className="drawer-body">
          <div className="detail-card">
            <div className="detail-row"><span>Time</span><b>{iv.group.split("·")[1]?.trim()} · {iv.time}</b></div>
            <div className="detail-row"><span>Duration</span><b>{iv.duration}</b></div>
            <div className="detail-row"><span>Format</span><b>{iv.format}</b></div>
            <div className="detail-row" style={{ borderTop: "1px solid var(--border-soft)", marginTop: 4, paddingTop: 10 }}>
              {iv.format === "Phone" ? (
                <span style={{ fontSize: 12, color: "var(--muted)" }}>Phone interview — no meeting link needed</span>
              ) : (
                <span style={{ fontSize: 12, color: "var(--muted)" }}>
                  <span className="material-symbols-outlined" style={{ fontSize: 15, verticalAlign: -3 }}>link_off</span>{" "}
                  Link not generated yet — connect {iv.format === "Zoom" ? "Zoom" : "Google Calendar"} in Integrations
                </span>
              )}
            </div>
          </div>
          <div className="detail-row" style={{ marginBottom: 18 }}>
            <span>Interviewer</span>
            <div style={{ display: "flex", alignItems: "center", gap: 7 }}>
              <div className="mini-avatar" style={{ width: 24, height: 24, fontSize: 9 }}>
                {iv.interviewer.split(" ").map((w) => w[0]).join("")}
              </div>
              <b>{iv.interviewer}</b>
            </div>
          </div>

          <div className="section-title" style={{ marginBottom: 10 }}>AI Timeline</div>
          <AiTimelineVertical aiState={iv.aiState} />

          <div className="section-title" style={{ marginTop: 18, marginBottom: 10 }}>Recent messages</div>
          <div className="msg-preview">
            {messages === null ? (
              <div style={{ fontSize: 11.5, color: "var(--muted)", padding: "4px 0" }}>Loading…</div>
            ) : recentMessages.length === 0 ? (
              <div style={{ fontSize: 11.5, color: "var(--muted)", padding: "4px 0" }}>No messages yet — the invitation hasn&apos;t gone out or the candidate hasn&apos;t replied.</div>
            ) : (
              recentMessages.map((m, i) => (
                <div key={i}>
                  {m.from === "schela" && (
                    <div className="conv-msg-sender" style={{ justifyContent: "flex-end", marginBottom: 2 }}>
                      <span className="material-symbols-outlined">{m.senderKind === "ai" ? "auto_awesome" : "person"}</span>
                      {m.senderKind === "ai" ? "Schela · AI" : m.senderName || "Admin"}
                    </div>
                  )}
                  <div className={`msg-bubble ${m.from === "schela" ? "right" : "left"} ${m.channel ?? ""}`}>
                    {m.text}
                    {m.delivered === false && (
                      <span className="not-delivered-tag" title={m.deliveryError ?? "Delivery failed"}>
                        <span className="material-symbols-outlined">error</span>Not delivered
                      </span>
                    )}
                  </div>
                </div>
              ))
            )}
          </div>
        </div>

        <div className="drawer-footer wrap">
          <button className="btn btn-amber-outline" onClick={openReschedule}><span className="material-symbols-outlined">history</span>Reschedule</button>
          <button className="btn btn-coral-outline" onClick={openCancel}><span className="material-symbols-outlined">close</span>Cancel</button>
          {iv.meetingLink ? (
            <a className="btn btn-mint-outline" href={iv.meetingLink} target="_blank" rel="noopener noreferrer">
              <span className="material-symbols-outlined">videocam</span>Join
            </a>
          ) : (
            <button className="btn btn-ghost" disabled style={{ opacity: 0.4, cursor: "not-allowed" }} title="No real meeting link yet — connect Google Calendar in Settings → Integrations">
              <span className="material-symbols-outlined">link_off</span>No Link Yet
            </button>
          )}
          <button className="btn btn-solid" onClick={goToConversation}><span className="material-symbols-outlined">forum</span>View Conversation</button>
        </div>
      </div>
    </>
  );
}
