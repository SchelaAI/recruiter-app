import { createBrowserClient } from "@supabase/ssr";
import type { Database } from "@/lib/supabase/database.types";

/**
 * Client-side Supabase client. Safe to use in "use client" components —
 * uses the public anon key, which is meant to be exposed to the browser.
 * Row-Level Security policies (see supabase/migrations) are what actually
 * keep data scoped per-organization, not this key.
 */
export function createClient() {
  return createBrowserClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  );
}
