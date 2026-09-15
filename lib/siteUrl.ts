import "server-only";
import { headers } from "next/headers";

/** Works both locally and once deployed to Vercel without hardcoding a domain. */
export async function getSiteUrl(): Promise<string> {
  const h = await headers();
  const host = h.get("host");
  const protocol = host?.startsWith("localhost") ? "http" : "https";
  return process.env.NEXT_PUBLIC_SITE_URL ?? `${protocol}://${host}`;
}
