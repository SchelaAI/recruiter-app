import { NextResponse } from "next/server";
import { markNotificationRead } from "@/lib/store";

export async function POST(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    await markNotificationRead(id);
    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("[api/notifications/:id/read POST]", err);
    return NextResponse.json({ error: err instanceof Error ? err.message : "Unknown error" }, { status: 500 });
  }
}
