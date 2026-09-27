import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { noStoreHeaders } from "@/lib/http/security";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Opaque, short-lived URL used by the approved interview_scheduled button. */
export async function GET(_request: NextRequest, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  if (!/^[A-Za-z0-9_-]{32,128}$/.test(token)) {
    return new NextResponse("Meeting link not found", { status: 404, headers: noStoreHeaders() });
  }
  const admin = createAdminClient();
  const { data: route, error } = await admin.from("calendly_booking_routes")
    .select("org_id,interview_id,created_at,used_at")
    .eq("route_token", token).maybeSingle();
  if (error || !route || !route.used_at) {
    return new NextResponse("Meeting link not found", { status: 404, headers: noStoreHeaders() });
  }
  const { data: interview } = await admin.from("interviews")
    .select("scheduled_at,duration_minutes,meeting_link,ai_state")
    .eq("org_id", route.org_id).eq("id", route.interview_id).maybeSingle();
  if (!interview?.scheduled_at || !interview.meeting_link || interview.ai_state === "completed") {
    return new NextResponse("Meeting link unavailable", { status: 410, headers: noStoreHeaders() });
  }
  const when = new Date(interview.scheduled_at).getTime();
  const endsAt = when + (interview.duration_minutes || 45) * 60_000;
  if (Date.now() < when - 24 * 3600_000 || Date.now() > endsAt + 6 * 3600_000) {
    return new NextResponse("Meeting link is outside its access window", { status: 410, headers: noStoreHeaders() });
  }
  let target: URL;
  try { target = new URL(interview.meeting_link); }
  catch { return new NextResponse("Invalid meeting link", { status: 503, headers: noStoreHeaders() }); }
  if (target.protocol !== "https:" || target.username || target.password || target.port) {
    return new NextResponse("Invalid meeting link", { status: 503, headers: noStoreHeaders() });
  }
  const response = NextResponse.redirect(target, 302);
  response.headers.set("Cache-Control", "no-store, max-age=0");
  response.headers.set("Referrer-Policy", "no-referrer");
  return response;
}
