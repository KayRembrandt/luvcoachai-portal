"use client";

import React from "react";
import {
  isSignedSupabaseStorageUrl,
  logFailedImageResponse,
  refreshProfilePhotoSignedUrl,
} from "@/lib/photoSignedUrlClient";

type Props = {
  photo: {
    id: string;
    user_id: string;
    signed_url?: string | null;
    displayUrl?: string | null;
    imageUrl?: string | null;
    fallbackUrl?: string | null;
    storage_bucket?: string | null;
    storage_path?: string | null;
    thumbPath?: string | null;
    photoUrlError?: string | null;
    review_status: string;
   staff_notes?: string | null;
   admin_notes?: string | null;
   photo_kind?: string | null
   kind?: string | null;
  };
  busy?: boolean;
  onApprove: () => void;
  onReject: (note: string) => void; // required
  onNeedsAttention: (note: string) => void; // required
};

export default function PhotoReviewCard({
  photo,
  busy,
  onApprove,
  onReject,
  onNeedsAttention,
}: Props) {
  const [noteMode, setNoteMode] = React.useState<"admin" | "reject" | null>(
    null
  );
  const [note, setNote] = React.useState("");
  const [previewFailed, setPreviewFailed] = React.useState(false);
  const [srcOverride, setSrcOverride] = React.useState<string | null>(null);
  const [fallbackSrcOverride, setFallbackSrcOverride] = React.useState<string | null>(null);
  const [triedRefresh, setTriedRefresh] = React.useState(false);
  const [refreshing, setRefreshing] = React.useState(false);

  const primarySrc = photo.displayUrl ?? photo.signed_url ?? "";
  const fallbackSrc =
    fallbackSrcOverride ??
    photo.fallbackUrl ??
    (photo.imageUrl && photo.imageUrl !== primarySrc ? photo.imageUrl : null);
  const src = srcOverride ?? primarySrc;
  const canApprove = !!src && !previewFailed && !refreshing;
  const status = photo.review_status ?? "pending";  

  async function handleImageError() {
    const logMeta = {
      photoId: photo.id,
      userId: photo.user_id,
      storageBucket: photo.storage_bucket,
      storagePath: photo.storage_path,
      thumbPath: photo.thumbPath,
      displayUrl: src,
      photoUrlError: photo.photoUrlError,
    };

    console.error("Profile photo failed to render", logMeta);

    if (isSignedSupabaseStorageUrl(src)) {
      await logFailedImageResponse(src, logMeta);
    }

    if (!triedRefresh && isSignedSupabaseStorageUrl(src)) {
      setTriedRefresh(true);
      setRefreshing(true);

      try {
        const refreshed = await refreshProfilePhotoSignedUrl(photo.id);
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
          setRefreshing(false);
          return;
        }
      } catch (error) {
        console.error("Profile photo signed URL refresh failed", {
          ...logMeta,
          error: error instanceof Error ? error.message : String(error),
        });
      }

      setRefreshing(false);
    }

    if (fallbackSrc && src !== fallbackSrc) {
      setSrcOverride(fallbackSrc);
      return;
    }

    setPreviewFailed(true);
  }
  function closeNote() {
    setNoteMode(null);
    setNote("");
  }

  function submitNote() {
    const trimmed = note.trim();
    if (!trimmed) return;

    if (noteMode === "admin") onNeedsAttention(trimmed);
    if (noteMode === "reject") onReject(trimmed);

    closeNote();
  }

  return (
    <div className="rounded-2xl border bg-white p-4 shadow-sm">
      {/* Photo preview box (size capped) */}
      <div className="w-full">
        <div className="mx-auto w-full max-w-[420px] overflow-hidden rounded-xl bg-gray-100">
          <div className="relative w-full">
            {src && !previewFailed ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={src}
                alt="Pending photo"
                className="block w-full h-auto object-contain max-h-[420px]"
                onError={() => void handleImageError()}
              />
            ) : (
              <div className="flex h-[220px] w-full items-center justify-center text-sm text-gray-500">
                Preview unavailable
              </div>
            )}
          </div>
        </div>
      </div>

{/* Meta + actions */}
<div className="mt-4 grid grid-cols-[1fr,200px] gap-4 items-start">
  {/* LEFT: meta + status */}
  <div className="min-w-0">
    {/* User ID - single line */}
    <div className="text-xs text-gray-600 flex items-center gap-2">
      <span className="text-gray-500">User ID:</span>
      <span className="font-mono text-gray-800 truncate">{photo.user_id}</span>
    </div>

    {/* Photo ID - single line */}
    <div className="text-xs text-gray-600 flex items-center gap-2 mt-1">
      <span className="text-gray-500">Photo ID:</span>
      <span className="font-mono text-gray-800 truncate">{photo.id}</span>
    </div>

<div className="text-base text-slate-700 font-semibold inline-flex items-center px-3 py-1 rounded-full text-sm font-semibold border">
  
  kind: {String(photo.photo_kind ?? photo.kind ?? "")}
</div>
    {/* Status label + badge in the open space */}
    <div className="mt-3">
      <div className="text-xs text-gray-500 mb-1">Status</div>
      <div
        className={[
          "inline-flex items-center px-3 py-1 rounded-full text-sm font-semibold border",
          status === "approved"
            ? "bg-green-50 text-green-700 border-green-200"
            : status === "rejected"
            ? "bg-red-50 text-red-700 border-red-200"
            : status === "needs_admin_review"
            ? "bg-yellow-50 text-yellow-800 border-yellow-200"
            : "bg-gray-100 text-gray-700 border-gray-200",
        ].join(" ")}
      >
        {status?.toUpperCase().replace(/_/g, " ")}
      </div>
    </div>
  </div>

<div className="flex items-center gap-2">
  {photo.photo_kind === "identity_selfie" && (
    <span className="px-3 py-1 rounded-full text-sm font-medium bg-blue-600 text-white">
      Identity Selfie
    </span>
  )}
</div>
          <div className="flex shrink-0 flex-col gap-2">
            <button
              disabled={!!busy || !canApprove}
              onClick={onApprove}
              title={canApprove ? "Approve photo" : "Preview unavailable"}
              className="px-4 py-2 rounded-full bg-green-100 text-green-700 hover:bg-green-200 transition disabled:cursor-not-allowed disabled:opacity-60"
            >
              ✅ Approve
            </button>

            <button
              disabled={!!busy}
              onClick={() => {
                setNoteMode("admin");
                setNote("");
              }}
              className="px-4 py-2 rounded-full bg-yellow-100 text-yellow-800 hover:bg-yellow-200 transition disabled:opacity-60"
            >
              ⚠️ Admin Review
            </button>

            <button
              disabled={!!busy}
              onClick={() => {
                setNoteMode("reject");
                setNote("");
              }}
              className="px-4 py-2 rounded-full bg-red-100 text-red-700 hover:bg-red-200 transition disabled:opacity-60"
            >
              ❌ Reject
            </button>
          </div>
        </div>
        

        {/* Row 2: note panel (full width) */}
        {noteMode && (
          <div className="w-full rounded-xl border bg-white p-3">
            <label className="block text-xs text-gray-600 mb-2">
              {noteMode === "admin"
                ? "Admin review note (required)"
                : "Rejection reason (required)"}
            </label>

            <textarea
              value={note}
              onChange={(e) => setNote(e.target.value)}
              className="w-full rounded-lg border px-3 py-2 text-sm"
              rows={3}
              placeholder={
                noteMode === "admin"
                  ? "Why is this questionable? (e.g., face not visible, child in photo, screenshot, looks fake...)"
                  : "Why are you rejecting this photo? (e.g., explicit content, no person, child, hate symbol, fake/AI, copyrighted...)"
              }
              disabled={!!busy}
            />

            <div className="mt-3 flex gap-2">
              <button
                disabled={!!busy || note.trim().length === 0}
                onClick={submitNote}
                className={
                  "px-4 py-2 rounded-full text-black transition disabled:opacity-60 " +
                  (noteMode === "admin"
                    ? "bg-yellow-600 hover:bg-yellow-700"
                    : "bg-red-600 hover:bg-red-700")
                }
              >
                Submit
              </button>

              <button
                disabled={!!busy}
                onClick={closeNote}
                className="px-4 py-2 rounded-full border hover:bg-gray-50 transition disabled:opacity-60"
              >
                Cancel
              </button>
            </div>
            {/* Existing review notes */}
{(photo.staff_notes || photo.admin_notes) && (
  <div className="mb-3 w-full rounded-lg bg-slate-50 p-3 text-xs">
    {photo.staff_notes && (
      <div className="text-slate-700">
        <span className="font-semibold">Staff note:</span> {photo.staff_notes}
      </div>
    )}

    {photo.admin_notes && (
      <div className="mt-1 text-amber-700">
        <span className="font-semibold">Admin note:</span> {photo.admin_notes}
      </div>
    )}
  </div>
)}
          </div>
          
        )}
      </div>
   
  );
}
