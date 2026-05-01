import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";


function svc() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY!;
  return createClient(url, key, { auth: { persistSession: false } });
}

async function requireAdmin(userId: string) {
  const db = svc();
  const { data, error } = await db
    .from("staff")
    .select("id, first_name, last_name, display_name, role, is_active, created_at")
    .eq("auth_user_id", userId)
    .maybeSingle();

  if (error) throw new Error(error.message);
  if (!data) return false;
  if (data.is_active === false) return false;
  return String(data.role).toLowerCase() === "admin";
}

export async function GET() {
  try {
    // ✅ Dev portal authorization (no cookies)
    const forcedRole = (process.env.PORTAL_FORCE_ROLE || "").toLowerCase();
    if (forcedRole !== "admin") {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // ✅ Use service role client to read applications
    const db = svc();
    const { data, error } = await db
      .from("staff_applications")
      .select(
        "id,first_name,last_name,email,phone,request_role,why_joining,experience,values_alignment,status,created_at"
      )
      .order("created_at", { ascending: false });

    if (error) return NextResponse.json({ error: error.message }, { status: 400 });

    return NextResponse.json({ applications: data || [] });
  } catch (e: any) {
    return NextResponse.json(
      { error: e?.message || "Unexpected error" },
      { status: 500 }
    );
  }
}

