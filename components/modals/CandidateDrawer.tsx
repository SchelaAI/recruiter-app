"use client";

import { useEffect, useRef, useState } from "react";
import { useUI } from "@/context/UIContext";
import { AiTimelineVertical } from "@/components/AiTimeline";
import StatusBadge from "@/components/StatusBadge";
import { getAvatarColorClass } from "@/lib/avatarColor";
import type { Candidate, Interview, Conversation } from "@/lib/types";

type Tab = "overview" | "interviews" | "conversations" | "notes";

export default function CandidateDrawer() {
  const { candidateDrawerId, closeCandidateDrawer, openWizard, bumpCandidatesVersion } = useUI();
  const [tab, setTab] = useState<Tab>("overview");
  const [candidate, setCandidate] = useState<Candidate | null>(null);
  const [interviews, setInterviews] = useState<Interview[]>([]);
  const [conversation, setConversation] = useState<Conversation | null>(null);

  const [editing, setEditing] = useState(false);
  const [editForm, setEditForm] = useState({ name: "", email: "", countryCode: "", phone: "", jobPosition: "" });
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const [deleting, setDeleting] = useState(false);

  useEffect(() => {
    if (!candidateDrawerId) return;
    setTab("overview");
    setCandidate(null);
    setEditing(false);
    setConfirmingDelete(false);
    setSaveError(null);

    Promise.all([
      fetch("/api/candidates").then((r) => r.json()),
      fetch("/api/interviews").then((r) => r.json()),
      fetch("/api/conversations").then((r) => r.json()),
    ]).then(([cands, ivs, convs]) => {
      setCandidate((cands.candidates ?? []).find((c: Candidate) => c.id === candidateDrawerId) ?? null);
      setInterviews((ivs.interviews ?? []).filter((iv: Interview) => iv.candId === candidateDrawerId));
      setConversation((convs.conversations ?? []).find((c: Conversation) => c.candId === candidateDrawerId) ?? null);
    });
  }, [candidateDrawerId]);

  const open = !!candidateDrawerId;
  if (!open || !candidate) {
    return <div className={`overlay-bg ${open ? "show" : ""}`} onClick={closeCandidateDrawer} />;
  }
  const c = candidate;

  function startEditing() {
    setEditForm({ name: c.name, email: c.email, countryCode: c.countryCode, phone: c.phone, jobPosition: c.jobPosition ?? "" });
    setSaveError(null);
    setEditing(true);
  }

  async function saveEdits() {
    if (!editForm.name.trim()) { setSaveError("Name can't be empty."); return; }
    setSaving(true);
    setSaveError(null);
    try {
      const res = await fetch(`/api/candidates/${c.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(editForm),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Save failed");
      setCandidate(data.candidate);
      bumpCandidatesVersion();
      setEditing(false);
    } catch (err) {
      setSaveError(err instanceof Error ? err.message : "Something went wrong");
    } finally {
      setSaving(false);
    }
  }

  async function deleteCandidate() {
    if (!confirmingDelete) { setConfirmingDelete(true); setTimeout(() => setConfirmingDelete(false), 3000); return; }
    setDeleting(true);
    try {
      await fetch(`/api/candidates/${c.id}`, { method: "DELETE" });
      bumpCandidatesVersion();
      closeCandidateDrawer();
    } finally {
      setDeleting(false);
    }
  }

  const circumference = 150.8;
  const offset = circumference - (circumference * c.score) / 100;
  const scoreSub =
    c.score >= 85
      ? "Strong match on role & response patterns"
      : c.score >= 60
      ? "Moderate match, worth a closer look"
      : "Needs manual review — low confidence";

  return (
    <>
      <div className={`overlay-bg ${open ? "show" : ""}`} onClick={closeCandidateDrawer} />
      <div className={`drawer ${open ? "show" : ""}`}>
        <div className="drawer-header">
          <div className="drawer-header-top">
            <div style={{ display: "flex", gap: 12, flex: 1, minWidth: 0 }}>
              <div className="drawer-avatar">{c.id}</div>
              {editing ? (
                <div style={{ flex: 1, display: "flex", flexDirection: "column", gap: 6 }}>
                  <input className="field-input" value={editForm.name} onChange={(e) => setEditForm((f) => ({ ...f, name: e.target.value }))} placeholder="Full name" />
                  <input className="field-input" value={editForm.jobPosition} onChange={(e) => setEditForm((f) => ({ ...f, jobPosition: e.target.value }))} placeholder="Job position" />
                </div>
              ) : (
                <div>
                  <div className="drawer-name">{c.name}</div>
                  <div className="drawer-role">{c.jobPosition || "No role yet"}</div>
                </div>
              )}
            </div>
            <div style={{ display: "flex", gap: 6, alignItems: "flex-start" }}>
              {!editing && (
                <span className="close-x" onClick={startEditing} title="Edit candidate">
                  <span className="material-symbols-outlined">edit</span>
                </span>
              )}
              <span className="close-x" onClick={closeCandidateDrawer}>
                <span className="material-symbols-outlined">close</span>
              </span>
            </div>
          </div>
          {editing ? (
            <div style={{ display: "flex", flexDirection: "column", gap: 6, marginTop: 8 }}>
              <div style={{ display: "flex", gap: 8 }}>
                <input className="field-input" style={{ maxWidth: 90 }} value={editForm.countryCode} onChange={(e) => setEditForm((f) => ({ ...f, countryCode: e.target.value }))} placeholder="+1" />
                <input className="field-input" value={editForm.phone} onChange={(e) => setEditForm((f) => ({ ...f, phone: e.target.value }))} placeholder="Phone" />
              </div>
              <input className="field-input" value={editForm.email} onChange={(e) => setEditForm((f) => ({ ...f, email: e.target.value }))} placeholder="Email" />
              {saveError && <div className="field-error-text">{saveError}</div>}
              <div style={{ display: "flex", gap: 8, marginTop: 4 }}>
                <button className="btn btn-outline" style={{ flex: 1, justifyContent: "center" }} onClick={() => setEditing(false)} disabled={saving}>Cancel</button>
                <button className="btn btn-solid" style={{ flex: 1, justifyContent: "center" }} onClick={saveEdits} disabled={saving}>{saving ? "Saving…" : "Save"}</button>
              </div>
            </div>
          ) : (
            <div className="drawer-contact-row">
              <span className="contact-chip"><span className="material-symbols-outlined">call</span>{c.countryCode} {c.phone}</span>
              <span className="contact-chip"><span className="material-symbols-outlined">mail</span>{c.email}</span>
              <span className="contact-chip">
                <span className="material-symbols-outlined">{c.preferredChannel === "wa" ? "chat" : "mail"}</span>
                Prefers {c.preferredChannel === "wa" ? "WhatsApp" : "Email"}
              </span>
            </div>
          )}
        </div>

        <div className="drawer-tabs">
          {(["overview", "interviews", "conversations", "notes"] as Tab[]).map((t) => (
            <div key={t} className={`drawer-tab ${tab === t ? "active" : ""}`} onClick={() => setTab(t)}>
              {t[0].toUpperCase() + t.slice(1)}
            </div>
          ))}
        </div>

        <div className="drawer-body">
          {tab === "overview" && (
            <div className="drawer-panel active">
              <div className="score-ring-wrap">
                <svg width="56" height="56" viewBox="0 0 56 56">
                  <circle cx="28" cy="28" r="24" fill="none" stroke="#EFEDE8" strokeWidth="6" />
                  <circle
                    cx="28" cy="28" r="24" fill="none" stroke="var(--purple)" strokeWidth="6"
                    strokeLinecap="round" strokeDasharray={circumference} strokeDashoffset={offset}
                    transform="rotate(-90 28 28)"
                  />
                  <text x="28" y="33" textAnchor="middle" className="score-ring-num">{c.score}</text>
                </svg>
                <div>
                  <div className="score-ring-label">AI Fit Score</div>
                  <div className="score-ring-sub">{scoreSub}</div>
                </div>
              </div>
              <div className="detail-card" style={{ marginBottom: 18 }}>
                <div className="detail-row"><span>Time zone</span><b>{c.timeZone || "—"}</b></div>
                <div className="detail-row"><span>Country code</span><b>{c.countryCode}</b></div>
                <div className="detail-row"><span>Last active</span><b>{c.active}</b></div>
              </div>
              <div className="section-title" style={{ marginBottom: 10 }}>AI Timeline</div>
              <AiTimelineVertical aiState={c.aiState} />
            </div>
          )}

          {tab === "interviews" && (
            <div className="drawer-panel active">
              {interviews.length === 0 ? (
                <div className="empty-state" style={{ padding: 20 }}>
                  <span className="material-symbols-outlined">event_busy</span>
                  <div className="empty-state-title">No interviews yet</div>
                </div>
              ) : (
                <table className="data-table">
                  <thead><tr><th>Time</th><th>Position</th><th>AI State</th></tr></thead>
                  <tbody>
                    {interviews.map((iv) => (
                      <tr key={iv.id}><td className="cell-time">{iv.time}</td><td>{iv.jobPosition || c.jobPosition}</td><td><StatusBadge state={iv.aiState} /></td></tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          )}

          {tab === "conversations" && (
            <div className="drawer-panel active">
              {!conversation || conversation.messages.length === 0 ? (
                <div className="empty-state" style={{ padding: 20 }}>
                  <span className="material-symbols-outlined">forum</span>
                  <div className="empty-state-title">No conversation yet</div>
                </div>
              ) : (
                conversation.messages.slice(-3).map((m, i) => {
                  const label = m.from === "schela" ? (m.senderKind === "ai" ? "Schela" : m.senderName || "Admin") : c.name;
                  return (
                    <div className="live-convo-item" key={i}>
                      <div className="live-convo-avatar-wrap">
                        <div className={`mini-avatar ${m.from === "schela" ? "" : getAvatarColorClass(c.id)}`}>{m.from === "schela" ? "S" : c.id}</div>
                      </div>
                      <div className="live-convo-body">
                        <div className="live-convo-top"><span className="live-convo-name">{label}</span><span className="live-convo-time">{m.time}</span></div>
                        <div className="live-convo-msg">{m.text}</div>
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          )}

          {tab === "notes" && (
            <div className="drawer-panel active">
              <NotesEditor key={c.id} candidateId={c.id} initial={c.notes ?? ""} />
            </div>
          )}
        </div>

        <div className="drawer-footer">
          <button className="btn btn-coral-outline" onClick={deleteCandidate} disabled={deleting}>
            <span className="material-symbols-outlined">delete</span>{deleting ? "Deleting…" : confirmingDelete ? "Confirm delete?" : "Delete"}
          </button>
          <button className="btn btn-outline" onClick={openWizard}><span className="material-symbols-outlined">event</span>Schedule</button>
          <button className="btn btn-solid" onClick={() => setTab("conversations")}><span className="material-symbols-outlined">forum</span>View Conversation</button>
        </div>
      </div>
    </>
  );
}

/**
 * Real autosaving notes editor. Debounces on change and PATCHes the candidate,
 * showing an honest status ("Saving…", "Saved", or an error) — unlike the old
 * static "Auto-saved" label that never actually persisted anything.
 */
function NotesEditor({ candidateId, initial }: { candidateId: string; initial: string }) {
  const [notes, setNotes] = useState(initial);
  const [status, setStatus] = useState<"idle" | "saving" | "saved" | "error">("idle");
  const dirtyRef = useRef(false);

  useEffect(() => {
    if (!dirtyRef.current) return;
    setStatus("saving");
    const t = setTimeout(async () => {
      try {
        const res = await fetch(`/api/candidates/${candidateId}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ notes }),
        });
        if (!res.ok) throw new Error();
        setStatus("saved");
        setTimeout(() => setStatus("idle"), 1500);
      } catch {
        setStatus("error");
      }
    }, 700);
    return () => clearTimeout(t);
  }, [notes, candidateId]);

  return (
    <>
      <textarea
        className="notes-textarea"
        placeholder="Add private notes about this candidate…"
        value={notes}
        onChange={(e) => { dirtyRef.current = true; setNotes(e.target.value); }}
      />
      <div className="autosave-label">
        {status === "saving" ? "Saving…" : status === "saved" ? "✓ Saved" : status === "error" ? "Couldn’t save — check your connection" : "Changes save automatically"}
      </div>
    </>
  );
}
