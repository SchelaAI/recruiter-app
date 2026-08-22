import { NextRequest, NextResponse } from "next/server";
import { getSiteUrl } from "@/lib/siteUrl";
import { getCurrentOrgId, storeOAuthConnection } from "@/lib/store";
import { exchangeCodeForTokens, fetchAccountLabel, type OAuthProviderId } from "@/lib/integrations/oauth";

const VALID_PROVIDERS: OAuthProviderId[] = ["outlook", "zoom", "calendly"];

export async function GET(req: NextRequest, { params }: { params: Promise<{ provider: string }> }) {
  const { provider } = await params;
  const siteUrl = await getSiteUrl();

  if (!VALID_PROVIDERS.includes(provider as OAuthProviderId)) {
    return NextResponse.redirect(`${siteUrl}/integrations?error=unknown_provider`);
  }
  const id = provider as OAuthProviderId;

  const { searchParams } = new URL(req.url);
  const code = searchParams.get("code");
  const state = searchParams.get("state");
  const providerError = searchParams.get("error");

  const res = (url: string) => {
    const r = NextResponse.redirect(url);
    r.cookies.delete(`oauth_state_${id}`);
    r.cookies.delete(`oauth_pkce_${id}`);
    return r;
  };

  if (providerError) {
    // The person clicked "Cancel" / "Deny" on the provider's own consent screen.
    return res(`${siteUrl}/integrations?error=denied&provider=${id}`);
  }

  const expectedState = req.cookies.get(`oauth_state_${id}`)?.value;
  if (!code || !state || !expectedState || state !== expectedState) {
    return res(`${siteUrl}/integrations?error=state_mismatch&provider=${id}`);
  }

  const codeVerifier = req.cookies.get(`oauth_pkce_${id}`)?.value;

  const redirectUri = `${siteUrl}/api/integrations/oauth/${id}/callback`;
  const exchange = await exchangeCodeForTokens(id, code, redirectUri, codeVerifier);
  if (!exchange.ok || !exchange.tokens) {
    console.error(`[oauth callback] ${id} token exchange failed:`, exchange.error);
    return res(`${siteUrl}/integrations?error=exchange_failed&provider=${id}`);
  }

  const account = await fetchAccountLabel(id, exchange.tokens.access_token);

  try {
    const orgId = await getCurrentOrgId();
    await storeOAuthConnection(id, orgId, exchange.tokens, account);

    // Calendly-specific: register a webhook subscription right after
    // connecting, so Schela is told the moment a candidate books through a
    // Calendly link, without the recruiter having to do anything extra.
    if (id === "calendly") {
      const { setUpCalendlyWebhook } = await import("@/lib/integrations/calendly");
      const webhookResult = await setUpCalendlyWebhook(orgId, exchange.tokens.access_token, `${siteUrl}/api/webhooks/calendly`);
      if (!webhookResult.ok) {
        console.error(`[oauth callback] calendly webhook setup failed:`, webhookResult.error);
        // Non-fatal — the connection itself succeeded; booking links still
        // work, Schela just won't hear about a completed booking until the
        // recruiter reconnects or the webhook is retried.
      }
    }
  } catch (err) {
    console.error(`[oauth callback] ${id} failed to store connection:`, err);
    return res(`${siteUrl}/integrations?error=store_failed&provider=${id}`);
  }

  return res(`${siteUrl}/integrations?connected=${id}`);
}
