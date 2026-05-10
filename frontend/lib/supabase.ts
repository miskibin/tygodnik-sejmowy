import "server-only";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";

let _client: SupabaseClient | null = null;

export function supabase(): SupabaseClient {
  if (_client) return _client;
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_ANON_KEY || process.env.SUPABASE_KEY;
  if (!url || !key) {
    throw new Error(
      "SUPABASE_URL and SUPABASE_ANON_KEY (or SUPABASE_KEY) must be set in frontend/.env.local"
    );
  }
  _client = createClient(url, key, { auth: { persistSession: false } });
  return _client;
}
