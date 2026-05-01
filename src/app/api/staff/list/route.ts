import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

function svc() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY!;
  return createClient(url, key, { auth: { persistSession: false } });
}

function getBearerToken(req: Request) {
  const h = req.headers.get("authorization") || "";
  const m = h.match(/^Bearer\s+(.+)$/i);
  return m?.[1] ?? null;
}

async function getUserFromBearer(req: Request) {
  const token = getBearerToken(req);
  if (!token) return { user: null, error: "Missing bearer token" };

  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  );

  const { data, error } = await supabase.auth.getUser(token);
  if (error || !data?.user) {
    return { user: null, error: error?.message ?? "Invalid token" };
  }

  return { user: data.user, error: null };
}

export async function GET(req: Request) {
  try {
    const { user, error: authErr } = await getUserFromBearer(req);

    if (authErr || !user) {
      return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
    }

    const db = svc();

    const { data: me, error: meErr } = await db
      .from("staff")
      .select("role, is_active, status")
      .eq("auth_user_id", user.id)
      .maybeSingle();

    if (meErr) {
      return NextResponse.json({ error: meErr.message }, { status: 400 });
    }

    if (
      !me ||
      me.is_active === false ||
      (me.status ?? "active") !== "active" ||
      String(me.role).toLowerCase() !== "admin"
    ) {
      return NextResponse.json({ error: "Admin access required" }, { status: 403 });
    }

    const { data: rows, error: listErr } = await db
      .from("staff")
      .select("id, first_name, last_name, display_name, role, is_active, created_at")
      .order("created_at", { ascending: false });

    if (listErr) {
      return NextResponse.json({ error: listErr.message }, { status: 400 });
    }

    return NextResponse.json({
      rows: rows ?? [],
      meRole: me.role ?? null,
    });
  } catch (err: any) {
    return NextResponse.json(
      { error: err?.message ?? "Server error" },
      { status: 500 }
    );
  }
}