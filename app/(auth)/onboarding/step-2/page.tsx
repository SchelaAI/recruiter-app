"use client";

import { useActionState, useState } from "react";
import { saveStep2, skipOnboarding } from "@/app/(auth)/onboarding/actions";

const OPTIONS = [
  { id: "wa", icon: "chat", label: "WhatsApp first" },
  { id: "em", icon: "mail", label: "Email first" },
  { id: "both", icon: "sync_alt", label: "Let AI decide" },
];

export default function OnboardingStep2() {
  const [state, formAction, pending] = useActionState(saveStep2, null);
  const [channel, setChannel] = useState<string | null>(null);

  function handleSubmit(formData: FormData) {
    formData.set("channelPreference", channel ?? "");
    formAction(formData);
  }

  return (
    <div className="onboard-wrap">
      <div className="onboard-card">
        <div className="onboard-progress-track"><div className="onboard-progress-fill" style={{ width: "66%" }} /></div>
        <div className="onboard-step-label mono">STEP 2 OF 3</div>
        <div className="onboard-headline">How should Schela reach candidates?</div>
        <div className="onboard-sub">You can change this later in Settings → Channels.</div>

        <form action={handleSubmit}>
          <div className="channel-pref-row">
            {OPTIONS.map((o) => (
              <div
                key={o.id}
                className={`channel-pref-card ${channel === o.id ? "selected" : ""}`}
                onClick={() => setChannel(o.id)}
              >
                <span className="material-symbols-outlined">{o.icon}</span>
                <div className="role-card-title">{o.label}</div>
              </div>
            ))}
          </div>

          {state?.error && (
            <div style={{ fontSize: 12.5, color: "#C23A34", fontWeight: 600, marginTop: 10 }}>{state.error}</div>
          )}

          <div className="onboard-actions">
            <a className="btn-outline-onb" href="/onboarding/step-1" style={{ display: "flex", alignItems: "center", justifyContent: "center", textDecoration: "none", color: "inherit" }}>Back</a>
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
