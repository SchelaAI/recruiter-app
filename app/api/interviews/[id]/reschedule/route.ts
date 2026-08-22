import { NextRequest, NextResponse } from "next/server";
import { rescheduleInterview } from "@/lib/store";

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const { scheduledAt } = await req.json();
    if (!scheduledAt || typeof scheduledAt !== "string" || isNaN(new Date(scheduledAt).getTime())) {
      return NextResponse.json({ error: "scheduledAt must be a valid ISO datetime" }, { status: 400 });
    }
    const result = await rescheduleInterview(Number(id), scheduledAt);
    if (!result.interview) {
      return NextResponse.json({ error: result.deliveryError ?? "Reschedule failed" }, { status: 400 });
    }
    return NextResponse.json(result);
  } catch (err) {
    console.error("[api/interviews/:id/reschedule POST]", err);
    return NextResponse.json({ error: err instanceof Error ? err.message : "Unknown error" }, { status: 500 });
  }
}
