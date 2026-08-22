import { NextRequest, NextResponse } from "next/server";
import { sendMessage } from "@/lib/store";

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const { text } = await req.json();
    if (!text || typeof text !== "string" || !text.trim()) {
      return NextResponse.json({ error: "text is required" }, { status: 400 });
    }
    const result = await sendMessage(id, text, "schela");
    return NextResponse.json(
      {
        message: result.message,
        delivered: result.delivered,
        deliveryError: result.deliveryError,
        escalationResolved: result.escalationResolved,
      },
      { status: 201 }
    );
  } catch (err) {
    console.error("[api/conversations/:id/messages POST]", err);
    return NextResponse.json({ error: err instanceof Error ? err.message : "Unknown error" }, { status: 500 });
  }
}
