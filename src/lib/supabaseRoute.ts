// src/lib/supabaseRoute.ts
import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { createServerClient } from "@supabase/ssr";

type CookieToSet = {
  name: string;
  value: string;
  options?: Record<string, any>;
};

export async function createSupabaseRouteClient() {
  const cookieStore = await cookies();
  const pending: CookieToSet[] = [];

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          const all = cookieStore.getAll?.() ?? [];
          return all.map((c: any) => ({ name: c.name, value: c.value }));
        },
        setAll(cookiesToSet) {
          for (const c of cookiesToSet as CookieToSet[]) pending.push(c);
        },
      },
    }
  );

  function withCookies<T>(res: NextResponse<T>) {
    for (const c of pending) {
      res.cookies.set(c.name, c.value, c.options);
    }
    return res;
  }

  return { supabase, withCookies };
}