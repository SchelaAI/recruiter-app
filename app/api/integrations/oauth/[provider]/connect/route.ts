import { NextRequest, NextResponse } from "next/server";
import { randomBytes } from "crypto";
import { getSiteUrl } from "@/lib/siteUrl";
import {
  isOAuthProviderConfigured,
  buildAuthUrl,
  providerRequiresPKCE,
  generateCodeVerifier,
  codeChallengeFromVerifier,
  type OAuthProviderId,
} from "@/lib/integrations/oauth";

const VALID_PROVIDERS: OAuthProviderId[] = ["outlook", "zoom", "calendly"];

export async function GET(_req: NextRequest, { params }: { params: Promise<{ provider: string }> }) {
  const { provider } = await params;
  const siteUrl = await getSiteUrl();

  if (!VALID_PROVIDERS.includes(provider as OAuthProviderId)) {
    return NextResponse.redirect(`${siteUrl}/integrations?error=unknown_provider`);
  }
  const id = provider as OAuthProviderId;

  if (!isOAuthProviderConfigured(id)) {
    return NextResponse.redirect(`${siteUrl}/integrations?error=not_configured&provider=${id}`);
  }

  const redirectUri = `${siteUrl}/api/integrations/oauth/${id}/callback`;
  const state = randomBytes(24).toString("hex");

  // PKCE (Calendly requires this on every OAuth app; Outlook/Zoom don't use
  // it and this stays a no-op for them).
  const requiresPKCE = providerRequiresPKCE(id);
  const codeVerifier = requiresPKCE ? generateCodeVerifier() : undefined;
  const codeChallenge = codeVerifier ? codeChallengeFromVerifier(codeVerifier) : undefined;

  const authUrl = buildAuthUrl(id, redirectUri, state, codeChallenge);
  if (!authUrl) {
    return NextResponse.redirect(`${siteUrl}/integrations?error=not_configured&provider=${id}`);
  }

  const res = NextResponse.redirect(authUrl);
  // Short-lived, httpOnly CSRF check — compared against the `state` the
  // provider echoes back to the callback, then discarded either way.
  res.cookies.set(`oauth_state_${id}`, state, {
    httpOnly: true,
    secure: true,
    sameSite: "lax",
    maxAge: 600,
    path: "/",
  });
  if (codeVerifier) {
    res.cookies.set(`oauth_pkce_${id}`, codeVerifier, {
      httpOnly: true,
      secure: true,
      sameSite: "lax",
      maxAge: 600,
      path: "/",
    });
  }
  return res;
}
