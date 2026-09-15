import { NextRequest, NextResponse } from "next/server";
import { receiveInboundMessage } from "@/lib/store";

/**
 * Manual test endpoint for the inbound AI pipeline.
 *
 * Real inbound traffic does NOT come through here — WhatsApp arrives at
 * /api/webhooks/whatsapp and email at /api/webhooks/email, both of which
 * resolve the candidate themselves (by phone number / sender address) and
 * are signature-verified. This route exists to exercise the same pipeline by
 * hand with a known candidateId, without needing a real message.
 *
 * Unlike those webhooks, this one runs behind normal auth (it resolves the
 * org from your session), so it can't be called anonymously.
 *
 * Body: { candidateId: string, text: string, channel: "wa" | "em" }
 */
export async function POST(req: NextRequest) {
  const body = await req.json();
  const { candidateId, text, channel } = body;

  if (!candidateId || !text || !channel) {
    return NextResponse.json({ error: "candidateId, text, and channel are required" }, { status: 400 });
  }
  if (channel !== "wa" && channel !== "em") {
    return NextResponse.json({ error: "channel must be 'wa' or 'em'" }, { status: 400 });
  }

  try {
    const result = await receiveInboundMessage(candidateId, text, channel);
    return NextResponse.json({ result }, { status: 201 });
  } catch (err) {
    console.error("[api/messages/inbound]", err);
    return NextResponse.json({ error: err instanceof Error ? err.message : "Unknown error" }, { status: 500 });
  }
}
