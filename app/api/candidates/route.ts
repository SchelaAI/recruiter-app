import { NextRequest, NextResponse } from "next/server";
import { listCandidates, createCandidate } from "@/lib/store";

export async function GET() {
  try {
    const candidates = await listCandidates();
    return NextResponse.json({ candidates });
  } catch (err) {
    console.error("[api/candidates GET]", err);
    return NextResponse.json({ error: err instanceof Error ? err.message : "Unknown error" }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    if (!body.name || !body.phone || !body.email) {
      return NextResponse.json({ error: "name, phone, and email are required" }, { status: 400 });
    }
    const candidate = await createCandidate(body);
    return NextResponse.json({ candidate }, { status: 201 });
  } catch (err) {
    console.error("[api/candidates POST]", err);
    return NextResponse.json({ error: err instanceof Error ? err.message : "Unknown error" }, { status: 500 });
  }
}
