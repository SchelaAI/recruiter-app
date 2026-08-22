import { NextRequest, NextResponse } from "next/server";
import { listInterviews, createInterview, type CreateInterviewInput } from "@/lib/store";

export async function GET() {
  try {
    const interviews = await listInterviews();
    return NextResponse.json({ interviews });
  } catch (err) {
    console.error("[api/interviews GET]", err);
    return NextResponse.json({ error: err instanceof Error ? err.message : "Unknown error" }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = (await req.json()) as CreateInterviewInput;
    if (!body.cand || !body.jobPosition) {
      return NextResponse.json({ error: "cand and jobPosition are required" }, { status: 400 });
    }
    if (!body.scheduledAt) {
      return NextResponse.json({ error: "scheduledAt is required" }, { status: 400 });
    }
    const interview = await createInterview(body);
    return NextResponse.json({ interview }, { status: 201 });
  } catch (err) {
    console.error("[api/interviews POST]", err);
    return NextResponse.json({ error: err instanceof Error ? err.message : "Unknown error" }, { status: 500 });
  }
}
