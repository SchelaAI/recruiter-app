"use server";

import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import { getSiteUrl } from "@/lib/siteUrl";

export async function signInWithGoogle() {
  const supabase = await createClient();
  const siteUrl = await getSiteUrl();

  const { data, error } = await supabase.auth.signInWithOAuth({
    provider: "google",
    options: { redirectTo: `${siteUrl}/auth/callback` },
  });

  if (error || !data.url) redirect("/login?error=oauth_failed");
  redirect(data.url);
}

export async function signInWithLinkedIn() {
  const supabase = await createClient();
  const siteUrl = await getSiteUrl();

  // Supabase's provider name for LinkedIn is "linkedin_oidc" (the older
  // "linkedin" provider is deprecated on LinkedIn's side) — this must match
  // exactly what's enabled in Supabase Dashboard → Authentication → Providers.
  const { data, error } = await supabase.auth.signInWithOAuth({
    provider: "linkedin_oidc",
    options: { redirectTo: `${siteUrl}/auth/callback` },
  });

  if (error || !data.url) redirect("/login?error=oauth_failed");
  redirect(data.url);
}

export type AuthActionState = { error?: string } | null;

export async function signUpWithEmail(
  _prevState: AuthActionState,
  formData: FormData
): Promise<AuthActionState> {
  const fullName = String(formData.get("fullName") ?? "").trim();
  const email = String(formData.get("email") ?? "").trim();
  const password = String(formData.get("password") ?? "");

  if (!fullName) return { error: "Full name is required." };
  if (!email) return { error: "Email is required." };
  if (password.length < 8) return { error: "Password must be at least 8 characters." };

  const supabase = await createClient();
  const { error } = await supabase.auth.signUp({
    email,
    password,
    options: { data: { full_name: fullName } },
  });

  if (error) return { error: error.message };

  redirect(`/verify?email=${encodeURIComponent(email)}`);
}

export async function signInWithEmail(
  _prevState: AuthActionState,
  formData: FormData
): Promise<AuthActionState> {
  const email = String(formData.get("email") ?? "").trim();
  const password = String(formData.get("password") ?? "");

  const supabase = await createClient();
  const { error } = await supabase.auth.signInWithPassword({ email, password });

  if (error) return { error: "Incorrect email or password." };

  redirect("/");
}

export type VerifyState = { error?: string; success?: boolean } | null;

export async function verifyOtp(
  _prevState: VerifyState,
  formData: FormData
): Promise<VerifyState> {
  const email = String(formData.get("email") ?? "");
  const token = String(formData.get("token") ?? "");

  if (token.length !== 6) return { error: "Enter all 6 digits." };

  const supabase = await createClient();
  const { error } = await supabase.auth.verifyOtp({ email, token, type: "signup" });

  if (error) return { error: "That code is incorrect or has expired." };

  redirect("/onboarding/step-1");
}

export async function resendOtp(email: string) {
  const supabase = await createClient();
  await supabase.auth.resend({ type: "signup", email });
}

export async function signOut() {
  const supabase = await createClient();
  await supabase.auth.signOut();
  redirect("/login");
}

export type ResetState = { error?: string; success?: boolean } | null;

export async function requestPasswordReset(
  _prevState: ResetState,
  formData: FormData
): Promise<ResetState> {
  const email = String(formData.get("email") ?? "").trim();
  if (!email) return { error: "Email is required." };

  const supabase = await createClient();
  const siteUrl = await getSiteUrl();

  // The reset email links back through /auth/callback, which exchanges the
  // one-time code for a session and then forwards to /reset-password.
  const { error } = await supabase.auth.resetPasswordForEmail(email, {
    redirectTo: `${siteUrl}/auth/callback?next=/reset-password`,
  });

  // Always report success regardless of whether the address exists — not
  // leaking which emails have accounts is the correct behavior here.
  if (error) console.error("[requestPasswordReset]", error.message);
  return { success: true };
}

export async function updatePassword(
  _prevState: AuthActionState,
  formData: FormData
): Promise<AuthActionState> {
  const password = String(formData.get("password") ?? "");
  if (password.length < 8) return { error: "Password must be at least 8 characters." };

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Your reset link has expired. Request a new one." };

  const { error } = await supabase.auth.updateUser({ password });
  if (error) return { error: error.message };

  redirect("/");
}
