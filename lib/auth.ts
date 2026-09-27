import { cache } from "react";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

export type SchelaProfile = {
  id: string;
  org_id: string | null;
  full_name: string;
  email: string;
  onboarding_completed: boolean;
  company: string | null;
  onboarding_role: string | null;
  team_size: string | null;
  channel_preference: string | null;
};

// React cache memoizes these lookups for one server render/request. The app layout
// and nested page can both ask for the current user without duplicating Auth/Profile IO.
export const getCurrentUser = cache(async () => {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  return user;
});

export const requireUser = cache(async () => {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect("/login");
  return { supabase, user };
});

export const requireAppUser = cache(async () => {
  const { supabase, user } = await requireUser();
  const { data: profile, error } = await supabase
    .from("profiles")
    .select(
      "id, org_id, full_name, email, onboarding_completed, company, onboarding_role, team_size, channel_preference",
    )
    .eq("id", user.id)
    .single();

  if (error || !profile) {
    redirect("/onboarding?error=Profile%20not%20ready");
  }

  const typedProfile = profile as SchelaProfile;
  if (!typedProfile.onboarding_completed || !typedProfile.org_id) {
    redirect("/onboarding");
  }

  return { supabase, user, profile: typedProfile };
});
