import { NextRequest, NextResponse } from "next/server";
import { getSettings, updateSettings } from "@/lib/store";

export async function GET() {
  try {
    const settings = await getSettings();
    return NextResponse.json({ settings });
  } catch (err) {
    console.error("[api/settings GET]", err);
    return NextResponse.json({ error: err instanceof Error ? err.message : "Unknown error" }, { status: 500 });
  }
}

export async function PATCH(req: NextRequest) {
  try {
    const patch = await req.json();
    const settings = await updateSettings(patch);
    return NextResponse.json({ settings });
  } catch (err) {
    console.error("[api/settings PATCH]", err);
    return NextResponse.json({ error: err instanceof Error ? err.message : "Unknown error" }, { status: 500 });
  }
}
