import { createServerClient } from "@supabase/ssr";
import { createClient as createSupabaseClient } from "@supabase/supabase-js";
import { cookies } from "next/headers";
import type { Database } from "@/lib/supabase/database.types";

/**
 * Server-side Supabase client — for Server Components, Server Actions, and
 * Route Handlers. Reads/writes the session via Next.js cookies(), which is
 * why this can only be called on the server.
 *
 * NOTE: Server Components can't set cookies, so the try/catch below is
 * expected there — the middleware (middleware.ts) is what actually keeps
 * the session refreshed on every request.
 */
export async function createClient() {
  const cookieStore = await cookies();

  return createServerClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll(cookiesToSet) {
          try {
            cookiesToSet.forEach(({ name, value, options }) =>
              cookieStore.set(name, value, options)
            );
          } catch {
            // Called from a Server Component — safe to ignore because
            // middleware.ts refreshes the session on every request.
          }
        },
      },
    }
  );
}

/**
 * Admin client using the service_role key — bypasses RLS entirely.
 * Server-only, never import this into anything that ships to the client.
 * Used for privileged operations like creating an organization on first
 * login, where the user doesn't have an org yet to be RLS-scoped to.
 *
 * Deliberately untyped (no <Database> generic) — this is a single
 * narrow-purpose utility, not general data access. Every other client in
 * this file is fully typed against the real schema.
 */
export function createAdminClient() {
  return createSupabaseClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  );
}
