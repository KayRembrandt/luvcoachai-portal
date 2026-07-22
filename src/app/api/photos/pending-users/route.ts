import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

function getBearerToken(req: Request) {
  const h = req.headers.get("authorization") || "";
  const m = h.match(/^Bearer\s+(.+)$/i);
  return m?.[1] ?? null;
}

function getAnonSupabase() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { auth: { persistSession: false } }
  );
}

function getServiceSupabase() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false } }
  );
}

function isAllowedStaffStatus(status: any) {
  const s = String(status ?? "active").toLowerCase();
  return s === "active" || s === "approved" || s === "";
}

export async function GET(req: Request) {
  try {
    const token = getBearerToken(req);
    if (!token) {
      return NextResponse.json({ error: "Unauthorized (missing bearer token)" }, { status: 401 });
    }

    const url = new URL(req.url);
    const status = (url.searchParams.get("status") ?? "pending") as
      | "pending"
      | "needs_attention"
      | "rejected"
      | "all";

    const anon = getAnonSupabase();
    const { data: userRes, error: userErr } = await anon.auth.getUser(token);

    if (userErr || !userRes?.user) {
      console.error("photos/pending-users auth.getUser(token) error:", userErr);
      return NextResponse.json({ error: "Unauthorized (invalid token)" }, { status: 401 });
    }

    const authUser = userRes.user;
    const svc = getServiceSupabase();

    const { data: staff, error: staffErr } = await svc
  .from("staff")
  .select("id, auth_user_id, role, is_active, status")
  .eq("auth_user_id", authUser.id)
  .maybeSingle();

    if (staffErr) {
      console.error("photos/pending-users staff lookup error:", staffErr);
      return NextResponse.json({ error: staffErr.message }, { status: 500 });
    }

    const role = String(staff?.role ?? "").toLowerCase();
    const active = staff?.is_active !== false;
    const okStatus = isAllowedStaffStatus(staff?.status);
    const canView = !!staff && active && okStatus && ["staff", "henry", "admin"].includes(role);
    const staffOk = !!staff && active && ["staff", "henry", "admin"].includes(role);
    if (!staffOk) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

    if (!canView) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    // Which statuses count as “awaiting” depends on the filter
    const statusList =
      status === "all"
        ? ["pending", "approved","needs_attention", "rejected"]
        : [status];

    // 1) Get photos in the selected queue (for grouping/counts)
    const { data: rows, error: rowsErr } = await svc
      .from("profile_photos")
      .select("user_id, review_status, created_at")
      .in("review_status", statusList)
      .limit(5000);

    if (rowsErr) {
      console.error("photos/pending-users query error:", rowsErr);
      return NextResponse.json({ error: rowsErr.message }, { status: 500 });
    }

    const agg = new Map<
      string,
      {
        pending_count: number;
        needs_attention_count: number;
        rejected_count: number;
        oldest_pending_at: string | null;
        newest_pending_at: string | null;
      }
    >();

    for (const r of rows ?? []) {
      const user_id = String((r as any).user_id ?? "");
      if (!user_id) continue;
      const s = String((r as any).review_status ?? "pending");
      const t = String((r as any).created_at ?? "");

      const cur =
        agg.get(user_id) ?? {
          pending_count: 0,
          needs_attention_count: 0,
          rejected_count: 0,
          oldest_pending_at: null,
          newest_pending_at: null,
        };

      if (s === "pending") cur.pending_count += 1;
      if (s === "needs_attention") cur.needs_attention_count += 1;
      if (s === "rejected") cur.rejected_count += 1;

      if (!cur.oldest_pending_at || t < cur.oldest_pending_at) cur.oldest_pending_at = t;
      if (!cur.newest_pending_at || t > cur.newest_pending_at) cur.newest_pending_at = t;

      agg.set(user_id, cur);
    }

    const userIds = Array.from(agg.keys());
    if (userIds.length === 0) return NextResponse.json({ users: [] });

    // 2) Approved counts for context
    const { data: approvedRows, error: apprErr } = await svc
      .from("profile_photos")
      .select("user_id")
      .eq("review_status", "approved")
      .in("user_id", userIds);

    if (apprErr) {
      console.error("photos/pending-users approved count error:", apprErr);
      // don’t fail the whole request
    }

    const approvedCount = new Map<string, number>();
    for (const a of approvedRows ?? []) {
      const uid = String((a as any).user_id ?? "");
      if (!uid) continue;
      approvedCount.set(uid, (approvedCount.get(uid) ?? 0) + 1);
    }

    // 3) Profile context
    const { data: profiles, error: profErr } = await svc
      .from("profiles")
      .select("id, screen_name, display_name, date_of_birth, gender_identity, subscription_level, subscription_status")
      .in("id", userIds);

    if (profErr) {
      console.error("photos/pending-users profiles error:", profErr);
      return NextResponse.json({ error: profErr.message }, { status: 500 });
    }

    const users = (profiles ?? [])
      .map((p: any) => {
        const a = agg.get(p.id)!;
        return {
          user_id: p.id,
          screen_name: p.screen_name ?? null,
          display_name: p.display_name ?? null,
          date_of_birth: p.date_of_birth ?? null,
          gender_identity: p.gender_identity ?? null,
          subscription_level: p.subscription_level ?? null,
          subscription_status: p.subscription_status ?? null,
          pending_count: a.pending_count,
          needs_attention_count: a.needs_attention_count,
          rejected_count: a.rejected_count,
          approved_count: approvedCount.get(p.id) ?? 0,
          oldest_pending_at: a.oldest_pending_at ?? new Date().toISOString(),
          newest_pending_at: a.newest_pending_at ?? new Date().toISOString(),
          
        };
      })
      .sort((x, y) => (x.oldest_pending_at < y.oldest_pending_at ? -1 : 1));

    return NextResponse.json({ users });
  } catch (e: any) {
    console.error("photos/pending-users fatal:", e);
    return NextResponse.json({ error: e?.message ?? "Server error" }, { status: 500 });
  }
}