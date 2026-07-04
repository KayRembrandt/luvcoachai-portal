"use client";

import React from "react";
import PhotoReviewCard from "@/components/PhotoReviewCard";
import { supabaseBrowser } from "@/lib/supabaseBrowser";
import { useRouter } from "next/navigation";

export type PendingPhoto = {
  id: string;
  user_id: string;
  signed_url?: string | null;
  displayUrl?: string | null;
  imageUrl?: string | null;
  storage_bucket?: string | null;
  storage_path?: string | null;
  thumbPath?: string | null;
  photoUrlError?: string | null;
  review_status: string;
  photo_kind?: string | null;
  kind?: string | null;
  staff_notes?: string | null;
  admin_notes?: string | null;
};

export default function UserPendingPhotoCards({
  photos,
  onChanged,
}: {
  photos: PendingPhoto[];
  onChanged?: () => void;
}) {
  const [busyId, setBusyId] = React.useState<string | null>(null);
  const [error, setError] = React.useState<string | null>(null);
  const router = useRouter();

  async function callReviewApi(
    photoId: string,
    status: "approved" | "needs_attention" | "rejected",
    note?: string
  ) {
    setBusyId(photoId);
    setError(null);

    try {
      const {
        data: { session },
        error: sessionError,
      } = await supabaseBrowser.auth.getSession();

      if (sessionError) {
        console.error("UserPendingPhotoCards getSession error:", sessionError);
        setError(sessionError.message || "Could not verify your session.");
        setBusyId(null);
        return;
      }

      const token = session?.access_token ?? null;

      if (!token) {
        setError("Not logged in.");
        setBusyId(null);
        return;
      }

      console.log("UserPendingPhotoCards review session:", {
        auth_user_id: session?.user?.id ?? null,
        auth_email: session?.user?.email ?? null,
        hasToken: !!token,
      });

      const res = await fetch("/api/photos/review", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        cache: "no-store",
        body: JSON.stringify({
          photo_id: photoId,
          status,
          notes: note ?? null,
          actor: "admin",
        }),
      });

      const json = await res.json().catch(() => ({}));

      console.log("UserPendingPhotoCards review response:", res.status, json);

      setBusyId(null);

      if (!res.ok) {
        setError(json?.error ?? `Review failed (${res.status})`);
        return;
      }

      onChanged?.();
      router.refresh();
    } catch (err: unknown) {
      console.error("UserPendingPhotoCards review failed:", err);
      setBusyId(null);
      setError(err instanceof Error ? err.message : "Photo review failed.");
    }
  }

  return (
    <div className="space-y-4">
      {error ? (
        <div className="rounded-2xl border border-red-200 bg-red-50 p-3 text-sm text-red-700">
          {error}
        </div>
      ) : null}

      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
        {photos.map((p) => (
          <PhotoReviewCard
            key={p.id}
            photo={p}
            busy={busyId === p.id}
            onApprove={() => callReviewApi(p.id, "approved")}
            onNeedsAttention={(note) =>
              callReviewApi(p.id, "needs_attention", note)
            }
            onReject={(note) => callReviewApi(p.id, "rejected", note)}
          />
        ))}
      </div>
    </div>
  );
}
