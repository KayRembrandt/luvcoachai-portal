"use client";

import { supabaseBrowser } from "@/lib/supabaseBrowser";

export function isSignedSupabaseStorageUrl(value: string | null | undefined) {
  if (!value) return false;

  try {
    const url = new URL(value);
    return url.pathname.includes("/storage/v1/object/sign/");
  } catch {
    return false;
  }
}

export async function logFailedImageResponse(src: string, meta?: Record<string, unknown>) {
  try {
    const response = await fetch(src, { cache: "no-store" });
    const contentType = response.headers.get("content-type");
    const buffer = await response.arrayBuffer();
    const bodyPrefix = new TextDecoder()
      .decode(buffer.slice(0, Math.min(buffer.byteLength, 500)))
      .replace(/\s+/g, " ")
      .slice(0, 500);

    console.error("Profile photo URL returned non-image response", {
      ...meta,
      status: response.status,
      contentType,
      downloadedBytes: buffer.byteLength,
      bodyPrefix,
    });
  } catch (error) {
    console.error("Profile photo failed response inspection", {
      ...meta,
      error: error instanceof Error ? error.message : String(error),
    });
  }
}

 export async function refreshProfilePhotoSignedUrl(photoId: string) {
  console.log("[photo-refresh] start", { photoId });

  const {
    data: { session },
    error: sessionError,
  } = await supabaseBrowser.auth.getSession();

  console.log("[photo-refresh] session check", {
    photoId,
    hasSession: !!session,
    hasAccessToken: !!session?.access_token,
    userId: session?.user?.id ?? null,
    sessionError: sessionError?.message ?? null,
  });

  if (sessionError) {
    console.error("[photo-refresh] session error", {
      photoId,
      message: sessionError.message,
    });
    throw new Error(sessionError.message || "Could not verify session.");
  }

  const token = session?.access_token ?? null;

  if (!token) {
    console.error("[photo-refresh] missing staff access token", { photoId });
    throw new Error("Missing staff access token.");
  }

  const response = await fetch("/api/photos/signed-url", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
    },
    cache: "no-store",
    body: JSON.stringify({ photoId }),
  });

  const json = await response.json().catch(() => ({}));

  console.log("[photo-refresh] endpoint response", {
    photoId,
    status: response.status,
    ok: response.ok,
    hasThumbUrl: !!json?.thumbUrl,
    hasImageUrl: !!json?.imageUrl,
    hasDisplayUrl: !!json?.displayUrl,
    hasFallbackUrl: !!json?.fallbackUrl,
    error: json?.error ?? json?.photoUrlError ?? null,
  });

  if (!response.ok) {
    throw new Error(json?.error ?? `Signed URL refresh failed (${response.status})`);
  }

  return json as {
    thumbUrl: string | null;
    imageUrl: string | null;
    displayUrl: string | null;
    fallbackUrl: string | null;
    photoUrlError: string | null;
  };
}
