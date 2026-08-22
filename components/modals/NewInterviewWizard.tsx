"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { useUI } from "@/context/UIContext";
import { COUNTRY_CODES, TIMEZONE_BY_COUNTRY_CODE } from "@/lib/data";
import { recommendChannel } from "@/lib/channel";
import { getAvatarColorClass } from "@/lib/avatarColor";
import type { Candidate } from "@/lib/types";

const WIZARD_STEP_LABELS = ["Candidate & Role", "Schedule", "Review & Send"];

interface TimeSlot {
  iso: string;
  label: string;
  dayLabel: string;
}

function useTypewriter(text: string, active: boolean) {
  const [shown, setShown] = useState("");
  useEffect(() => {
    if (!active) return;
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

export default function NewInterviewWizard() {
  const { wizardOpen, closeWizard, refreshInterviews, bumpCandidatesVersion, wizardPrefillCandidate, consumeWizardPrefill, organization, interviewers } = useUI();
  const router = useRouter();
  const [candidates, setCandidates] = useState<Candidate[]>([]);
  const jobPositions = Array.from(new Set(candidates.map((c) => c.jobPosition).filter(Boolean)));
  const [step, setStep] = useState<1 | 2 | 3 | "success">(1);
  const [candidateQuery, setCandidateQuery] = useState("");
  const [candidateName, setCandidateName] = useState("");
  const [candidateId, setCandidateId] = useState<string | null>(null);
  const [showTypeahead, setShowTypeahead] = useState(false);
  const [isNewCandidate, setIsNewCandidate] = useState(false);
  const [newCandForm, setNewCandForm] = useState({ name: "", countryCode: "+91", phone: "", email: "" });
  const [step1Error, setStep1Error] = useState(false);
  const [jobPosition, setJobPosition] = useState("");
  const [interviewerId, setInterviewerId] = useState<string>("");
  const [channel, setChannel] = useState<"wa" | "em">("wa");
  const [channelTouched, setChannelTouched] = useState(false);
  const [fallback, setFallback] = useState(true);
  const [allSlots, setAllSlots] = useState<TimeSlot[] | null>(null);
  const [slots, setSlots] = useState<TimeSlot[]>([]);
  const [duration, setDuration] = useState("45m");
  const [format, setFormat] = useState("Google Meet");
  const [sending, setSending] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (wizardOpen) {
      fetch("/api/candidates").then((r) => r.json()).then((d) => setCandidates(d.candidates ?? []));
      fetch("/api/scheduling/slots").then((r) => r.json()).then((d) => setAllSlots(d.slots ?? []));
      setStep(1);
      setChannel("wa");
      setChannelTouched(false);
      setSlots([]);
      setAllSlots(null);
      setSending(false);
      setIsNewCandidate(false);
      setNewCandForm({ name: "", countryCode: "+91", phone: "", email: "" });
      setStep1Error(false);
      if (wizardPrefillCandidate) {
        setCandidateName(wizardPrefillCandidate.name);
        setCandidateId(wizardPrefillCandidate.id);
        setCandidateQuery(wizardPrefillCandidate.name);
        const match = candidates.find((c) => c.id === wizardPrefillCandidate.id);
        if (match) setChannel(match.preferredChannel);
        consumeWizardPrefill();
      } else {
        setCandidateQuery("");
        setCandidateName("");
        setCandidateId(null);
      }
      const t = setTimeout(() => inputRef.current?.focus(), 150);
      return () => clearTimeout(t);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [wizardOpen]);

  useEffect(() => {
    if (!jobPosition && jobPositions.length > 0) setJobPosition(jobPositions[0]);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [jobPositions.length]);

  useEffect(() => {
    if (!interviewerId && interviewers.length > 0) setInterviewerId(interviewers[0].id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [interviewers.length]);

  const selectedInterviewer = interviewers.find((iv) => iv.id === interviewerId);
  const interviewerName = selectedInterviewer?.name ?? "To be assigned";
  const companyName = organization?.name?.trim() || "your company";

  const matches = candidates.filter((c) => c.name.toLowerCase().includes(candidateQuery.toLowerCase())).slice(0, 4);

  const effectiveCandidateName = isNewCandidate ? (newCandForm.name || "New candidate") : candidateName;
  const slot = slots[0];
  const previewMsg = slot
    ? `Hi ${effectiveCandidateName.split(" ")[0]} 👋\n\nI'm Schela, the AI Recruiting Coordinator assisting with the hiring process for the ${jobPosition || "open"} position at ${companyName}.\n\nWe'd like to schedule your interview.\n\nAvailable slots:\n\n${slots.map((s) => `• ${s.label}`).join("\n")}\n\nReply with your preferred option.`
    : "";
  const typed = useTypewriter(previewMsg, step === 3);

  if (!wizardOpen) return null;

  function toggleSlot(s: TimeSlot) {
    setSlots((prev) => {
      if (prev.some((x) => x.iso === s.iso)) return prev.filter((x) => x.iso !== s.iso);
      if (prev.length >= 3) return prev;
      return [...prev, s];
    });
  }

  function setNewCandCountryCode(code: string) {
    setNewCandForm((f) => ({ ...f, countryCode: code }));
    if (!channelTouched) setChannel(recommendChannel(code));
  }

  function pickExistingCandidate(c: Candidate) {
    setCandidateName(c.name);
    setCandidateId(c.id);
    setCandidateQuery(c.name);
    setShowTypeahead(false);
    if (!channelTouched) setChannel(c.preferredChannel);
  }

  async function handleNext() {
    if (step === 1) {
      if (isNewCandidate) {
        if (!newCandForm.name.trim() || !newCandForm.phone.trim()) { triggerStep1Error(); return; }
      } else if (!candidateName) {
        triggerStep1Error();
        return;
      }
      setStep(2);
    } else if (step === 2) {
      setStep(3);
    } else if (step === 3) {
      if (!slot) return;
      setSending(true);
      let finalCandId = candidateId;
      let finalCandName = candidateName;

      if (isNewCandidate) {
        try {
          const res = await fetch("/api/candidates", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              name: newCandForm.name,
              countryCode: newCandForm.countryCode,
              phone: newCandForm.phone,
              email: newCandForm.email || "—",
              jobPosition,
              preferredChannel: channel,
              timeZone: TIMEZONE_BY_COUNTRY_CODE[newCandForm.countryCode] ?? "UTC",
            }),
          });
          const data = await res.json();
          finalCandId = data.candidate.id;
          finalCandName = data.candidate.name;
          bumpCandidatesVersion();
        } catch {
          finalCandId = newCandForm.name.split(" ").map((w) => w[0]).join("").toUpperCase().slice(0, 2) || "NC";
          finalCandName = newCandForm.name;
        }
      }

      try {
        await fetch("/api/interviews", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            cand: finalCandName,
            candId: finalCandId,
            jobPosition,
            channel,
            aiState: "sending_invitation",
            interviewer: interviewerName,
            handled: "ai",
            duration,
            format,
            scheduledAt: slot.iso,
          }),
        });
      } catch {
        // Network failure — refreshInterviews below will reflect what actually happened.
      } finally {
        await refreshInterviews();
        setSending(false);
        setStep("success");
      }
    }
  }

  function triggerStep1Error() {
    setStep1Error(true);
    setTimeout(() => setStep1Error(false), 350);
  }

  function handleBack() {
    if (step === 2) setStep(1);
    if (step === 3) setStep(2);
  }

  return (
    <>
      <div className="overlay-bg show" onClick={closeWizard} />
      <div className="wizard-modal show">
        <div className="wizard-head">
          <div className="wizard-title">New Interview</div>
          <span className="close-x" onClick={closeWizard}><span className="material-symbols-outlined">close</span></span>
        </div>
        {step !== "success" && (
          <div className="wizard-steps">
            {WIZARD_STEP_LABELS.map((label, i) => {
              const stepNum = i + 1;
              const cls = typeof step === "number" ? (step === stepNum ? "active" : step > stepNum ? "done" : "") : "";
              return (
                <div key={label} className={`wizard-step-pill ${cls}`}>
                  <span className="wizard-step-num">{stepNum}</span>{label}
                </div>
              );
            })}
          </div>
        )}

        <div className="wizard-body">
          {step === 1 && (
            <div className="wizard-step active">
              <div className="field-group" style={{ position: "relative" }}>
                <label className="field-label">Candidate</label>
                {!isNewCandidate ? (
                  <>
                    <input
                      ref={inputRef}
                      className={`field-input ${step1Error && !candidateName ? "input-error" : ""}`}
                      placeholder="Search candidates…"
                      value={candidateQuery}
                      onChange={(e) => { setCandidateQuery(e.target.value); setCandidateName(""); setCandidateId(null); setShowTypeahead(true); }}
                      onFocus={() => setShowTypeahead(true)}
                    />
                    {step1Error && !candidateName && <div className="field-error-text">Pick or add a candidate.</div>}
                    {showTypeahead && candidateQuery && (
                      <div className="typeahead-list">
                        {matches.map((c) => (
                          <div className="typeahead-item" key={c.id} onClick={() => pickExistingCandidate(c)}>
                            <div className={`mini-avatar ${getAvatarColorClass(c.id)}`}>{c.id}</div>
                            <div>
                              <div className="typeahead-name">{c.name}</div>
                              <div className="typeahead-role">{c.jobPosition}</div>
                            </div>
                          </div>
                        ))}
                        <div className="typeahead-item new-cand" onClick={() => { setIsNewCandidate(true); setShowTypeahead(false); }}>
                          <span className="material-symbols-outlined">person_add</span>Add new candidate
                        </div>
                      </div>
                    )}
                  </>
                ) : (
                  <div>
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
                      <span style={{ fontSize: 12, color: "var(--muted)" }}>New candidate</span>
                      <span style={{ fontSize: 12, color: "var(--purple)", cursor: "pointer", fontWeight: 600 }} onClick={() => setIsNewCandidate(false)}>
                        Search existing instead
                      </span>
                    </div>
                    <input
                      className={`field-input ${step1Error && !newCandForm.name.trim() ? "input-error" : ""}`}
                      placeholder="Full name"
                      value={newCandForm.name}
                      onChange={(e) => setNewCandForm((f) => ({ ...f, name: e.target.value }))}
                      style={{ marginBottom: 8 }}
                    />
                    {step1Error && !newCandForm.name.trim() && <div className="field-error-text" style={{ marginTop: -4, marginBottom: 8 }}>Name is required.</div>}
                    <div style={{ display: "flex", gap: 8, marginBottom: 8 }}>
                      <select className="field-input" style={{ maxWidth: 120 }} value={newCandForm.countryCode} onChange={(e) => setNewCandCountryCode(e.target.value)}>
                        {COUNTRY_CODES.map((c) => <option key={c.code} value={c.code}>{c.code}</option>)}
                      </select>
                      <input
                        className={`field-input ${step1Error && !newCandForm.phone.trim() ? "input-error" : ""}`}
                        placeholder="Phone (required for WhatsApp)"
                        value={newCandForm.phone}
                        onChange={(e) => setNewCandForm((f) => ({ ...f, phone: e.target.value }))}
                      />
                    </div>
                    <input
                      className="field-input"
                      placeholder="Email"
                      value={newCandForm.email}
                      onChange={(e) => setNewCandForm((f) => ({ ...f, email: e.target.value }))}
                    />
                  </div>
                )}
              </div>
              <div className="field-group">
                <label className="field-label">Job position</label>
                <input
                  className="field-input"
                  list="job-positions"
                  value={jobPosition}
                  onChange={(e) => setJobPosition(e.target.value)}
                  placeholder="e.g. Product Manager"
                />
                <datalist id="job-positions">
                  {jobPositions.map((p) => <option key={p} value={p} />)}
                </datalist>
              </div>
              <div className="field-group">
                <label className="field-label">Interviewer</label>
                {interviewers.length > 0 ? (
                  <select className="field-input" value={interviewerId} onChange={(e) => setInterviewerId(e.target.value)}>
                    {interviewers.map((iv) => (
                      <option key={iv.id} value={iv.id}>
                        {iv.name}{iv.role ? ` — ${iv.role}` : ""}{iv.availability !== "available" ? ` (${iv.availability})` : ""}
                      </option>
                    ))}
                  </select>
                ) : (
                  <div style={{ fontSize: 12, color: "var(--muted)", padding: "10px 12px", border: "1px dashed var(--border-soft)", borderRadius: "var(--r-sm)", background: "var(--bg-canvas)" }}>
                    No interviewers yet — this interview will be marked <b>To be assigned</b>. Add your hiring team in{" "}
                    <span
                      style={{ color: "var(--purple)", cursor: "pointer", fontWeight: 600 }}
                      onClick={() => { closeWizard(); router.push("/settings"); }}
                    >
                      Settings → Company
                    </span>.
                  </div>
                )}
              </div>
            </div>
          )}

          {step === 2 && (
            <div className="wizard-step active">
              <label className="field-label">Channel</label>
              <div className="chan-cards">
                <div className={`chan-card wa-card ${channel === "wa" ? "selected" : ""}`} onClick={() => { setChannel("wa"); setChannelTouched(true); }}>
                  <span className="rec-badge">Recommended</span>
                  <span className="material-symbols-outlined">chat</span>
                  <div className="chan-card-name">WhatsApp</div>
                </div>
                <div className={`chan-card em-card ${channel === "em" ? "selected" : ""}`} onClick={() => { setChannel("em"); setChannelTouched(true); }}>
                  <span className="material-symbols-outlined">mail</span>
                  <div className="chan-card-name">Email</div>
                </div>
              </div>
              <div className="toggle-row" style={{ marginBottom: 14 }}>
                <div>
                  <div className="toggle-row-label">Fallback to Email</div>
                  <div className="toggle-row-sub">If no WhatsApp response in 6h</div>
                </div>
                <div className={`ios-toggle ${fallback ? "on" : ""}`} onClick={() => setFallback((f) => !f)}>
                  <div className="ios-toggle-knob" />
                </div>
              </div>
              <label className="field-label">
                Available slots <span style={{ color: "var(--slate-light)", fontWeight: 600 }}>(pick up to 3)</span>
              </label>
              {allSlots === null ? (
                <div style={{ fontSize: 12, color: "var(--muted)", padding: "10px 0" }}>Loading real availability…</div>
              ) : allSlots.length === 0 ? (
                <div style={{ fontSize: 12, color: "var(--muted)", padding: "10px 0" }}>No open slots in the next few business days.</div>
              ) : (
                <div className="slot-grid">
                  {allSlots.map((s) => (
                    <div key={s.iso} className={`slot-cell ${slots.some((x) => x.iso === s.iso) ? "selected" : ""}`} onClick={() => toggleSlot(s)}>
                      {s.dayLabel} {new Date(s.iso).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })}
                    </div>
                  ))}
                </div>
              )}
              <label className="field-label">Duration</label>
              <div className="chip-row" style={{ marginBottom: 14 }}>
                {["30m", "45m", "60m"].map((d) => (
                  <span key={d} className={`pill-chip ${duration === d ? "selected" : ""}`} onClick={() => setDuration(d)}>{d}</span>
                ))}
              </div>
              <label className="field-label">Format</label>
              <div className="chip-row">
                {["Google Meet", "Zoom", "Calendly", "Phone", "In-person"].map((f) => (
                  <span key={f} className={`pill-chip ${format === f ? "selected" : ""}`} onClick={() => setFormat(f)}>{f}</span>
                ))}
              </div>
            </div>
          )}

          {step === 3 && (
            <div className="wizard-step active">
              <div className="dark-preview">
                <div className="dark-preview-chrome">
                  <span style={{ background: "#FF5F57" }} />
                  <span style={{ background: "#FFBD2E" }} />
                  <span style={{ background: "#28CA41" }} />
                </div>
                <div className="dark-preview-body">
                  {typed}
                  <span className="cursor-blink" />
                </div>
              </div>
              <div className="summary-grid">
                <div className="summary-item"><span>Candidate</span><b>{effectiveCandidateName}</b></div>
                <div className="summary-item"><span>Position</span><b>{jobPosition}</b></div>
                <div className="summary-item"><span>Interviewer</span><b>{interviewerName}</b></div>
                <div className="summary-item"><span>Channel</span><b>{channel === "wa" ? "WhatsApp" : "Email"}</b></div>
                <div className="summary-item"><span>Slot</span><b>{slot?.label ?? "—"}</b></div>
                <div className="summary-item"><span>Duration</span><b>{duration} · {format}</b></div>
              </div>
            </div>
          )}

          {step === "success" && (
            <div className="wizard-step active">
              <div className="wizard-success">
                <div className="success-circle"><span className="material-symbols-outlined">check</span></div>
                <div className="success-title">Invite sent.</div>
                <div className="success-sub">Schela will handle it from here.</div>
                <div style={{ display: "flex", gap: 10 }}>
                  <button className="btn btn-outline" style={{ flex: 1, justifyContent: "center" }} onClick={closeWizard}>Close</button>
                  <button
                    className="btn btn-solid"
                    style={{ flex: 1, justifyContent: "center" }}
                    onClick={() => { closeWizard(); router.push("/conversations"); }}
                  >
                    View Conversation
                  </button>
                </div>
              </div>
            </div>
          )}
        </div>

        {step !== "success" && (
          <div className="wizard-foot">
            <button className="btn btn-outline" style={{ visibility: step === 1 ? "hidden" : "visible" }} onClick={handleBack}>Back</button>
            <button className="btn btn-solid" onClick={handleNext} disabled={step === 3 && !slot}>{sending ? "Sending…" : step === 3 ? "Send" : "Continue"}</button>
          </div>
        )}
      </div>
    </>
  );
}
