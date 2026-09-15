import { createClient } from "@/lib/supabase/server";
import { NextResponse, type NextRequest } from "next/server";

/**
 * Google and LinkedIn both redirect here after the user approves consent.
 * We exchange the one-time `code` for a real session, then decide where to
 * send them next: straight to the dashboard if onboarding is already done,
 * otherwise into Step 1 — this is what lets a Google/LinkedIn signup skip
 * the email OTP screen entirely (they've already verified via the provider)
 * while still going through the same onboarding as an email signup.
 */
export async function GET(request: NextRequest) {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get("code");
  const next = searchParams.get("next");

  if (!code) {
    return NextResponse.redirect(`${origin}/auth/auth-code-error`);
  }

  const supabase = await createClient();
  const { error } = await supabase.auth.exchangeCodeForSession(code);

  if (error) {
    return NextResponse.redirect(`${origin}/auth/auth-code-error`);
  }

  // Password-reset (and any other) links pass an explicit next destination —
  // honor it once the session exists (e.g. /reset-password to set a new one).
  if (next && next.startsWith("/")) {
    return NextResponse.redirect(`${origin}${next}`);
  }

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (user) {
    const { data: profile } = await supabase
      .from("profiles")
      .select("onboarding_completed")
      .eq("id", user.id)
      .single();

    if (profile && !profile.onboarding_completed) {
      return NextResponse.redirect(`${origin}/onboarding/step-1`);
    }
  }

  return NextResponse.redirect(`${origin}/`);
}
