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
      .select("id,user_id,storage_bucket,storage_path,review_status,staff_notes,admin_notes,created_at")
      .in("review_status", ["pending", "needs_attention"])
      .order("created_at", { ascending: true })
      .limit(100);

    if (error) {
      console.error("photos/pending query error:", error);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    const photos = rows ?? [];

    // 4) Signed URLs for private bucket (use row.storage_bucket)
    const expiresIn = 60 * 10;
    const signedMap: Record<string, string> = {};

    // group paths by bucket
    const byBucket = new Map<string, string[]>();
    for (const p of photos) {
      if (!p.storage_bucket || !p.storage_path) continue;
      const arr = byBucket.get(p.storage_bucket) ?? [];
      arr.push(p.storage_path);
      byBucket.set(p.storage_bucket, arr);
    }
console.log("SERVICE KEY LENGTH", process.env.SUPABASE_SERVICE_ROLE_KEY?.length);
    for (const [bucket, paths] of byBucket.entries()) {
      const { data: signed, error: signErr } = await svc.storage
        .from(bucket)
        .createSignedUrls(paths, expiresIn);

      if (signErr) {
        console.error("photos/pending createSignedUrls error:", signErr);
        continue;
      }

      for (const item of signed ?? []) {
        if (item?.path && item?.signedUrl) {
          signedMap[item.path] = item.signedUrl;
        }
      }
    }

    return NextResponse.json({ photos, signedMap });
  } catch (e: any) {
    console.error("photos/pending fatal:", e);
    return NextResponse.json({ error: e?.message ?? "Server error" }, { status: 500 });
  }
}
