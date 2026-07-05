"use client";

import React from "react";
import {
  isSignedSupabaseStorageUrl,
  logFailedImageResponse,
  refreshProfilePhotoSignedUrl,
} from "@/lib/photoSignedUrlClient";

type Props = {
  src: string | null;
  fallbackSrc?: string | null;
  photoId?: string | null;
  alt: string;
  className?: string;
  fallbackClassName?: string;
  meta?: Record<string, unknown>;
};

export default function ProfileImagePreview({
  src,
  fallbackSrc,
  photoId,
  alt,
  className,
  fallbackClassName,
  meta,
}: Props) {
  const [failed, setFailed] = React.useState(false);
  const [srcOverride, setSrcOverride] = React.useState<string | null>(null);
  const [fallbackSrcOverride, setFallbackSrcOverride] = React.useState<string | null>(null);
  const [triedRefresh, setTriedRefresh] = React.useState(false);
  const currentSrc = srcOverride ?? src;
  const currentFallbackSrc = fallbackSrcOverride ?? fallbackSrc;

  async function handleImageError() {
    const logMeta = {
      ...meta,
      photoId: photoId ?? meta?.photoId,
      displayUrl: currentSrc,
    };

    console.error("Profile photo failed to render", logMeta);

    if (currentSrc && isSignedSupabaseStorageUrl(currentSrc)) {
      await logFailedImageResponse(currentSrc, logMeta);
    }

    const refreshId =
      photoId ?? (typeof meta?.photoId === "string" ? meta.photoId : null);

    if (currentSrc && !triedRefresh && refreshId && isSignedSupabaseStorageUrl(currentSrc)) {
      setTriedRefresh(true);

      try {
        const refreshed = await refreshProfilePhotoSignedUrl(refreshId);
        const refreshedSrc = refreshed.displayUrl ?? refreshed.imageUrl;
        const refreshedFallbackSrc = refreshed.fallbackUrl ?? refreshed.imageUrl;

        console.log("Profile photo signed URL refreshed after render error", {
          ...logMeta,
          refreshedDisplayUrlCreated: !!refreshed.displayUrl,
          refreshedFullUrlCreated: !!refreshed.imageUrl,
          refreshedFallbackUrlCreated: !!refreshedFallbackSrc,
          refreshedPhotoUrlError: refreshed.photoUrlError,
        });

        if (refreshedSrc) {
          setFallbackSrcOverride(refreshedFallbackSrc);
          setSrcOverride(refreshedSrc);
          return;
        }
      } catch (error) {
        console.error("Profile photo signed URL refresh failed", {
          ...logMeta,
          error: error instanceof Error ? error.message : String(error),
        });
      }
    }

    if (currentFallbackSrc && currentSrc !== currentFallbackSrc) {
      setSrcOverride(currentFallbackSrc);
      return;
    }

    setFailed(true);
  }

  if (!currentSrc || failed) {
    return (
      <div
        className={
          fallbackClassName ??
          "flex h-full w-full items-center justify-center text-sm text-slate-500"
        }
      >
        Preview unavailable
      </div>
    );
  }

  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={currentSrc}
      alt={alt}
      className={className}
      onError={() => void handleImageError()}
    />
  );
}
