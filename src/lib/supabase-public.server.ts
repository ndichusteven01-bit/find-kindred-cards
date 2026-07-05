// Server-only Supabase client using the publishable (anon) key.
// Safe to use on any host (Lovable, Vercel, etc.) — RLS applies as `anon`.
import { createClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";

let _client: ReturnType<typeof createClient<Database>> | undefined;

export function getPublicSupabase() {
  if (_client) return _client;
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_PUBLISHABLE_KEY;
  if (!url || !key) {
    throw new Error(
      "Missing SUPABASE_URL or SUPABASE_PUBLISHABLE_KEY environment variable.",
    );
  }
  _client = createClient<Database>(url, key, {
    auth: { storage: undefined, persistSession: false, autoRefreshToken: false },
  });
  return _client;
}
