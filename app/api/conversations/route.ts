import { NextResponse } from "next/server";
import { listConversations } from "@/lib/store";

export async function GET() {
  try {
    const conversations = await listConversations();
    return NextResponse.json({ conversations });
  } catch (err) {
    console.error("[api/conversations GET]", err);
    return NextResponse.json({ error: err instanceof Error ? err.message : "Unknown error" }, { status: 500 });
  }
}
