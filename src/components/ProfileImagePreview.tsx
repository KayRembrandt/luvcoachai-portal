"use client";

import React from "react";

type Props = {
  src: string | null;
  fallbackSrc?: string | null;
  alt: string;
  className?: string;
  fallbackClassName?: string;
  meta?: Record<string, unknown>;
};

export default function ProfileImagePreview({
  src,
  fallbackSrc,
  alt,
  className,
  fallbackClassName,
  meta,
}: Props) {
  const [failed, setFailed] = React.useState(false);
  const [srcOverride, setSrcOverride] = React.useState<string | null>(null);
  const currentSrc = srcOverride ?? src;

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
      onError={() => {
        console.error("Profile photo failed to render", {
          ...meta,
          displayUrl: currentSrc,
        });
        if (fallbackSrc && currentSrc !== fallbackSrc) {
          setSrcOverride(fallbackSrc);
          return;
        }
        setFailed(true);
      }}
    />
  );
}
