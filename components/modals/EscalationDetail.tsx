"use client";

import { useEffect, useState } from "react";
import { useUI } from "@/context/UIContext";
import type { Conversation } from "@/lib/types";

export default function EscalationDetail() {
  const { escalationConvId, closeEscalation } = useUI();
  const [reasonOpen, setReasonOpen] = useState(false);
  const [reply, setReply] = useState("");
  const [sending, setSending] = useState(false);
  const [sent, setSent] = useState(false);
  const [delivered, setDelivered] = useState(true);
  const [deliveryError, setDeliveryError] = useState<string | undefined>(undefined);
  const [conv, setConv] = useState<Conversation | null>(null);

  useEffect(() => {
    if (!escalationConvId) return;
    setReasonOpen(false); setReply(""); setSending(false); setSent(false); setDelivered(true); setDeliveryError(undefined);
    fetch("/api/conversations")
      .then((r) => r.json())
      .then((d) => setConv((d.conversations ?? []).find((c: Conversation) => c.id === escalationConvId) ?? null));
  }, [escalationConvId]);

  if (!escalationConvId || !conv) return null;

  async function sendReply() {
    setSending(true);
    try {
      const res = await fetch(`/api/conversations/${conv!.id}/messages`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text: reply }),
      });
      const data = await res.json().catch(() => ({}));
      setDelivered(data.delivered !== false);
      setDeliveryError(data.deliveryError);
      setSent(true);
    } finally {
      setSending(false);
    }
  }

  const lastThree = conv.messages.slice(-3);

  return (
    <>
      <div className="overlay-bg show" onClick={closeEscalation} />
      <div className="escalation-modal show">
        <div className="escalation-head-card">
          <div>
            <div className="escalation-head-title"><span className="material-symbols-outlined">warning</span>AI Escalated · {conv.candName}</div>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <span className="confidence-badge">{(conv.confidence ?? 0).toFixed(2)}</span>
            <span className="close-x small" onClick={closeEscalation}><span className="material-symbols-outlined" style={{ fontSize: 14 }}>close</span></span>
          </div>
        </div>

        <div className="escalation-body">
          <div className="escalation-excerpt">
            <div className="dark-preview">
              <div className="dark-preview-chrome">
                <span style={{ background: "#FF5F57" }} /><span style={{ background: "#FFBD2E" }} /><span style={{ background: "#28CA41" }} />
              </div>
              <div className="dark-preview-body" style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                {lastThree.length === 0 ? (
                  <div style={{ fontSize: 12, opacity: 0.6 }}>No messages yet</div>
                ) : (
                  lastThree.map((m, i) => (
                    <div
                      key={i}
                      style={{
                        fontSize: 12,
                        padding: i === lastThree.length - 1 ? "8px 10px" : 0,
                        border: i === lastThree.length - 1 ? "1px solid var(--coral)" : "none",
                        borderRadius: i === lastThree.length - 1 ? 8 : 0,
                        opacity: m.from === "schela" ? 0.75 : 1,
                      }}
                    >
                      <b style={{ opacity: 0.6, fontSize: 10, textTransform: "uppercase", letterSpacing: "0.04em" }}>
                        {m.from === "schela" ? (m.senderKind === "ai" ? "Schela · AI" : m.senderName || "Admin") : conv.candName.split(" ")[0]}
                      </b>
                      <div>{m.text}</div>
                    </div>
                  ))
                )}
              </div>
            </div>
            <div className="escalation-note">AI stopped here · handed to you</div>
          </div>

          <div className={`reason-toggle ${reasonOpen ? "open" : ""}`} onClick={() => setReasonOpen((v) => !v)}>
            Why Schela escalated
            <span className="material-symbols-outlined">expand_more</span>
          </div>
          {reasonOpen && (
            <div className="reason-content">
              {/* The real reason recorded at decision time. Escalations happen for
                  four different reasons now, so a single hardcoded explanation
                  would be wrong three times out of four. */}
              {conv.escalationReason ??
                `Confidence on this reply was ${(conv.confidence ?? 0).toFixed(2)}, below the auto-reply threshold — Schela paused rather than guess.`}
              {conv.suggestedReply && (
                <div style={{ marginTop: 8 }}>
                  <b>Suggested reply (not sent):</b> &ldquo;{conv.suggestedReply}&rdquo;
                </div>
              )}
            </div>
          )}

          {!sent ? (
            <>
              <label className="field-label" style={{ marginTop: 14, display: "block" }}>Reply</label>
              <textarea
                className="notes-textarea"
                style={{ minHeight: 90, marginBottom: 8 }}
                placeholder="Type your reply…"
                value={reply}
                onChange={(e) => setReply(e.target.value)}
              />
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
                <span className={`chan-pill ${conv.channel}`}>
                  <span className="material-symbols-outlined">{conv.channel === "wa" ? "chat" : "mail"}</span>
                  Sends via {conv.channel === "wa" ? "WhatsApp" : "Email"}
                </span>
              </div>
              <button className="btn btn-solid" style={{ width: "100%", justifyContent: "center" }} disabled={!reply.trim() || sending} onClick={sendReply}>
                {sending ? "Sending…" : "Send Reply →"}
              </button>
            </>
          ) : (
            <>
              <div className="detail-card" style={{ marginBottom: 12 }}>
                <div className="detail-row">
                  <span>Reply {delivered ? "sent" : "recorded"}</span>
                  {delivered ? (
                    <b style={{ color: "var(--mint)" }}>✓ Delivered</b>
                  ) : (
                    <b style={{ color: "var(--amber)" }}>Saved · not delivered</b>
                  )}
                </div>
                {!delivered && deliveryError && (
                  <div style={{ fontSize: 11.5, color: "var(--muted)", marginTop: 6 }}>{deliveryError}</div>
                )}
              </div>
              <div style={{ fontSize: 12, color: "var(--slate)", display: "flex", gap: 8, alignItems: "flex-start" }}>
                <span className="material-symbols-outlined" style={{ fontSize: 16, color: "var(--mint)" }}>auto_awesome</span>
                <span>Escalation cleared. Schela will resume auto-handling this thread on the candidate&apos;s next reply.</span>
              </div>
            </>
          )}
        </div>
      </div>
    </>
  );
}
