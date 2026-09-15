import { NextRequest, NextResponse } from "next/server";
import { getCurrentOrgId, listCalendlyEventTypesForOrg, setCalendlyEventType } from "@/lib/store";

export async function GET() {
  try {
    const orgId = await getCurrentOrgId();
    const result = await listCalendlyEventTypesForOrg(orgId);
    if (!result.ok) return NextResponse.json({ error: result.error }, { status: 400 });
    return NextResponse.json({ eventTypes: result.eventTypes, selectedUri: result.selectedUri });
  } catch (err) {
    console.error("[api/integrations/calendly/event-types GET]", err);
    return NextResponse.json({ error: err instanceof Error ? err.message : "Unknown error" }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const { eventTypeUri } = await req.json();
    if (!eventTypeUri) return NextResponse.json({ error: "eventTypeUri is required" }, { status: 400 });
    const result = await setCalendlyEventType(eventTypeUri);
    if (!result.ok) return NextResponse.json({ error: result.error }, { status: 400 });
    return NextResponse.json({ success: true });
  } catch (err) {
    console.error("[api/integrations/calendly/event-types POST]", err);
    return NextResponse.json({ error: err instanceof Error ? err.message : "Unknown error" }, { status: 500 });
  }
}
