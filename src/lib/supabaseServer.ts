import "server-only";

import { cookies } from "next/headers";
import { createServerClient } from "@supabase/ssr";

function isReadOnlyCookieError(error: unknown): boolean {
  return (
    error instanceof Error &&
    error.message.includes(
      "Cookies can only be modified in a Server Action or Route Handler",
    )
  );
}

export async function createSupabaseServerClient() {
  const cookieStore = await cookies();
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!url || !anonKey) {
    throw new Error(
      "Missing NEXT_PUBLIC_SUPABASE_URL or NEXT_PUBLIC_SUPABASE_ANON_KEY.",
    );
  }

  return createServerClient(url, anonKey, {
    cookies: {
      getAll() {
        return cookieStore.getAll();
      },

      setAll(cookiesToSet) {
        try {
          for (const { name, value, options } of cookiesToSet) {
            cookieStore.set(name, value, options);
          }
        } catch (error: unknown) {
          if (!isReadOnlyCookieError(error)) {
            throw error;
          }

          // Page rendering can read cookies, but cannot send cookie changes.
          // Do not let that specific restriction crash the rendering request.
          // An SSR auth flow must persist refresh/cleanup cookies in a Proxy
          // or Route Handler. This helper does not create that flow or make
          // a missing/invalid session valid. Callers still verify staff access.
        }
      },
    },
  });
}
