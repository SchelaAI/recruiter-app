import { headers } from "next/headers";

export async function getRequestOrigin() {
  const requestHeaders = await headers();
  const rawHost = requestHeaders.get("x-forwarded-host") ?? requestHeaders.get("host") ?? "localhost:3000";
  const host = rawHost.split(",")[0].trim();
  if (!/^[a-z0-9.-]+(?::\d{1,5})?$/i.test(host)) return "http://localhost:3000";

  const hostname = host.split(":")[0].toLowerCase();
  const isLocal = hostname === "localhost" || hostname === "127.0.0.1" || hostname === "::1";
  const forwardedProto = requestHeaders.get("x-forwarded-proto")?.split(",")[0]?.trim().toLowerCase();

  // Public OAuth/webhook URLs must be HTTPS. Local development remains HTTP unless
  // the local proxy explicitly reports HTTPS.
  const protocol = isLocal ? (forwardedProto === "https" ? "https" : "http") : "https";
  return `${protocol}://${host}`;
}
