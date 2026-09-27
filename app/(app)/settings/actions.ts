"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { requireAppUser } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";

function text(form: FormData, key: string) { return String(form.get(key) ?? "").trim(); }
function checked(form: FormData, key: string) { return form.get(key) === "on"; }

async function update(values: Record<string, unknown>, tab: string) {
  const { user } = await requireAppUser();
  const admin = createAdminClient();
  const { error } = await admin.from("profiles").update({ ...values, updated_at: new Date().toISOString() }).eq("id", user.id);
  if (error) redirect(`/settings?tab=${tab}&error=${encodeURIComponent("Could not save settings")}`);
  revalidatePath("/settings");
  revalidatePath("/dashboard");
  redirect(`/settings?tab=${tab}&saved=1`);
}

export async function updateProfileSettings(form: FormData) {
  const fullName = text(form, "fullName").slice(0, 160);
  const phone = text(form, "phone").slice(0, 40) || null;
  if (!fullName) redirect("/settings?tab=profile&error=Name%20is%20required");
  await update({ full_name: fullName, phone }, "profile");
}

export async function updateAiSettings(form: FormData) {
  const threshold = Math.max(0, Math.min(100, Math.round(Number(text(form, "threshold")) || 65)));
  await update({ ai_confidence_threshold: threshold, ai_auto_execute: checked(form, "autoExecute"), ai_log_decisions: checked(form, "logDecisions") }, "ai");
}

export async function updateSchedulingSettings(form: FormData) {
  const duration = text(form, "duration") || "45m";
  const buffer = Math.max(0, Math.min(180, Number(text(form, "buffer")) || 15));
  const limit = Math.max(0, Math.min(20, Number(text(form, "rescheduleLimit")) || 3));
  await update({ scheduling_duration: duration, scheduling_buffer_min: buffer, scheduling_reschedule_limit: limit, working_hours_start: text(form, "start") || "09:00", working_hours_end: text(form, "end") || "18:00" }, "scheduling");
}

export async function updateNotificationSettings(form: FormData) {
  await update({ notif_new_reply: checked(form, "newReply"), notif_confirmed: checked(form, "confirmed"), notif_reminders: checked(form, "reminders"), notif_weekly_digest: checked(form, "digest") }, "notifications");
}

export async function updateChannelSettings(form: FormData) {
  await update({ email_from_name: text(form, "fromName").slice(0, 120) || null, email_from_address: text(form, "fromAddress").slice(0, 255) || null, email_reply_to: text(form, "replyTo").slice(0, 255) || null, email_signature: text(form, "signature").slice(0, 2000) || null }, "channels");
}
