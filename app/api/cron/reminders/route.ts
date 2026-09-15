import { NextRequest, NextResponse } from "next/server";
import { sendDueReminders, sendNoReplyFollowUps } from "@/lib/store";

/**
 * Cron endpoint for scheduled outbound messaging. Runs two independent jobs:
 *
 *  1. Interview reminders — 24h and 1h before a scheduled interview.
 *  2. No-reply follow-ups — if a candidate hasn't replied to their WhatsApp
 *     invitation within 24h, follow up by EMAIL instead of repeating on a
 *     channel they're clearly not reading.
 *
 * Protected by CRON_SECRET: this is a public URL that sends real messages, so
 * it must not be triggerable by anyone who finds it. Whichever scheduler you
 * use (cron-job.org, EasyCron, GitHub Actions, etc.) must send the secret as
 * an "Authorization: Bearer <CRON_SECRET>" header — see SETUP.md section 13.
 *
 * Safe to call repeatedly: sendDueReminders() stamps each interview as it
 * sends, so overlapping runs or retries cannot double-message a candidate.
 */
export async function GET(req: NextRequest) {
  const secret = process.env.CRON_SECRET;
  if (secret) {
    const auth = req.headers.get("authorization");
    if (auth !== `Bearer ${secret}`) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
  } else {
    console.warn("[cron/reminders] CRON_SECRET is not set — this endpoint is publicly triggerable.");
  }

  try {
    // Run both independently: a failure in one must not silently cancel the
    // other, which is what a plain sequential await would do.
    const [reminders, followUps] = await Promise.allSettled([
      sendDueReminders(),
      sendNoReplyFollowUps(),
    ]);

    if (reminders.status === "rejected") console.error("[cron] reminders failed:", reminders.reason);
    if (followUps.status === "rejected") console.error("[cron] no-reply follow-ups failed:", followUps.reason);

    const result = {
      reminders: reminders.status === "fulfilled" ? reminders.value : { error: String(reminders.reason) },
      followUps: followUps.status === "fulfilled" ? followUps.value : { error: String(followUps.reason) },
    };
    console.log("[cron]", JSON.stringify(result));
    return NextResponse.json(result);
  } catch (err) {
    console.error("[cron/reminders] failed:", err);
    return NextResponse.json({ error: err instanceof Error ? err.message : "Unknown error" }, { status: 500 });
  }
}
