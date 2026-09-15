import { NextResponse } from "next/server";
import { getLiveActivity } from "@/lib/store";

export async function GET() {
  try {
    const activity = await getLiveActivity();
    return NextResponse.json(activity);
  } catch (err) {
    console.error("[api/live-activity GET]", err);
    return NextResponse.json({ error: err instanceof Error ? err.message : "Unknown error" }, { status: 500 });
  }
}
