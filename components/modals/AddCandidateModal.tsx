"use client";

import { useEffect, useState } from "react";
import { useUI } from "@/context/UIContext";
import { COUNTRY_CODES, TIME_ZONES } from "@/lib/data";
import { recommendChannel } from "@/lib/channel";
import type { Channel } from "@/lib/types";

const emptyForm = {
  name: "", countryCode: "+91", phone: "", email: "", jobPosition: "", timeZone: TIME_ZONES[0], notes: "",
};

export default function AddCandidateModal() {
  const { addCandidateOpen, closeAddCandidate, bumpCandidatesVersion, openCandidateDrawer } = useUI();
  const [form, setForm] = useState(emptyForm);
  const [channel, setChannel] = useState<Channel>("wa");
  const [channelTouched, setChannelTouched] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(false);

  useEffect(() => {
    if (addCandidateOpen) {
      setForm(emptyForm);
      setChannel("wa");
      setChannelTouched(false);
      setSaving(false);
      setError(false);
    }
  }, [addCandidateOpen]);

  if (!addCandidateOpen) return null;

  const recommended = recommendChannel(form.countryCode);

  function setCountryCode(code: string) {
    setForm((f) => ({ ...f, countryCode: code }));
    if (!channelTouched) setChannel(recommendChannel(code));
  }

  async function handleSubmit() {
    if (!form.name.trim() || !form.phone.trim() || !form.email.trim() || !form.jobPosition.trim()) {
      setError(true);
      setTimeout(() => setError(false), 350);
      return;
    }
    setSaving(true);
    try {
      const res = await fetch("/api/candidates", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: form.name,
          countryCode: form.countryCode,
          phone: form.phone,
          email: form.email,
          jobPosition: form.jobPosition,
          preferredChannel: channel,
          timeZone: form.timeZone,
          notes: form.notes,
        }),
      });
      const data = await res.json();
      bumpCandidatesVersion();
      closeAddCandidate();
      if (data?.candidate?.id) openCandidateDrawer(data.candidate.id);
    } catch {
      setSaving(false);
    }
  }

  return (
    <>
      <div className="overlay-bg show" onClick={closeAddCandidate} />
      <div className="wizard-modal show" style={{ maxHeight: "90vh" }}>
        <div className="wizard-head">
          <div className="wizard-title">Add candidate</div>
          <span className="close-x" onClick={closeAddCandidate}><span className="material-symbols-outlined">close</span></span>
        </div>
        <div className="wizard-body" style={{ paddingTop: 16 }}>
          <div className={`wizard-step active ${error ? "shake" : ""}`}>
            <div className="field-group">
              <label className="field-label">Full name</label>
              <input
                className={`field-input ${error && !form.name.trim() ? "input-error" : ""}`}
                placeholder="e.g. Full name"
                value={form.name}
                onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
              />
            </div>

            <div className="field-group">
              <label className="field-label">Phone number <span style={{ color: "var(--slate-light)", fontWeight: 600 }}>(required — WhatsApp needs it)</span></label>
              <div style={{ display: "flex", gap: 8 }}>
                <select className="field-input" style={{ maxWidth: 140 }} value={form.countryCode} onChange={(e) => setCountryCode(e.target.value)}>
                  {COUNTRY_CODES.map((c) => <option key={c.code} value={c.code}>{c.label}</option>)}
                </select>
                <input
                  className={`field-input ${error && !form.phone.trim() ? "input-error" : ""}`}
                  placeholder="98765 43210"
                  value={form.phone}
                  onChange={(e) => setForm((f) => ({ ...f, phone: e.target.value }))}
                />
              </div>
            </div>

            <div className="field-group">
              <label className="field-label">Email</label>
              <input
                className={`field-input ${error && !form.email.trim() ? "input-error" : ""}`}
                placeholder="ananya@email.com"
                value={form.email}
                onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))}
              />
            </div>

            <div className="field-group">
              <label className="field-label">Job position</label>
              <input
                className={`field-input ${error && !form.jobPosition.trim() ? "input-error" : ""}`}
                placeholder="e.g. Senior Product Designer"
                value={form.jobPosition}
                onChange={(e) => setForm((f) => ({ ...f, jobPosition: e.target.value }))}
              />
            </div>

            <label className="field-label">Preferred channel</label>
            <div className="chan-cards" style={{ marginBottom: 6 }}>
              <div className={`chan-card wa-card ${channel === "wa" ? "selected" : ""}`} onClick={() => { setChannel("wa"); setChannelTouched(true); }}>
                {recommended === "wa" && <span className="rec-badge">Recommended</span>}
                <span className="material-symbols-outlined">chat</span>
                <div className="chan-card-name">WhatsApp</div>
              </div>
              <div className={`chan-card em-card ${channel === "em" ? "selected" : ""}`} onClick={() => { setChannel("em"); setChannelTouched(true); }}>
                {recommended === "em" && <span className="rec-badge">Recommended</span>}
                <span className="material-symbols-outlined">mail</span>
                <div className="chan-card-name">Email</div>
              </div>
            </div>
            <div style={{ fontSize: 10.5, color: "var(--slate-light)", fontWeight: 600, marginBottom: 14 }}>
              Based on the country code — Schela will fall back to the other channel automatically if there&apos;s no reply.
            </div>

            <div className="field-group">
              <label className="field-label">Time zone</label>
              <select className="field-input" value={form.timeZone} onChange={(e) => setForm((f) => ({ ...f, timeZone: e.target.value }))}>
                {TIME_ZONES.map((tz) => <option key={tz}>{tz}</option>)}
              </select>
            </div>

            <div className="field-group">
              <label className="field-label">Notes <span style={{ color: "var(--slate-light)", fontWeight: 600 }}>(optional)</span></label>
              <textarea
                className="notes-textarea"
                style={{ minHeight: 70 }}
                placeholder="Anything Schela or you should keep in mind…"
                value={form.notes}
                onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))}
              />
            </div>
          </div>
        </div>
        <div className="wizard-foot">
          <button className="btn btn-outline" onClick={closeAddCandidate}>Cancel</button>
          <button className="btn btn-solid" onClick={handleSubmit} disabled={saving}>
            {saving ? "Adding…" : "Add candidate"}
          </button>
        </div>
      </div>
    </>
  );
}
