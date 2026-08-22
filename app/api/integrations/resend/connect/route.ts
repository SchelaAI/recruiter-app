import { NextRequest, NextResponse } from "next/server";
import { connectResendApiKey } from "@/lib/store";

export async function POST(req: NextRequest) {
  try {
    const { apiKey } = await req.json();
    if (!apiKey) return NextResponse.json({ error: "apiKey is required" }, { status: 400 });
    const result = await connectResendApiKey(apiKey);
    if (!result.ok) return NextResponse.json({ error: result.error }, { status: 400 });
    return NextResponse.json({ account: result.account });
  } catch (err) {
    console.error("[api/integrations/resend/connect]", err);
    return NextResponse.json({ error: err instanceof Error ? err.message : "Unknown error" }, { status: 500 });
  }
}
