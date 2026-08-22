import { NextResponse } from "next/server";
import { listIntegrations } from "@/lib/store";

export async function GET() {
  try {
    const integrations = await listIntegrations();
    return NextResponse.json({ integrations });
  } catch (err) {
    console.error("[api/integrations GET]", err);
    return NextResponse.json({ error: err instanceof Error ? err.message : "Unknown error" }, { status: 500 });
  }
}
