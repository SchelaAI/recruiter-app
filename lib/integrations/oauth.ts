import "server-only";
import { randomBytes, createHash } from "crypto";

export type OAuthProviderId = "outlook" | "zoom" | "calendly";

interface OAuthProviderDef {
  authUrl: string;
  tokenUrl: string;
  userInfoUrl: string;
  scope: string;
  clientIdEnv: string;
  clientSecretEnv: string;
  extraAuthParams?: Record<string, string>;
  /** Calendly requires PKCE on every OAuth app; Outlook/Zoom don't need it and are unaffected. */
  requiresPKCE?: boolean;
  /** Pulls a display email/account string out of that provider's userinfo response shape. */
  extractAccount: (json: Record<string, unknown>) => string | undefined;
}

const PROVIDERS: Record<OAuthProviderId, OAuthProviderDef> = {
  outlook: {
    authUrl: "https://login.microsoftonline.com/common/oauth2/v2.0/authorize",
    tokenUrl: "https://login.microsoftonline.com/common/oauth2/v2.0/token",
    userInfoUrl: "https://graph.microsoft.com/v1.0/me",
    scope: "offline_access Calendars.ReadWrite User.Read",
    clientIdEnv: "MS_CLIENT_ID",
    clientSecretEnv: "MS_CLIENT_SECRET",
    extractAccount: (j) => (j.mail as string | undefined) ?? (j.userPrincipalName as string | undefined),
  },
  zoom: {
    authUrl: "https://zoom.us/oauth/authorize",
    tokenUrl: "https://zoom.us/oauth/token",
    userInfoUrl: "https://api.zoom.us/v2/users/me",
    scope: "meeting:write user:read",
    clientIdEnv: "ZOOM_CLIENT_ID",
    clientSecretEnv: "ZOOM_CLIENT_SECRET",
    extractAccount: (j) => (j.email as string | undefined),
  },
  calendly: {
    authUrl: "https://auth.calendly.com/oauth/authorize",
    tokenUrl: "https://auth.calendly.com/oauth/token",
    userInfoUrl: "https://api.calendly.com/users/me",
    // Calendly's OAuth apps declare scopes at app-creation time in their
    // dashboard, not per-authorize-request — an empty scope param is correct
    // here, unlike the other two providers.
    scope: "",
    clientIdEnv: "CALENDLY_CLIENT_ID",
    clientSecretEnv: "CALENDLY_CLIENT_SECRET",
    requiresPKCE: true,
    // Response is nested under "resource", not flat like the other providers.
    extractAccount: (j) => {
      const resource = j.resource as Record<string, unknown> | undefined;
      return resource?.email as string | undefined;
    },
  },
};

export function isOAuthProviderConfigured(id: OAuthProviderId): boolean {
  const def = PROVIDERS[id];
  return Boolean(process.env[def.clientIdEnv] && process.env[def.clientSecretEnv]);
}

export function providerRequiresPKCE(id: OAuthProviderId): boolean {
  return Boolean(PROVIDERS[id].requiresPKCE);
}

/** Random 43-128 char unreserved string per RFC 7636. 64 bytes base64url-encoded lands comfortably in range. */
export function generateCodeVerifier(): string {
  return randomBytes(64).toString("base64url");
}

export function codeChallengeFromVerifier(verifier: string): string {
  return createHash("sha256").update(verifier).digest("base64url");
}

export function buildAuthUrl(id: OAuthProviderId, redirectUri: string, state: string, codeChallenge?: string): string | null {
  const def = PROVIDERS[id];
  const clientId = process.env[def.clientIdEnv];
  if (!clientId) return null;

  const params = new URLSearchParams({
    client_id: clientId,
    redirect_uri: redirectUri,
    response_type: "code",
    state,
    ...(def.scope ? { scope: def.scope } : {}),
    ...(def.extraAuthParams ?? {}),
  });
  if (def.requiresPKCE && codeChallenge) {
    params.set("code_challenge", codeChallenge);
    params.set("code_challenge_method", "S256");
  }
  return `${def.authUrl}?${params.toString()}`;
}

export interface OAuthTokens {
  access_token: string;
  refresh_token?: string;
  expires_in?: number;
}

export async function exchangeCodeForTokens(
  id: OAuthProviderId,
  code: string,
  redirectUri: string,
  codeVerifier?: string
): Promise<{ ok: boolean; tokens?: OAuthTokens; error?: string }> {
  const def = PROVIDERS[id];
  const clientId = process.env[def.clientIdEnv];
  const clientSecret = process.env[def.clientSecretEnv];
  if (!clientId || !clientSecret) {
    return { ok: false, error: `${id} isn't configured — missing ${def.clientIdEnv}/${def.clientSecretEnv}` };
  }

  try {
    const body = new URLSearchParams({
      grant_type: "authorization_code",
      code,
      redirect_uri: redirectUri,
    });
    if (def.requiresPKCE && codeVerifier) body.set("code_verifier", codeVerifier);

    const res = await fetch(def.tokenUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
        // Basic auth for the client credentials works across all providers
        // here (standard OAuth2, and Zoom/Calendly specifically require it).
        Authorization: `Basic ${Buffer.from(`${clientId}:${clientSecret}`).toString("base64")}`,
      },
      body,
    });
    const json = await res.json();
    if (!res.ok || !json.access_token) {
      return { ok: false, error: json?.error_description ?? json?.error ?? `Token exchange failed (HTTP ${res.status})` };
    }
    return {
      ok: true,
      tokens: { access_token: json.access_token, refresh_token: json.refresh_token, expires_in: json.expires_in },
    };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : "Unknown error" };
  }
}

export async function fetchAccountLabel(id: OAuthProviderId, accessToken: string): Promise<string | undefined> {
  const def = PROVIDERS[id];
  try {
    const res = await fetch(def.userInfoUrl, { headers: { Authorization: `Bearer ${accessToken}` } });
    if (!res.ok) return undefined;
    const json = await res.json();
    return def.extractAccount(json);
  } catch {
    return undefined;
  }
}

/** Refreshes an expired access token using the stored refresh_token. All three providers support this grant. */
export async function refreshAccessToken(
  id: OAuthProviderId,
  refreshToken: string
): Promise<{ ok: boolean; tokens?: OAuthTokens; error?: string }> {
  const def = PROVIDERS[id];
  const clientId = process.env[def.clientIdEnv];
  const clientSecret = process.env[def.clientSecretEnv];
  if (!clientId || !clientSecret) return { ok: false, error: "Provider not configured" };

  try {
    const res = await fetch(def.tokenUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
        Authorization: `Basic ${Buffer.from(`${clientId}:${clientSecret}`).toString("base64")}`,
      },
      body: new URLSearchParams({ grant_type: "refresh_token", refresh_token: refreshToken }),
    });
    const json = await res.json();
    if (!res.ok || !json.access_token) {
      return { ok: false, error: json?.error_description ?? json?.error ?? `Refresh failed (HTTP ${res.status})` };
    }
    return {
      ok: true,
      tokens: { access_token: json.access_token, refresh_token: json.refresh_token ?? refreshToken, expires_in: json.expires_in },
    };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : "Unknown error" };
  }
}
