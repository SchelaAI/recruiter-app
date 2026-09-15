"use client";

import { useActionState } from "react";
import { updatePassword } from "@/app/(auth)/actions";

export default function ResetPasswordPage() {
  const [state, formAction, pending] = useActionState(updatePassword, null);

  return (
    <div className="login-split">
      <div className="login-right" style={{ width: "100%" }}>
        <div className="login-right-inner">
          <div className="logo-lockup" style={{ marginBottom: 24 }}>
            <div className="logomark">S</div>
            <span>Schela</span>
          </div>

          <div className="login-form-title">Set a new password</div>
          <div className="login-form-sub">Choose a new password for your account.</div>

          <form action={formAction}>
            <div className="field-group">
              <label className="field-label">New password</label>
              <input type="password" name="password" className="field-input" placeholder="At least 8 characters" required minLength={8} />
            </div>
            {state?.error && (
              <div style={{ fontSize: 12.5, color: "#C23A34", fontWeight: 600, marginTop: 8 }}>{state.error}</div>
            )}
            <button type="submit" className="btn btn-solid" style={{ marginTop: 14, width: "100%", justifyContent: "center" }} disabled={pending}>
              {pending ? "Saving…" : "Update password"}
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}
