"use client";

import { useActionState, useEffect, useRef, useState } from "react";
import { saveStep1, skipOnboarding } from "@/app/(auth)/onboarding/actions";

const ROLES = ["Individual Recruiter", "TA Lead", "Hiring Manager", "Team Lead", "Founder", "Other"];
const TEAM_SIZES = ["Solo", "2–5", "6–20", "20+"];

export default function Step1Form({ initialName }: { initialName: string }) {
  const [state, formAction, pending] = useActionState(saveStep1, null);
  const [open, setOpen] = useState(false);
  const [role, setRole] = useState<string | null>(null);
  const [teamSize, setTeamSize] = useState<string | null>(null);
  const [shake, setShake] = useState(false);
  const ddRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function onClick(e: MouseEvent) {
      if (ddRef.current && !ddRef.current.contains(e.target as Node)) setOpen(false);
    }
    function onEsc(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }
    document.addEventListener("click", onClick);
    document.addEventListener("keydown", onEsc);
    return () => {
      document.removeEventListener("click", onClick);
      document.removeEventListener("keydown", onEsc);
    };
  }, []);

  function handleSubmit(formData: FormData) {
    if (!teamSize) {
      setShake(true);
      setTimeout(() => setShake(false), 300);
      return;
    }
    formData.set("role", role ?? "");
    formData.set("teamSize", teamSize);
    formAction(formData);
  }

  return (
    <div className="onboard-wrap">
      <div className="onboard-card">
        <div className="onboard-progress-track"><div className="onboard-progress-fill" style={{ width: "33%" }} /></div>
        <div className="onboard-step-label mono">STEP 1 OF 3{initialName ? ` — ${initialName}` : ""}</div>
        <div className="onboard-headline">Tell us about yourself</div>
        <div className="onboard-sub">Helps Schela personalise from day one.</div>

        <form action={handleSubmit}>
          <div className="field-group">
            <label className="field-label">Full name</label>
            <input type="text" name="fullName" className="field-input" defaultValue={initialName} />
          </div>

          <div className="field-group">
            <label className="field-label">Role</label>
            <div className={`role-dropdown ${open ? "open" : ""}`} ref={ddRef}>
              <div className={`role-dropdown-trigger ${!role ? "placeholder" : ""}`} onClick={() => setOpen((v) => !v)}>
                <span>{role ?? "Select your role"}</span>
                <span className="material-symbols-outlined">expand_more</span>
              </div>
              <div className="role-dropdown-panel">
                {ROLES.map((r) => (
                  <div
                    key={r}
                    className={`role-dropdown-row ${role === r ? "selected" : ""}`}
                    onClick={() => { setRole(r); setOpen(false); }}
                  >
                    <span>{r}</span>
                    <span className="material-symbols-outlined role-check">check</span>
                  </div>
                ))}
              </div>
            </div>
          </div>

          <div className="field-group">
            <label className="field-label">Company <span style={{ color: "var(--muted)", fontWeight: 600 }}>(optional)</span></label>
            <input type="text" name="company" className="field-input" placeholder="Acme Inc." />
          </div>

          <div className="field-group">
            <label className="field-label">Team size</label>
            <div className="team-size-row" style={shake ? { animation: "shake .3s ease" } : undefined}>
              {TEAM_SIZES.map((s) => (
                <div
                  key={s}
                  className={`team-size-chip ${teamSize === s ? "selected" : ""}`}
                  onClick={() => setTeamSize(s)}
                >
                  {s}
                </div>
              ))}
            </div>
          </div>

          {state?.error && (
            <div style={{ fontSize: 12.5, color: "#C23A34", fontWeight: 600, marginTop: 10 }}>{state.error}</div>
          )}

          <div className="onboard-actions">
            <a className="btn-outline-onb" href="/login" style={{ display: "flex", alignItems: "center", justifyContent: "center", textDecoration: "none", color: "inherit" }}>Back</a>
            <button type="submit" className="btn-primary" disabled={pending}>
              {pending ? <span className="btn-dots"><span /><span /><span /></span> : "Continue →"}
            </button>
          </div>
        </form>
        <div style={{ textAlign: "center", marginTop: 16 }}>
          <a className="onboard-skip" onClick={() => skipOnboarding()}>I&apos;ll do this later</a>
        </div>
      </div>
    </div>
  );
}
