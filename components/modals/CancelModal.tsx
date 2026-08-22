"use client";

import { useEffect, useState } from "react";
import { useUI } from "@/context/UIContext";

export default function CancelModal() {
  const { cancelOpen, closeCancel, closeInterviewDrawer, selectedInterview, refreshInterviews } = useUI();
  const [cancelled, setCancelled] = useState(false);
  const [cancelling, setCancelling] = useState(false);
  const [reason, setReason] = useState("");
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (cancelOpen) {
      setCancelled(false);
      setCancelling(false);
      setReason("");
      setError(null);
    }
  }, [cancelOpen]);

  useEffect(() => {
    if (cancelled) {
      const t = setTimeout(() => {
        closeCancel();
        closeInterviewDrawer();
      }, 2000);
      return () => clearTimeout(t);
    }
  }, [cancelled, closeCancel, closeInterviewDrawer]);

  if (!cancelOpen) return null;

  async function confirmCancel() {
    if (!selectedInterview) { setError("No interview selected."); return; }
    setCancelling(true);
    setError(null);
    try {
      const res = await fetch(`/api/interviews/${selectedInterview.id}`, {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ reason }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error ?? `Failed to cancel (${res.status})`);
      }
      await refreshInterviews();
      setCancelled(true);
    } catch (err) {
      // Real failure — do not claim success or "candidate notified" when
      // nothing actually happened. The person needs to know it didn't work.
      setError(err instanceof Error ? err.message : "Something went wrong — the interview was not cancelled.");
    } finally {
      setCancelling(false);
    }
  }

  return (
    <>
      <div className="overlay-bg show" onClick={closeCancel} />
      <div className="small-modal cancel-modal show">
        {!cancelled ? (
          <>
            <div className="small-modal-body">
              <div className="cancel-title">Cancel this interview?</div>
              <div className="cancel-sub">Schela will free the slot{selectedInterview?.channel === "wa" ? " and notify the candidate over WhatsApp" : ""}.</div>
              <textarea
                className="notes-textarea"
                style={{ minHeight: 80 }}
                placeholder="Optional reason…"
                value={reason}
                onChange={(e) => setReason(e.target.value)}
              />
              {error && <div style={{ color: "var(--coral)", fontSize: 12.5, fontWeight: 600, marginTop: 10 }}>{error}</div>}
            </div>
            <div className="small-modal-foot" style={{ flexDirection: "column" }}>
              <button className="btn btn-coral-solid" style={{ justifyContent: "center" }} onClick={confirmCancel} disabled={cancelling}>
                {cancelling ? "Cancelling…" : "Yes, cancel interview"}
              </button>
              <button className="btn btn-ghost" style={{ justifyContent: "center" }} onClick={closeCancel}>Keep interview</button>
            </div>
          </>
        ) : (
          <div className="small-modal-body">
            <div className="cancel-success">
              <div className="success-circle"><span className="material-symbols-outlined">close</span></div>
              <div className="success-title">Interview cancelled.</div>
              <div className="success-sub">{selectedInterview?.channel === "wa" ? "Candidate notified." : "Slot freed."}</div>
            </div>
          </div>
        )}
      </div>
    </>
  );
}
