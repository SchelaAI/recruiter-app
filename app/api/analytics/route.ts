import { NextResponse } from "next/server";
import { getAnalyticsSummary } from "@/lib/store";

export async function GET() {
  try {
    const summary = await getAnalyticsSummary();
    return NextResponse.json(summary);
  } catch (err) {
    console.error("[api/analytics GET]", err);
    return NextResponse.json({ error: err instanceof Error ? err.message : "Unknown error" }, { status: 500 });
  }
}
