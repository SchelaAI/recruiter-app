"use client";

import { useActionState } from "react";
import { requestPasswordReset } from "@/app/(auth)/actions";

export default function ForgotPasswordPage() {
  const [state, formAction, pending] = useActionState(requestPasswordReset, null);

  return (
    <div className="login-split">
      <div className="login-right" style={{ width: "100%" }}>
        <div className="login-right-inner">
          <div className="logo-lockup" style={{ marginBottom: 24 }}>
            <div className="logomark">S</div>
            <span>Schela</span>
          </div>

          {state?.success ? (
            <>
              <div className="login-form-title">Check your email</div>
              <div className="login-form-sub">
                If an account exists for that address, we&apos;ve sent a link to reset your password. It expires in an hour.
              </div>
              <a className="btn btn-solid" href="/login" style={{ marginTop: 18, width: "100%", justifyContent: "center", textDecoration: "none" }}>
                Back to log in
              </a>
            </>
          ) : (
            <>
              <div className="login-form-title">Reset your password</div>
              <div className="login-form-sub">Enter your email and we&apos;ll send you a reset link.</div>
              <form action={formAction}>
                <div className="field-group">
                  <label className="field-label">Email</label>
                  <input type="email" name="email" className="field-input" placeholder="you@company.com" required />
                </div>
                {state?.error && (
                  <div style={{ fontSize: 12.5, color: "#C23A34", fontWeight: 600, marginTop: 8 }}>{state.error}</div>
                )}
                <button type="submit" className="btn btn-solid" style={{ marginTop: 14, width: "100%", justifyContent: "center" }} disabled={pending}>
                  {pending ? "Sending…" : "Send reset link"}
                </button>
              </form>
              <div style={{ textAlign: "center", marginTop: 16 }}>
                <a className="link-purple" href="/login">Back to log in</a>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
