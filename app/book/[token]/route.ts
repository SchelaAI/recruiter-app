import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { noStoreHeaders } from "@/lib/http/security";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Anonymous, unguessable booking-link redirect. No candidate data is exposed. */
export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ token: string }> },
) {
  const { token } = await params;
  if (!/^[A-Za-z0-9_-]{32,128}$/.test(token)) {
    return new NextResponse("Booking link not found", { status: 404, headers: noStoreHeaders() });
  }

  const admin = createAdminClient();
  const { data, error } = await admin
    .from("calendly_booking_routes")
    .select("booking_url,used_at,created_at")
    .eq("route_token", token)
    .maybeSingle();
  if (error || !data) {
    return new NextResponse("Booking link not found", { status: 404, headers: noStoreHeaders() });
  }
  if (data.used_at || Date.now() - new Date(data.created_at).getTime() > 30 * 86400_000) {
    return new NextResponse("Booking link expired or already used", { status: 410, headers: noStoreHeaders() });
  }

  let url: URL;
  try {
    url = new URL(data.booking_url);
  } catch {
    return new NextResponse("Booking link is unavailable", { status: 503, headers: noStoreHeaders() });
  }
  // Never allow this public redirect to forward to an arbitrary third-party host.
  if (url.protocol !== "https:" || !/(^|\.)calendly\.com$/i.test(url.hostname)) {
    return new NextResponse("Booking link is unavailable", { status: 503, headers: noStoreHeaders() });
  }
  const response = NextResponse.redirect(url, 302);
  response.headers.set("Cache-Control", "no-store, max-age=0");
  response.headers.set("Referrer-Policy", "no-referrer");
  return response;
}
