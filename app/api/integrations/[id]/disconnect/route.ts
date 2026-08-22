import { NextRequest, NextResponse } from "next/server";
import { disconnectIntegration } from "@/lib/store";

export async function POST(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const ok = await disconnectIntegration(id);
    if (!ok) return NextResponse.json({ error: "Could not disconnect" }, { status: 400 });
    return NextResponse.json({ success: true });
  } catch (err) {
    console.error("[api/integrations/:id/disconnect]", err);
    return NextResponse.json({ error: err instanceof Error ? err.message : "Unknown error" }, { status: 500 });
  }
}
