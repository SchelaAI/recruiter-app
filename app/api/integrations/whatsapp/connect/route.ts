import { NextRequest, NextResponse } from "next/server";
import { connectWhatsAppCredentials } from "@/lib/store";

export async function POST(req: NextRequest) {
  try {
    const { phoneNumberId, accessToken } = await req.json();
    if (!phoneNumberId || !accessToken) {
      return NextResponse.json({ error: "phoneNumberId and accessToken are required" }, { status: 400 });
    }
    const result = await connectWhatsAppCredentials(phoneNumberId, accessToken);
    if (!result.ok) return NextResponse.json({ error: result.error }, { status: 400 });
    return NextResponse.json({ account: result.account });
  } catch (err) {
    console.error("[api/integrations/whatsapp/connect]", err);
    return NextResponse.json({ error: err instanceof Error ? err.message : "Unknown error" }, { status: 500 });
  }
}
