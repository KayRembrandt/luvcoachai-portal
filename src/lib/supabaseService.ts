// src/lib/supabaseService.ts
import { createClient } from "@supabase/supabase-js";

export function createSupabaseServiceClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY!; // MUST be set in .env.local

  if (!key) throw new Error("SUPABASE_SERVICE_ROLE_KEY is required");

  return createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}
