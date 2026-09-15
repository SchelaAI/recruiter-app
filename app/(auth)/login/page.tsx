"use client";

import { useActionState, useState } from "react";
import { signInWithGoogle, signInWithLinkedIn, signUpWithEmail, signInWithEmail } from "@/app/(auth)/actions";

export default function LoginPage() {
  const [mode, setMode] = useState<"signup" | "login">("signup");
  const [signupState, signupAction, signupPending] = useActionState(signUpWithEmail, null);
  const [loginState, loginAction, loginPending] = useActionState(signInWithEmail, null);

  const state = mode === "signup" ? signupState : loginState;
  const pending = mode === "signup" ? signupPending : loginPending;

  return (
    <div className="login-split">
      <div className="login-left">
        <div className="login-orb" />
        <div className="login-left-top">
          <div className="logo-lockup">
            <div className="logomark">S</div>
            <span>Schela</span>
          </div>
          <div className="login-headline">
            Stop chasing.
            <br />
            Let Schela run the thread.
          </div>
          <div className="login-features">
            <div className="login-feature"><span className="login-feature-dot" />WhatsApp + Email — fully automated</div>
            <div className="login-feature"><span className="login-feature-dot" />AI handles 92% of replies without you</div>
            <div className="login-feature"><span className="login-feature-dot" />Interviews confirmed in under 2 hours</div>
          </div>
        </div>
        <div className="login-testimonial">
          <div className="login-testimonial-quote">&quot;Finally — no more chasing on WhatsApp. Schela handles it.&quot;</div>
          <div className="login-testimonial-author">— Senior Recruiter · Early Access</div>
        </div>
      </div>

      <div className="login-right">
        <div className="login-right-inner">
          <div className="auth-tabs">
            <div className={`auth-tab ${mode === "signup" ? "active" : ""}`} onClick={() => setMode("signup")}>Sign up</div>
            <div className={`auth-tab ${mode === "login" ? "active" : ""}`} onClick={() => setMode("login")}>Log in</div>
          </div>
          <div className="auth-headline">{mode === "signup" ? "Create your account" : "Welcome back"}</div>
          <div className="auth-subline">
            {mode === "signup" ? "Start automating your recruiting conversations today." : "Log in to keep the conversations moving."}
          </div>

          <div className="social-row">
            <form action={signInWithGoogle}>
              <button type="submit" className="btn-social" style={{ width: "100%" }}>
                <svg viewBox="0 0 24 24"><path fill="#4285F4" d="M23.5 12.27c0-.82-.07-1.6-.2-2.36H12v4.47h6.47a5.5 5.5 0 0 1-2.4 3.6v3h3.87c2.27-2.09 3.56-5.17 3.56-8.71z"/><path fill="#34A853" d="M12 24c3.24 0 5.96-1.07 7.94-2.91l-3.87-3c-1.08.72-2.45 1.15-4.07 1.15-3.13 0-5.78-2.11-6.73-4.96H1.28v3.1A12 12 0 0 0 12 24z"/><path fill="#FBBC05" d="M5.27 14.28A7.2 7.2 0 0 1 4.89 12c0-.79.14-1.56.38-2.28v-3.1H1.28A12 12 0 0 0 0 12c0 1.94.46 3.77 1.28 5.38l3.99-3.1z"/><path fill="#EA4335" d="M12 4.77c1.77 0 3.35.61 4.6 1.8l3.42-3.42C17.95 1.19 15.24 0 12 0 7.31 0 3.26 2.69 1.28 6.62l3.99 3.1C6.22 6.88 8.87 4.77 12 4.77z"/></svg>
                Google
              </button>
            </form>
            <form action={signInWithLinkedIn}>
              <button type="submit" className="btn-social" style={{ width: "100%" }}>
                <svg viewBox="0 0 24 24"><path fill="#0A66C2" d="M20.45 20.45h-3.56v-5.57c0-1.33-.03-3.04-1.85-3.04-1.86 0-2.14 1.45-2.14 2.94v5.67H9.34V9h3.41v1.56h.05c.48-.9 1.64-1.85 3.38-1.85 3.61 0 4.28 2.38 4.28 5.47v6.27zM5.34 7.43a2.07 2.07 0 1 1 0-4.13 2.07 2.07 0 0 1 0 4.13zM7.12 20.45H3.56V9h3.56v11.45zM22.22 0H1.77C.79 0 0 .77 0 1.73v20.54C0 23.23.79 24 1.77 24h20.45c.98 0 1.78-.77 1.78-1.73V1.73C24 .77 23.2 0 22.22 0z"/></svg>
                LinkedIn
              </button>
            </form>
          </div>
          <div className="auth-divider">or continue with email</div>

          <form action={mode === "signup" ? signupAction : loginAction}>
            {mode === "signup" && (
              <div className="field-group field-collapse show">
                <label className="field-label">Full name</label>
                <input type="text" name="fullName" className="field-input" placeholder="Your full name" required />
              </div>
            )}
            <div className="field-group">
              <label className="field-label">Email</label>
              <input type="email" name="email" className="field-input" placeholder="you@company.com" required />
            </div>
            {mode === "login" && (
              <div className="field-group field-collapse show">
                <label className="field-label" style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                  Password <a className="link-purple" href="/forgot-password">Forgot password?</a>
                </label>
                <input type="password" name="password" className="field-input" placeholder="••••••••" required />
              </div>
            )}
            {mode === "signup" && (
              <div className="field-group">
                <label className="field-label">Password</label>
                <input type="password" name="password" className="field-input" placeholder="At least 8 characters" required minLength={8} />
              </div>
            )}

            {state?.error && (
              <div style={{ fontSize: 12.5, color: "#C23A34", fontWeight: 600, marginBottom: 14 }}>{state.error}</div>
            )}

            <button type="submit" className="btn-primary" disabled={pending} style={{ marginTop: 6 }}>
              {pending ? (
                <span className="btn-dots"><span /><span /><span /></span>
              ) : (
                mode === "signup" ? "Create account →" : "Continue →"
              )}
            </button>
          </form>
          <div className="auth-fineprint">By continuing you agree to our Terms</div>
        </div>
      </div>
    </div>
  );
}
