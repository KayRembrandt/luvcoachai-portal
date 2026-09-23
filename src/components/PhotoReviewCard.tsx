"use client";
import React from "react";
import { PortalIcon } from "@/components/portal/PortalIcon";
import { StatusBadge } from "@/components/portal/ReviewUI";
import styles from "@/components/portal/review.module.css";
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
    photo_kind?: string | null;
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
    <article
      className={styles.photoCard}
      aria-label="Photo review"
      aria-busy={!!busy}
    >
      <div className={styles.photoPreview}>
        {src && !previewFailed ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={src}
            alt="Photo submitted for review"
            onError={() => void handleImageError()}
          />
        ) : <div className={styles.photoUnavailable}>Preview unavailable</div>}
      </div>
      <div className={styles.photoMetadata}>
        <div className={styles.metadataLine}>
          <strong>User ID:</strong>
          <span>
            {photo.user_id}
          </span>
        </div>
        <div className={styles.metadataLine}>
          <strong>Photo ID:</strong>
          <span>
            {photo.id}
          </span>
        </div>
        <div className={styles.photoTags}>
          <span className={styles.statusBadge}>Kind: {String(photo.photo_kind ?? photo.kind ?? "") || "—"}</span>
          {photo.photo_kind === "identity_selfie" && <span className={styles.statusBadge}>Identity Selfie</span>}
        </div>
        <div className={styles.metadataLine}>
          <strong>Status:</strong>
          <StatusBadge value={status} />
        </div>
      </div>
      <div className={styles.actionButtons}>
        <button
          type="button"
          disabled={!!busy || !canApprove}
          onClick={onApprove}
          title={canApprove ? "Approve photo" : "Preview unavailable"}
          className={styles.button}
          data-variant="approve"
        >
          <PortalIcon name="check" />Approve
        </button>
        <button
          type="button"
          disabled={!!busy}
          onClick={() => {
            setNoteMode("admin");
            setNote("");
          }}
          className={styles.button}
          data-variant="attention"
        >
          <PortalIcon name="alert" />Admin Review
        </button>
        <button
          type="button"
          disabled={!!busy}
          onClick={() => {
            setNoteMode("reject");
            setNote("");
          }}
          className={styles.button}
          data-variant="reject"
        >
          <PortalIcon name="close" />Reject
        </button>
      </div>
      {noteMode && (
        <div className={styles.notePanel}>
          <label htmlFor={`review-note-${photo.id}`}>
            {noteMode === "admin" ? "Admin review note (required)" : "Rejection reason (required)"}
          </label>
          <textarea
            id={`review-note-${photo.id}`}
            value={note}
            onChange={(event) => setNote(event.target.value)}
            className={styles.noteInput}
            rows={3}
            placeholder={
              noteMode === "admin"
                ? "Why is this questionable? (e.g., face not visible, child in photo, screenshot, looks fake...)"
                : "Why are you rejecting this photo? (e.g., explicit content, no person, child, hate symbol, fake/AI, copyrighted...)"
            }
            disabled={!!busy}
          />
          <div className={styles.actionButtons}>
            <button
              type="button"
              disabled={!!busy || note.trim().length === 0}
              onClick={submitNote}
              className={styles.button}
              data-variant="primary"
            >Submit</button>
            <button
              type="button"
              disabled={!!busy}
              onClick={closeNote}
              className={styles.button}
            >Cancel</button>
          </div>
          {(photo.staff_notes || photo.admin_notes) && (
            <div className={styles.existingNotes}>
              {photo.staff_notes && <div>
                <strong>Staff note:</strong>
                {photo.staff_notes}
              </div>}
              {photo.admin_notes && <div>
                <strong>Admin note:</strong>
                {photo.admin_notes}
              </div>}
            </div>
          )}
        </div>
      )}
    </article>
  );
}
