import Constants from "expo-constants";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";

let _client: SupabaseClient | null = null;

// Anon-read-only client. RLS on the self-hosted DB enforces public-read scope.
// If user auth is ever added, this client needs persistSession reverted and
// AsyncStorage wired in — do NOT call .auth.signIn() against it.
export function supabase(): SupabaseClient {
  if (_client) return _client;
  const extra = (Constants.expoConfig?.extra ?? {}) as {
    supabaseUrl?: string;
    supabaseAnonKey?: string;
  };
  const url = extra.supabaseUrl ?? process.env.EXPO_PUBLIC_SUPABASE_URL;
  const key = extra.supabaseAnonKey ?? process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !key) {
    throw new Error(
      "EXPO_PUBLIC_SUPABASE_URL and EXPO_PUBLIC_SUPABASE_ANON_KEY must be set in mobile/.env",
    );
  }
  _client = createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  return _client;
}
