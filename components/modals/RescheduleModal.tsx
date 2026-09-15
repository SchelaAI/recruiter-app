"use client";

import { useEffect, useState } from "react";
import { useUI } from "@/context/UIContext";

interface TimeSlot {
  iso: string;
  label: string;
  dayLabel: string;
}

function useTypewriter(text: string, active: boolean) {
  const [shown, setShown] = useState("");
  useEffect(() => {
    if (!active || !text) return;
    setShown("");
    let i = 0;
    const id = setInterval(() => {
      i++;
      setShown(text.slice(0, i));
      if (i >= text.length) clearInterval(id);
    }, 18);
    return () => clearInterval(id);
  }, [text, active]);
  return shown;
}

export default function RescheduleModal() {
  const { rescheduleOpen, closeReschedule, selectedInterview, closeInterviewDrawer, refreshInterviews } = useUI();
  const [slots, setSlots] = useState<TimeSlot[] | null>(null);
  const [slot, setSlot] = useState<TimeSlot | null>(null);
  const [sending, setSending] = useState(false);

  useEffect(() => {
    if (rescheduleOpen) {
      setSlot(null);
      setSending(false);
      setSlots(null);
      fetch("/api/scheduling/slots").then((r) => r.json()).then((d) => setSlots(d.slots ?? []));
    }
  }, [rescheduleOpen]);

  const name = selectedInterview ? selectedInterview.cand.split(" ")[0] : "there";
  const message = slot ? `Hi ${name},\n\nWe need to reschedule your interview.\n\nProposed new time:\n\n• ${slot.label}\n\nReply YES to confirm, or let me know a time that suits you better.` : "";
  const typed = useTypewriter(message, !!slot);

  if (!rescheduleOpen) return null;

  async function send() {
    if (!slot || !selectedInterview) return;
    setSending(true);
    try {
      await fetch(`/api/interviews/${selectedInterview.id}/reschedule`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ scheduledAt: slot.iso }),
      });
    } catch {
      // Network failure — the interview wasn't moved; refresh will reflect reality.
    } finally {
      await refreshInterviews();
      setSending(false);
      closeReschedule();
      closeInterviewDrawer();
    }
  }

  return (
    <>
      <div className="overlay-bg show" onClick={closeReschedule} />
      <div className="small-modal show">
        <div className="small-modal-head">
          <div className="wizard-title">Reschedule interview</div>
          <span className="close-x" onClick={closeReschedule}><span className="material-symbols-outlined">close</span></span>
        </div>
        <div className="small-modal-body">
          <label className="field-label">Pick a new slot</label>
          {slots === null ? (
            <div style={{ fontSize: 12, color: "var(--muted)", padding: "10px 0" }}>Loading real availability…</div>
          ) : slots.length === 0 ? (
            <div style={{ fontSize: 12, color: "var(--muted)", padding: "10px 0" }}>No open slots in the next few business days.</div>
          ) : (
            <div className="slot-grid">
              {slots.map((s) => (
                <div key={s.iso} className={`slot-cell ${slot?.iso === s.iso ? "selected" : ""}`} onClick={() => setSlot(s)}>
                  {s.dayLabel} {new Date(s.iso).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })}
                </div>
              ))}
            </div>
          )}
          <div className="dark-preview">
            <div className="dark-preview-chrome">
              <span style={{ background: "#FF5F57" }} /><span style={{ background: "#FFBD2E" }} /><span style={{ background: "#28CA41" }} />
            </div>
            <div className="dark-preview-body">
              {slot ? (<>{typed}<span className="cursor-blink" /></>) : "Select a new slot to preview the message Schela will send."}
            </div>
          </div>
        </div>
        <div className="small-modal-foot">
          <button className="btn btn-outline" style={{ flex: 1, justifyContent: "center" }} onClick={closeReschedule}>Cancel</button>
          <button className="btn btn-solid" style={{ flex: 1, justifyContent: "center" }} onClick={send} disabled={!slot || sending}>
            {sending ? "Sending…" : "Send New Options →"}
          </button>
        </div>
      </div>
    </>
  );
}
