"use client";

import { useActionState, useEffect, useRef, useState, Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { verifyOtp, resendOtp } from "@/app/(auth)/actions";

function VerifyForm() {
  const params = useSearchParams();
  const router = useRouter();
  const email = params.get("email") ?? "";
  const [state, formAction, pending] = useActionState(verifyOtp, null);
  const [digits, setDigits] = useState<string[]>(Array(6).fill(""));
  const [secondsLeft, setSecondsLeft] = useState(298);
  const [resending, setResending] = useState(false);
  const inputsRef = useRef<(HTMLInputElement | null)[]>([]);

  useEffect(() => {
    if (secondsLeft <= 0) return;
    const t = setInterval(() => setSecondsLeft((s) => s - 1), 1000);
    return () => clearInterval(t);
  }, [secondsLeft]);

  useEffect(() => {
    if (!email) router.replace("/login");
  }, [email, router]);

  function handleChange(i: number, val: string) {
    const clean = val.replace(/[^0-9]/g, "").slice(-1);
    const next = [...digits];
    next[i] = clean;
    setDigits(next);
    if (clean && i < 5) inputsRef.current[i + 1]?.focus();
  }
  function handleKeyDown(i: number, e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === "Backspace" && !digits[i] && i > 0) {
      inputsRef.current[i - 1]?.focus();
    }
  }
  function handlePaste(e: React.ClipboardEvent) {
    e.preventDefault();
    const pasted = (e.clipboardData.getData("text").match(/[0-9]/g) || []).slice(0, 6);
    const next = Array(6).fill("");
    pasted.forEach((d, i) => (next[i] = d));
    setDigits(next);
    inputsRef.current[Math.min(pasted.length, 5)]?.focus();
  }
  async function handleResend() {
    setResending(true);
    await resendOtp(email);
    setSecondsLeft(298);
    setDigits(Array(6).fill(""));
    setResending(false);
    inputsRef.current[0]?.focus();
  }

  const allFilled = digits.every((d) => d.length === 1);
  const expired = secondsLeft <= 0;
  const mm = String(Math.floor(secondsLeft / 60)).padStart(2, "0");
  const ss = String(secondsLeft % 60).padStart(2, "0");

  return (
    <div className="verify-wrap">
      <div className="verify-card">
        <div className="logomark" style={{ margin: "0 auto" }}>S</div>
        <div className="verify-headline">Check your inbox</div>
        <div className="verify-sub">
          We sent a 6-digit code to <span className="verify-email">{email}</span>
        </div>

        <form action={formAction}>
          <input type="hidden" name="email" value={email} />
          <input type="hidden" name="token" value={digits.join("")} />
          <div className="otp-row">
            {digits.map((d, i) => (
              <input
                key={i}
                ref={(el) => { inputsRef.current[i] = el; }}
                type="text"
                inputMode="numeric"
                maxLength={1}
                className={`otp-box ${d ? "filled" : ""} ${state?.error ? "error" : ""}`}
                value={d}
                onChange={(e) => handleChange(i, e.target.value)}
                onKeyDown={(e) => handleKeyDown(i, e)}
                onPaste={handlePaste}
              />
            ))}
          </div>
          <div className={`otp-timer mono ${expired ? "expired" : ""}`}>
            {expired ? "Code expired" : `Expires in ${mm}:${ss}`}
          </div>
          {state?.error && (
            <div style={{ fontSize: 12.5, color: "#C23A34", fontWeight: 600, marginBottom: 14 }}>{state.error}</div>
          )}
          <button type="submit" className="btn-primary" disabled={!allFilled || expired || pending}>
            {pending ? <span className="btn-dots"><span /><span /><span /></span> : "Verify"}
          </button>
        </form>
        <div className="otp-resend">
          Didn&apos;t get it?{" "}
          <a className={expired ? "enabled" : ""} onClick={expired && !resending ? handleResend : undefined}>
            {resending ? "Sending…" : "Resend code"}
          </a>
        </div>
      </div>
    </div>
  );
}

export default function VerifyPage() {
  return (
    <Suspense fallback={null}>
      <VerifyForm />
    </Suspense>
  );
}
