import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { createSupabaseRouteClient } from "@/lib/supabaseRoute";

export const dynamic = "force-dynamic";

// service role for staff table read/write
function svc() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY!;

  return createClient(url, key, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
    },
  });
}

const STAFF_SELECT =
  "id, email, first_name, last_name, role, is_active, status, permissions, auth_user_id";

function staffIsActive(staff: any) {
  if (!staff) return false;

  const status = String(staff.status || "active").toLowerCase();

  return (
    staff.is_active !== false &&
    !["inactive", "disabled", "rejected"].includes(status)
  );
}

function staffIsAdmin(staff: any) {
  if (!staffIsActive(staff)) return false;

  const role = String(staff.role || "").toLowerCase();

  return ["admin", "super_admin"].includes(role);
}

export async function GET() {
  const { supabase, withCookies } = await createSupabaseRouteClient();

  const {
    data: { user },
    error: userErr,
  } = await supabase.auth.getUser();

  if (userErr || !user) {
    return withCookies(
      NextResponse.json(
        {
          user: null,
          is_staff: false,
          is_admin: false,
          role: null,
          permissions: {},
          staff: null,
          name: null,
        },
        { status: 200 }
      )
    );
  }

  const db = svc();

  let staff: any = null;

  // 1. First try the strongest match: auth_user_id
  const byAuth = await db
    .from("staff")
    .select(STAFF_SELECT)
    .eq("auth_user_id", user.id)
    .limit(1)
    .maybeSingle();

  if (byAuth.error) {
    return withCookies(
      NextResponse.json({ error: byAuth.error.message }, { status: 400 })
    );
  }

  staff = byAuth.data;

  // 2. Fallback: match pre-approved/manual staff by email
  if (!staff && user.email) {
    const email = user.email.trim().toLowerCase();

    const byEmail = await db
      .from("staff")
      .select(STAFF_SELECT)
      .eq("email", email)
      .limit(1)
      .maybeSingle();

    if (byEmail.error) {
      return withCookies(
        NextResponse.json({ error: byEmail.error.message }, { status: 400 })
      );
    }

    staff = byEmail.data;
  }

  // 3. Optional fallback for older rows where staff.id was the auth user id
  if (!staff) {
    const byId = await db
      .from("staff")
      .select(STAFF_SELECT)
      .eq("id", user.id)
      .limit(1)
      .maybeSingle();

    if (byId.error) {
      return withCookies(
        NextResponse.json({ error: byId.error.message }, { status: 400 })
      );
    }

    staff = byId.data;
  }

  // 4. If we found the staff row by email, link it to the auth user id.
  // This is what makes future lookups reliable.
  if (staff?.id && !staff.auth_user_id) {
    const linked = await db
      .from("staff")
      .update({ auth_user_id: user.id })
      .eq("id", staff.id)
      .is("auth_user_id", null)
      .select(STAFF_SELECT)
      .maybeSingle();

    // Do not block login if the link update fails.
    // The staff row was already found by email.
    if (!linked.error && linked.data) {
      staff = linked.data;
    }
  }

  const isStaff = staffIsActive(staff);
  const isAdmin = staffIsAdmin(staff);

  return withCookies(
    NextResponse.json(
      {
        user: {
          id: user.id,
          email: user.email,
        },
        is_staff: isStaff,
        is_admin: isAdmin,
        role: isStaff ? staff?.role ?? null : null,
        permissions: isStaff ? staff?.permissions ?? {} : {},
        staff: isStaff ? staff : null,
        name: isStaff ? staff?.first_name ?? null : null,
      },
      { status: 200 }
    )
  );
}