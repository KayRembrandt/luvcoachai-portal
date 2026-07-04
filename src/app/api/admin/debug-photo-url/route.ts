import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { makeThumbPath, signProfilePhotoUrls } from "@/lib/photoUrlSigning";

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

async function storageObjectExists(
  supabase: ReturnType<typeof getServiceSupabase>,
  bucket: string,
  path: string,
) {
  const lastSlash = path.lastIndexOf("/");
  const folder = lastSlash === -1 ? "" : path.slice(0, lastSlash);
  const fileName = lastSlash === -1 ? path : path.slice(lastSlash + 1);

  const { data, error } = await supabase.storage
    .from(bucket)
    .list(folder, { limit: 100, search: fileName });

  if (error) return { exists: false, error: error.message };

  return {
    exists: (data ?? []).some((item) => item.name === fileName),
    error: null,
  };
}

export async function GET(req: Request) {
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
      console.error("debug-photo-url auth.getUser(token) error:", userErr);
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
      console.error("debug-photo-url staff lookup error:", staffErr);
      return NextResponse.json({ error: staffErr.message }, { status: 500 });
    }

    const role = String(staff?.role ?? "").toLowerCase();
    const active = staff?.is_active !== false;
    const okStatus = isAllowedStaffStatus(staff?.status);
    const canDebug =
      !!staff && active && okStatus && ["staff", "henry", "admin"].includes(role);

    if (!canDebug) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const url = new URL(req.url);
    const photoId = url.searchParams.get("photoId");

    if (!photoId) {
      return NextResponse.json(
        { error: "Missing required query param: photoId" },
        { status: 400 },
      );
    }

    const { data: photo, error: photoErr } = await svc
      .from("profile_photos")
      .select("id,user_id,storage_bucket,storage_path")
      .eq("id", photoId)
      .maybeSingle();

    if (photoErr) {
      console.error("debug-photo-url photo lookup error:", photoErr);
      return NextResponse.json({ error: photoErr.message }, { status: 500 });
    }

    if (!photo?.storage_path) {
      return NextResponse.json(
        { error: "Photo not found or missing storage_path" },
        { status: 404 },
      );
    }

    const bucket = photo.storage_bucket ?? "profile-photos";
    const fullPath = photo.storage_path;
    const thumbPath = makeThumbPath(fullPath);
    const [fullExists, thumbExists, signed] = await Promise.all([
      storageObjectExists(svc, bucket, fullPath),
      storageObjectExists(svc, bucket, thumbPath),
      signProfilePhotoUrls(svc, photo),
    ]);

    return NextResponse.json({
      photoId: photo.id,
      userId: photo.user_id,
      storage_bucket: bucket,
      storage_path: fullPath,
      thumbPath,
      fullExists: fullExists.exists,
      thumbExists: thumbExists.exists,
      fullSignedUrlExists: !!signed.imageUrl,
      thumbSignedUrlExists: !!signed.thumbUrl,
      displayUrlExists: !!signed.displayUrl,
      fullExistsError: fullExists.error,
      thumbExistsError: thumbExists.error,
      photoUrlError: signed.photoUrlError,
    });
  } catch (e: unknown) {
    console.error("debug-photo-url fatal:", e);
    const message = e instanceof Error ? e.message : "Server error";
    return NextResponse.json(
      { error: message },
      { status: 500 },
    );
  }
}
