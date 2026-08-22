import { NextResponse } from "next/server";
import { listNotifications } from "@/lib/store";

export async function GET() {
  try {
    const notifications = await listNotifications();
    return NextResponse.json({ notifications });
  } catch (err) {
    console.error("[api/notifications GET]", err);
    return NextResponse.json({ error: err instanceof Error ? err.message : "Unknown error" }, { status: 500 });
  }
}
