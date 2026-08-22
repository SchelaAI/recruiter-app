import { NextResponse } from "next/server";
import { getAvailableSlots } from "@/lib/store";

export async function GET() {
  try {
    const slots = await getAvailableSlots();
    return NextResponse.json({ slots });
  } catch (err) {
    console.error("[api/scheduling/slots GET]", err);
    return NextResponse.json({ error: err instanceof Error ? err.message : "Unknown error" }, { status: 500 });
  }
}
