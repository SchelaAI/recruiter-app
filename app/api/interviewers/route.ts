import { NextRequest, NextResponse } from "next/server";
import { listInterviewers, createInterviewer } from "@/lib/store";

export async function GET() {
  try {
    const interviewers = await listInterviewers();
    return NextResponse.json({ interviewers });
  } catch (err) {
    console.error("[api/interviewers GET]", err);
    return NextResponse.json({ error: err instanceof Error ? err.message : "Unknown error" }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    if (!body.name || typeof body.name !== "string") {
      return NextResponse.json({ error: "name is required" }, { status: 400 });
    }
    const interviewer = await createInterviewer({ name: body.name, role: body.role, email: body.email });
    return NextResponse.json({ interviewer }, { status: 201 });
  } catch (err) {
    console.error("[api/interviewers POST]", err);
    return NextResponse.json({ error: err instanceof Error ? err.message : "Unknown error" }, { status: 500 });
  }
}
