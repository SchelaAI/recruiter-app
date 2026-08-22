import { NextRequest, NextResponse } from "next/server";
import { sendDueReminders } from "@/lib/store";

/**
 * Cron endpoint for 24h / 1h interview reminders.
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
    const result = await sendDueReminders();
    console.log("[cron/reminders]", JSON.stringify(result));
    return NextResponse.json(result);
  } catch (err) {
    console.error("[cron/reminders] failed:", err);
    return NextResponse.json({ error: err instanceof Error ? err.message : "Unknown error" }, { status: 500 });
  }
}
