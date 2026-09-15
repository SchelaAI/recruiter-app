"use client";

import { useTransition } from "react";
import { finishOnboarding } from "@/app/(auth)/onboarding/actions";

export default function OnboardingStep3() {
  const [pending, startTransition] = useTransition();

  return (
    <div className="onboard-wrap">
      <div className="onboard-card">
        <div className="onboard-progress-track"><div className="onboard-progress-fill" style={{ width: "100%" }} /></div>
        <div className="onboard-step-label mono">STEP 3 OF 3</div>
        <div className="onboard-headline">Connect your calendar</div>
        <div className="onboard-sub">So Schela knows when you&apos;re actually free. You can skip this and do it later.</div>

        <div className="social-row" style={{ marginBottom: 20 }}>
          {/* Real OAuth — same flow as Settings → Integrations. Connecting
              here is optional; SETUP.md documents the env vars each provider
              needs, and the buttons work identically whether or not this
              deployment has them configured (Microsoft/Zoom either redirect
              to consent, or Schela reports it isn't set up yet). */}
          <a className="btn-social" href="/api/integrations/oauth/outlook/connect">
            <span className="material-symbols-outlined" style={{ fontSize: 17, color: "var(--purple)" }}>event</span>
            Outlook
          </a>
          <a className="btn-social" href="/api/integrations/oauth/zoom/connect">
            <span className="material-symbols-outlined" style={{ fontSize: 17, color: "var(--purple)" }}>videocam</span>
            Zoom
          </a>
        </div>

        <div className="onboard-actions">
          <a className="btn-outline-onb" href="/onboarding/step-2" style={{ display: "flex", alignItems: "center", justifyContent: "center", textDecoration: "none", color: "inherit" }}>Back</a>
          <button
            type="button"
            className="btn-primary"
            disabled={pending}
            onClick={() => startTransition(() => finishOnboarding())}
          >
            {pending ? <span className="btn-dots"><span /><span /><span /></span> : "Finish →"}
          </button>
        </div>
      </div>
    </div>
  );
}
