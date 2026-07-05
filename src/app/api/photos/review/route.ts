import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { createServerClient } from "@supabase/ssr";
import { createClient } from "@supabase/supabase-js";
import sharp from "sharp";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 0;
export const maxDuration = 60;

const PROFILE_PHOTOS_BUCKET =
  process.env.PROFILE_PHOTOS_BUCKET ||
  process.env.NEXT_PUBLIC_PROFILE_PHOTOS_BUCKET ||
  "profile_photos";

const MAX_INPUT_PIXELS = 64_000_000;
const WEBP_QUALITY = 88;

type ReviewStatus = "approved" | "needs_attention" | "rejected";
type Actor = "staff" | "admin";

type CookieToSet = {
  name: string;
  value: string;
  options?: Record<string, any>;
};

function getServiceSupabase() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    {
      auth: { persistSession: false },
    },
  );
}

function isAllowedStaffStatus(status: unknown) {
  const s = String(status ?? "").toLowerCase();
  return s === "active" || s === "approved";
}

function uniqueStrings(values: Array<string | null | undefined>) {
  return Array.from(
    new Set(
      values
        .map((value) => String(value ?? "").trim())
        .filter(Boolean),
    ),
  );
}

function isWebpPath(path: string) {
  return path.toLowerCase().endsWith(".webp");
}

function webpPathFor(originalPath: string, photoId: string) {
  const slashIndex = originalPath.lastIndexOf("/");
  const folder = slashIndex >= 0 ? originalPath.slice(0, slashIndex + 1) : "";
  const fileName = slashIndex >= 0 ? originalPath.slice(slashIndex + 1) : originalPath;
  const baseName = fileName.includes(".")
    ? fileName.replace(/\.[^./]+$/, "")
    : fileName || photoId;

  return `${folder}${baseName}.webp`;
}

async function downloadPhotoFromAvailableBucket(
  svc: ReturnType<typeof getServiceSupabase>,
  input: {
    preferredBucket: string | null | undefined;
    storagePath: string;
  },
) {
  const bucketCandidates = uniqueStrings([
    input.preferredBucket,
    PROFILE_PHOTOS_BUCKET,
    "profile_photos",
    "profile-photos",
  ]);

  let lastError: string | null = null;

  for (const bucket of bucketCandidates) {
    const downloaded = await svc.storage.from(bucket).download(input.storagePath);

    if (!downloaded.error && downloaded.data) {
      return {
        bucket,
        file: downloaded.data,
      };
    }

    lastError = downloaded.error?.message ?? "No file returned.";
  }

  throw new Error(
    `Could not download the original photo from storage. Last error: ${lastError ?? "Unknown storage error."}`,
  );
}

async function ensureApprovedWebpDisplayCopy(
  svc: ReturnType<typeof getServiceSupabase>,
  photo: {
    id: string;
    storage_bucket: string | null;
    storage_path: string | null;
  },
) {
  const originalPath = String(photo.storage_path ?? "").trim();

  if (!originalPath) {
    throw new Error("This photo is missing its storage path.");
  }

  if (isWebpPath(originalPath)) {
    return {
      converted: false,
      bucket: photo.storage_bucket || PROFILE_PHOTOS_BUCKET,
      originalPath,
      approvedPath: originalPath,
      originalBytes: null as number | null,
      webpBytes: null as number | null,
      width: null as number | null,
      height: null as number | null,
    };
  }

  const downloaded = await downloadPhotoFromAvailableBucket(svc, {
    preferredBucket: photo.storage_bucket,
    storagePath: originalPath,
  });

  const inputBuffer = Buffer.from(await downloaded.file.arrayBuffer());

  if (inputBuffer.byteLength <= 0) {
    throw new Error("The original photo file is empty.");
  }

  const metadata = await sharp(inputBuffer, { limitInputPixels: MAX_INPUT_PIXELS })
    .rotate()
    .metadata();
  const width = metadata.width ?? null;
  const height = metadata.height ?? null;

  if (!width || !height) {
    throw new Error("The original photo dimensions could not be read.");
  }

  const webpBuffer = await sharp(inputBuffer, { limitInputPixels: MAX_INPUT_PIXELS })
    .rotate()
    .webp({ quality: WEBP_QUALITY, effort: 4 })
    .toBuffer();

  const approvedPath = webpPathFor(originalPath, photo.id);
  const uploaded = await svc.storage.from(downloaded.bucket).upload(approvedPath, webpBuffer, {
    cacheControl: "3600",
    contentType: "image/webp",
    upsert: true,
  });

  if (uploaded.error) {
    throw new Error(`Could not save the converted WebP photo: ${uploaded.error.message}`);
  }

  return {
    converted: true,
    bucket: downloaded.bucket,
    originalPath,
    approvedPath,
    originalBytes: inputBuffer.byteLength,
    webpBytes: webpBuffer.byteLength,
    width,
    height,
  };
}


async function tryResolvePhotoReviewNotification(
  svc: ReturnType<typeof getServiceSupabase>,
  input: {
    photoId: string;
    staffId: string;
    reviewStatus: ReviewStatus;
    resolvedAt: string;
  },
) {
  const { error } = await svc
    .from("photo_review_notifications")
    .update({
      status: "resolved",
      resolved_at: input.resolvedAt,
      resolved_by: input.staffId,
      metadata: {
        resolved_review_status: input.reviewStatus,
        resolved_from: "api/photos/review",
      },
    })
    .eq("photo_id", input.photoId)
    .eq("status", "unread");

  if (error) {
    // The review itself should not fail just because the notification table
    // or notification row is missing. Log it and keep the staff action successful.
    console.warn("photos/review notification resolve skipped:", error.message);
  }
}

async function createRouteSupabase() {
  const cookieStore = await cookies();
  const pending: CookieToSet[] = [];

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll(cookiesToSet) {
          pending.push(...(cookiesToSet as CookieToSet[]));
          for (const c of cookiesToSet as CookieToSet[]) {
            try {
              cookieStore.set(c.name, c.value, c.options);
            } catch {
              // response cookies still applied below
            }
          }
        },
      },
    },
  );

  const withCookies = (res: NextResponse) => {
    for (const c of pending) {
      res.cookies.set(c.name, c.value, c.options);
    }
    return res;
  };

  return { supabase, withCookies, cookieStore };
}

export async function POST(req: Request) {
  try {
    const { supabase, withCookies, cookieStore } = await createRouteSupabase();

    let user: { id: string; email?: string | null } | null = null;

    // 1) Try cookie auth first
    const { data: cookieUserRes, error: cookieUserErr } =
      await supabase.auth.getUser();

    if (cookieUserErr) {
      console.error(
        "photos/review auth.getUser error (cookie):",
        cookieUserErr,
      );
    }

    user = cookieUserRes?.user ?? null;

    // 2) Fallback to bearer token from the browser request
    if (!user) {
      const authHeader = req.headers.get("authorization") || "";
      const token = authHeader.match(/^Bearer\s+(.+)$/i)?.[1] ?? null;

      console.log("photos/review bearer token present:", !!token);

      if (token) {
        const { data: bearerUserRes, error: bearerUserErr } =
          await supabase.auth.getUser(token);

        if (bearerUserErr) {
          console.error(
            "photos/review auth.getUser error (bearer):",
            bearerUserErr,
          );
        }

        user = bearerUserRes?.user ?? null;
      }
    }

    if (!user) {
      return withCookies(
        NextResponse.json(
          {
            error: "Unauthorized",
            debug: {
              reason: "No authenticated user from cookie or bearer token",
              cookie_names: cookieStore.getAll().map((c) => c.name),
            },
          },
          { status: 401 },
        ),
      );
    }

    const svc = getServiceSupabase();

    const { data: staff, error: staffErr } = await svc
      .from("staff")
      .select("id, auth_user_id, role, is_active, status, first_name")
      .eq("auth_user_id", user.id)
      .maybeSingle();

    if (staffErr) {
      console.error("photos/review staff lookup error:", staffErr);
      return withCookies(
        NextResponse.json({ error: staffErr.message }, { status: 500 }),
      );
    }

    const role = String(staff?.role ?? "").toLowerCase();
    const active = staff?.is_active !== false;
    const okStatus = isAllowedStaffStatus(staff?.status);

    const canReview =
      !!staff &&
      active &&
      okStatus &&
      (role === "admin" || role === "henry" || role === "staff");

    console.log("REVIEW auth user:", {
      id: user.id,
      email: user.email ?? null,
    });

    console.log("REVIEW staff row:", staff ?? null);

    if (!canReview) {
      return withCookies(
        NextResponse.json(
          {
            error: "Forbidden",
            debug: {
              auth_user_id: user.id,
              auth_email: user.email ?? null,
              staff_found: !!staff,
              staff_row: staff ?? null,
              role,
              active,
              okStatus,
            },
          },
          { status: 403 },
        ),
      );
    }

    const body = await req.json().catch(() => ({}));

    const photo_id = String(body.photo_id ?? "");
    const status = String(body.status ?? "") as ReviewStatus;
    const notes = body.notes != null ? String(body.notes) : null;
    const actor =
      (String(body.actor ?? "staff").toLowerCase() as Actor) || "staff";

    if (!photo_id || !status) {
      return withCookies(
        NextResponse.json(
          { error: "Missing photo_id or status" },
          { status: 400 },
        ),
      );
    }

    if (!["approved", "needs_attention", "rejected"].includes(status)) {
      return withCookies(
        NextResponse.json({ error: "Invalid status" }, { status: 400 }),
      );
    }

    const now = new Date().toISOString();

    const payload: Record<string, any> = {
      review_status: status,
      reviewed_at: now,
    };

    if (actor === "admin") {
      payload.admin_reviewed_at = now;
      payload.admin_reviewed_by = staff.id;
      payload.admin_notes = notes;
    } else {
      payload.staff_reviewed_at = now;
      payload.staff_reviewed_by = staff.id;
      payload.staff_notes = notes;
    }
const { data: photo, error: photoErr } = await svc
  .from("profile_photos")
  .select(`
    id,
    user_id,
    storage_bucket,
    storage_path,
    public_url,
    photo_kind,
    review_status
  `)
  .eq("id", photo_id)
  .maybeSingle();

if (photoErr) {
  console.error("photos/review photo lookup error:", photoErr);
  return withCookies(
    NextResponse.json({ error: photoErr.message }, { status: 500 }),
  );
}

if (!photo) {
  return withCookies(
    NextResponse.json({ error: "Photo not found" }, { status: 404 }),
  );
}

const photoKind = String(photo.photo_kind ?? "profile").toLowerCase();
const isProfilePhoto = photoKind === "profile";

let conversion:
  | Awaited<ReturnType<typeof ensureApprovedWebpDisplayCopy>>
  | null = null;

if (status === "approved" && isProfilePhoto) {
  try {
    conversion = await ensureApprovedWebpDisplayCopy(svc, photo);

    payload.storage_bucket = conversion.bucket;
    payload.storage_path = conversion.approvedPath;
    payload.public_url = null;
  } catch (conversionErr: any) {
    console.error("photos/review WebP conversion failed:", conversionErr);

    return withCookies(
      NextResponse.json(
        {
          error:
            "This photo could not be converted to WebP, so it was not approved yet.",
          detail: conversionErr?.message ?? String(conversionErr),
          debug: {
            photo_id: photo.id,
            storage_bucket: photo.storage_bucket,
            storage_path: photo.storage_path,
            public_url: photo.public_url,
            photo_kind: photo.photo_kind,
            review_status: photo.review_status,
          },
        },
        { status: 415 },
      ),
    );
  }
}
    const { error: updErr } = await svc
      .from("profile_photos")
      .update(payload)
      .eq("id", photo_id);

    if (updErr) {
      console.error("photos/review update error:", updErr);
      return withCookies(
        NextResponse.json({ error: updErr.message }, { status: 500 }),
      );
    }

    await tryResolvePhotoReviewNotification(svc, {
      photoId: photo_id,
      staffId: staff.id,
      reviewStatus: status,
      resolvedAt: now,
    });

    return withCookies(
      NextResponse.json({
        ok: true,
        debug: {
          auth_user_id: user.id,
          staff_id: staff.id,
          role,
          photo_id,
          status,
          actor,
          webp_conversion:
            conversion && status === "approved"
              ? {
                  converted: conversion.converted,
                  original_kept: true,
                  original_bucket: conversion.bucket,
                  original_path: conversion.originalPath,
                  approved_bucket: conversion.bucket,
                  approved_path: conversion.approvedPath,
                  width: conversion.width,
                  height: conversion.height,
                  original_bytes: conversion.originalBytes,
                  webp_bytes: conversion.webpBytes,
                }
              : null,
        },
      }),
    );
  } catch (e: any) {
    console.error("photos/review fatal:", e);
    return NextResponse.json(
      { error: e?.message ?? "Server error" },
      { status: 500 },
    );
  }
}
