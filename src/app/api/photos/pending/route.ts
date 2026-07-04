import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { signProfilePhotoRows } from "@/lib/photoUrlSigning";

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

function isAllowedStaffStatus(status: unknown) {
  const s = String(status ?? "active").toLowerCase();
  return s === "active" || s === "approved" || s === "";
}

export async function GET(req: Request) {
  try {
    // 1) Identify caller via bearer token (NO COOKIES)
    const token = getBearerToken(req);
    if (!token) {
      return NextResponse.json({ error: "Unauthorized (missing bearer token)" }, { status: 401 });
    }

    const anon = getAnonSupabase();
    const { data: userRes, error: userErr } = await anon.auth.getUser(token);

    if (userErr || !userRes?.user) {
      console.error("photos/pending auth.getUser(token) error:", userErr);
      return NextResponse.json({ error: "Unauthorized (invalid token)" }, { status: 401 });
    }

    const user = userRes.user;

    // 2) Gate access via staff table (service role read)
    const svc = getServiceSupabase();

   const { data: staff, error: staffErr } = await svc
  .from("staff")
  .select("id, auth_user_id, role, is_active, status")
  .or(`id.eq.${user.id},auth_user_id.eq.${user.id}`)
  .maybeSingle();

    if (staffErr) {
      console.error("photos/pending staff lookup error:", staffErr);
      return NextResponse.json({ error: staffErr.message }, { status: 500 });
    }

    const role = String(staff?.role ?? "").toLowerCase();
    const active = staff?.is_active !== false;
    const okStatus = isAllowedStaffStatus(staff?.status);
    const canView = !!staff && active && okStatus && ["staff", "henry", "admin"].includes(role);

    if (!canView) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }
console.log("photos/pending auth user:", {
  id: user.id,
  email: user.email,
});

console.log("photos/pending staff row:", staff);
    // 3) Load pending photos
    const { data: rows, error } = await svc
      .from("profile_photos")
      .select("id,user_id,storage_bucket,storage_path,review_status,staff_notes,admin_notes,created_at,photo_kind")
      .in("review_status", ["pending", "needs_attention"])
      .order("created_at", { ascending: true })
      .limit(100);

    if (error) {
      console.error("photos/pending query error:", error);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    const photos = await signProfilePhotoRows(svc, rows ?? []);
    const signedMap: Record<string, string> = {};

    for (const p of photos) {
      if (p.storage_bucket && p.storage_path && p.displayUrl) {
        signedMap[p.storage_path] = p.displayUrl;
        signedMap[`${p.storage_bucket}:${p.storage_path}`] = p.displayUrl;
      }
    }

    return NextResponse.json({ photos, signedMap });
  } catch (e: unknown) {
    console.error("photos/pending fatal:", e);
    const message = e instanceof Error ? e.message : "Server error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
