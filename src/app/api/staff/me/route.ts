import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { createSupabaseRouteClient } from "@/lib/supabaseRoute";

// service role for staff table read
function svc() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY!;
  return createClient(url, key, { auth: { persistSession: false } });
}

export async function GET() {
  const { supabase, withCookies } = await createSupabaseRouteClient();

  const {
    data: { user },
    error: userErr,
  } = await supabase.auth.getUser();

  if (userErr || !user) {
    return withCookies(
      NextResponse.json({ user: null, is_staff: false, staff: null }, { status: 200 })
    );
  }

  const db = svc();
  const { data, error } = await db
    .from("staff")
    .select("id, role, is_active, status, first_name")
    .eq("auth_user_id", user.id)
    .eq("is_active", true)
    .maybeSingle();

  if (error) {
    return withCookies(NextResponse.json({ error: error.message }, { status: 400 }));
  }

  const isStaff =
    !!data && data.is_active !== false && (data.status ?? "active") !== "disabled";

return withCookies(
  NextResponse.json(
    {
      user: { id: user.id },
      is_staff: isStaff,
      staff: data ?? null,
      name: data?.first_name ?? null
    },
    { status: 200 }
  )
);
}