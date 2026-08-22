import { NextResponse } from "next/server";
import { sendReminders } from "@/lib/store";

export async function POST() {
  try {
    const result = await sendReminders();
    return NextResponse.json(result);
  } catch (err) {
    console.error("[api/reminders POST]", err);
    return NextResponse.json({ error: err instanceof Error ? err.message : "Unknown error" }, { status: 500 });
  }
}
