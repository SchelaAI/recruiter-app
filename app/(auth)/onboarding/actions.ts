"use server";

import { createClient, createAdminClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";

async function requireUser() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");
  return user;
}

export type OnboardingState = { error?: string } | null;

export async function saveStep1(
  _prevState: OnboardingState,
  formData: FormData
): Promise<OnboardingState> {
  const user = await requireUser();
  const fullName = String(formData.get("fullName") ?? "").trim();
  const role = String(formData.get("role") ?? "").trim();
  const company = String(formData.get("company") ?? "").trim();
  const teamSize = String(formData.get("teamSize") ?? "").trim();

  if (!teamSize) return { error: "Team size is required." };

  const supabase = await createClient();

  // A brand-new user has org_id = null, so current_org_id() (and every RLS
  // policy built on it) can't scope an insert yet — org creation has to go
  // through the admin client, which bypasses RLS. Every other write in this
  // app goes through the regular client; this is the one deliberate exception.
  const admin = createAdminClient();
  const { data: org, error: orgError } = await admin
    .from("organizations")
    .insert({ name: company || `${fullName || "New"}'s workspace` })
    .select()
    .single<{ id: string; name: string; created_at: string }>();

  if (orgError || !org) return { error: "Could not set up your workspace. Try again." };

  // Seed the integrations catalog for this org — real rows the user can
  // actually connect, starting disconnected. Belt-and-suspenders: even if
  // this insert is ever skipped, lib/store.ts's listIntegrations() self-heals
  // any org missing catalog rows the next time it loads the Integrations page.
  const { INTEGRATION_CATALOG } = await import("@/lib/store");
  await admin.from("integrations").insert(INTEGRATION_CATALOG.map((i) => ({ ...i, org_id: org.id, connected: false })));

  const { error: profileError } = await supabase
    .from("profiles")
    .update({
      org_id: org.id,
      full_name: fullName || undefined,
      onboarding_role: role || null,
      company: company || null,
      team_size: teamSize,
    })
    .eq("id", user.id);

  if (profileError) return { error: profileError.message };

  redirect("/onboarding/step-2");
}

export async function saveStep2(
  _prevState: OnboardingState,
  formData: FormData
): Promise<OnboardingState> {
  const user = await requireUser();
  const channelPreference = String(formData.get("channelPreference") ?? "");

  const supabase = await createClient();
  const { error } = await supabase
    .from("profiles")
    .update({ channel_preference: channelPreference || null })
    .eq("id", user.id);

  if (error) return { error: error.message };

  redirect("/onboarding/step-3");
}

export async function finishOnboarding() {
  const user = await requireUser();

  // Use the admin client here, same reasoning as org creation in saveStep1:
  // requireUser() has already confirmed this is a real, authenticated
  // Supabase user, so there's nothing left for RLS to protect against on
  // this specific write — and using it turns "the profiles row doesn't
  // exist yet, or RLS can't see it for some reason" into a self-healing
  // upsert instead of a hard failure.
  const admin = createAdminClient();
  const { data, error } = await admin
    .from("profiles")
    .upsert(
      { id: user.id, email: user.email ?? "", onboarding_completed: true },
      { onConflict: "id" }
    )
    .select("id, onboarding_completed")
    .single<{ id: string; onboarding_completed: boolean }>();

  if (error) {
    console.error("[finishOnboarding] failed to set onboarding_completed:", error.message);
    throw new Error(`Could not complete onboarding: ${error.message}`);
  }

  if (!data?.onboarding_completed) {
    console.error("[finishOnboarding] upsert returned unexpected row for user", user.id, data);
    throw new Error("Could not complete onboarding — please try again.");
  }

  redirect("/welcome");
}

export async function skipOnboarding() {
  await finishOnboarding();
}
