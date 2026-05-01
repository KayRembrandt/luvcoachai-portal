import { createClient, type SupabaseClient } from "@supabase/supabase-js";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;

const globalForSupabase = globalThis as unknown as {
  __supabasePortal?: SupabaseClient;
};

export const supabaseBrowser: SupabaseClient =
  globalForSupabase.__supabasePortal ??
  createClient(supabaseUrl, supabaseAnonKey, {
    auth: {
      storageKey: "luvcoachai-portal-auth",
      persistSession: true,
      autoRefreshToken: true,
      detectSessionInUrl: true,
    },
  });

if (!globalForSupabase.__supabasePortal) {
  globalForSupabase.__supabasePortal = supabaseBrowser;
}
