import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { signProfilePhotoUrls } from "@/lib/photoUrlSigning";

function getBearerToken(req: Request) {
  const h = req.headers.get("authorization") || "";
  const m = h.match(/^Bearer\s+(.+)$/i);
  return m?.[1] ?? null;
}

function getAnonSupabase() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { auth: { persistSession: false } },
  );
}

function getServiceSupabase() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false } },
  );
}

function isAllowedStaffStatus(status: unknown) {
  const s = String(status ?? "active").toLowerCase();
  return s === "active" || s === "approved" || s === "";
}

export async function POST(req: Request) {
  try {
    const token = getBearerToken(req);
    if (!token) {
      return NextResponse.json(
        { error: "Unauthorized (missing bearer token)" },
        { status: 401 },
      );
    }

    const anon = getAnonSupabase();
    const { data: userRes, error: userErr } = await anon.auth.getUser(token);

    if (userErr || !userRes?.user) {
      console.error("photos/signed-url auth.getUser(token) error:", userErr);
      return NextResponse.json(
        { error: "Unauthorized (invalid token)" },
        { status: 401 },
      );
    }

    const svc = getServiceSupabase();
    const { data: staff, error: staffErr } = await svc
      .from("staff")
      .select("id, auth_user_id, role, is_active, status")
      .or(`id.eq.${userRes.user.id},auth_user_id.eq.${userRes.user.id}`)
      .maybeSingle();

    if (staffErr) {
      console.error("photos/signed-url staff lookup error:", staffErr);
      return NextResponse.json({ error: staffErr.message }, { status: 500 });
    }

    const role = String(staff?.role ?? "").toLowerCase();
    const active = staff?.is_active !== false;
    const okStatus = isAllowedStaffStatus(staff?.status);
    const canSign =
      !!staff && active && okStatus && ["staff", "henry", "admin"].includes(role);

    if (!canSign) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const body = await req.json().catch(() => ({}));
    const photoId = typeof body?.photoId === "string" ? body.photoId : null;

    if (!photoId) {
      return NextResponse.json(
        { error: "Missing required body field: photoId" },
        { status: 400 },
      );
    }

    const { data: photo, error: photoErr } = await svc
      .from("profile_photos")
      .select("id,user_id,storage_bucket,storage_path")
      .eq("id", photoId)
      .maybeSingle();

    if (photoErr) {
      console.error("photos/signed-url photo lookup error:", photoErr);
      return NextResponse.json({ error: photoErr.message }, { status: 500 });
    }

    if (!photo?.storage_path) {
      return NextResponse.json(
        { error: "Photo not found or missing storage_path" },
        { status: 404 },
      );
    }

    const signed = await signProfilePhotoUrls(svc, photo);

    console.log("photos/signed-url refreshed", {
      photoId: photo.id,
      userId: photo.user_id,
      storage_bucket: photo.storage_bucket ?? "profile-photos",
      storage_path: photo.storage_path,
      thumbPath: signed.thumbPath,
      thumbSignedUrlCreated: !!signed.thumbUrl,
      fullSignedUrlCreated: !!signed.imageUrl,
      photoUrlError: signed.photoUrlError,
    });

    return NextResponse.json({
      photoId: photo.id,
      userId: photo.user_id,
      storage_bucket: photo.storage_bucket ?? "profile-photos",
      storage_path: photo.storage_path,
      ...signed,
    });
  } catch (e: unknown) {
    console.error("photos/signed-url fatal:", e);
    const message = e instanceof Error ? e.message : "Server error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

