import { type NextRequest } from "next/server";
import { updateSession } from "@/lib/supabase/middleware";

export async function middleware(request: NextRequest) {
  return await updateSession(request);
}

export const config = {
  // Webhook and cron routes are excluded here at the
  // matcher level, not just via the PUBLIC_PATHS check inside updateSession.
  // A webhook caller (Meta's servers, not a browser) has no Supabase session
  // cookie — if middleware runs on that path at all, an auth check redirects
  // it to /login, which breaks webhook verification and every real inbound
  // call. Excluding it here means middleware never executes on that path,
  // regardless of any future change to the PUBLIC_PATHS logic.
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|api/webhooks|api/cron|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
  ],
};
