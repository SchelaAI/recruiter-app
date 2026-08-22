import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import Step1Form from "./step1-form";

export default async function OnboardingStep1() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: profile } = await supabase
    .from("profiles")
    .select("full_name")
    .eq("id", user.id)
    .single();

  return <Step1Form initialName={profile?.full_name ?? ""} />;
}
