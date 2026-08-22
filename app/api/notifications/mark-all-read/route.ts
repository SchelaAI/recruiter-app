import { NextResponse } from "next/server";
import { markAllNotificationsRead } from "@/lib/store";

export async function POST() {
  try {
    await markAllNotificationsRead();
    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("[api/notifications/mark-all-read POST]", err);
    return NextResponse.json({ error: err instanceof Error ? err.message : "Unknown error" }, { status: 500 });
  }
}
