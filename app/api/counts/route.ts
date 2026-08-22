import { NextResponse } from "next/server";
import { getNavCounts } from "@/lib/store";

export async function GET() {
  try {
    const counts = await getNavCounts();
    return NextResponse.json(counts);
  } catch (err) {
    console.error("[api/counts GET]", err);
    return NextResponse.json({ error: err instanceof Error ? err.message : "Unknown error" }, { status: 500 });
  }
}
