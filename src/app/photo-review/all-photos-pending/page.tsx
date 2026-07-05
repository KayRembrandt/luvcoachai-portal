"use client";

import React from "react";
import PhotoReviewCard from "@/components/PhotoReviewCard";

import { supabaseBrowser } from "@/lib/supabaseBrowser";

type PhotoRow = {
  id: string;
  user_id: string;
  storage_bucket: string | null;
  storage_path: string | null;
  thumbPath?: string | null;
  signed_url?: string | null;
  displayUrl?: string | null;
  imageUrl?: string | null;
  fallbackUrl?: string | null;
  photoUrlError?: string | null;
  review_status: string | null;
  review_notes: string | null;
  created_at: string;
  is_primary: boolean | null;
  sort_order: number | null;
};

export default function PhotoReviewPage() {
  const [rows, setRows] = React.useState<PhotoRow[]>([]);
  const [signedMap, setSignedMap] = React.useState<Record<string, string>>({} as Record<string, string>);

  const [error, setError] = React.useState<string | null>(null);
  const [loading, setLoading] = React.useState(true);

  const [busyId, setBusyId] = React.useState<string | null>(null);
  const [statusFilter, setStatusFilter] = React.useState<
  "pending" | "needs_attention" | "rejected" | "all"
>("pending");
const [actorMode, setActorMode] = React.useState<"staff" | "admin">("staff");

  async function load() {
  setLoading(true);
  setError(null);

  try {
    const {
      data: { session },
      error: sessionError,
    } = await supabaseBrowser.auth.getSession();

    if (sessionError) {
      console.error("PhotoReviewPage getSession error:", sessionError);
      setError(sessionError.message || "Could not verify your session.");
      setRows([]);
      setLoading(false);
      return;
    }

    const token = session?.access_token ?? null;

    if (!token) {
      console.error("PhotoReviewPage: no access token found.");
      setError("Not logged in.");
      setRows([]);
      setLoading(false);
      return;
    }

    console.log("PhotoReviewPage load session:", {
      auth_user_id: session?.user?.id ?? null,
      auth_email: session?.user?.email ?? null,
      hasToken: !!token,
    });

    const res = await fetch(
      "/api/photos/pending",
      {
        method: "GET",
        headers: {
          Authorization: `Bearer ${token}`,
        },
        cache: "no-store",
      }
    );

    const json = await res.json().catch(() => ({}));

    console.log("PhotoReviewPage pending photos response:", res.status, json);

    if (!res.ok) {
      setError(json?.error ?? `Failed to load (${res.status})`);
      setRows(json?.photos ?? []);
      setSignedMap(json?.signedMap ?? {});
      setLoading(false);
      return;
    }

    setRows(json?.photos ?? []);
    setSignedMap(json?.signedMap ?? {});
    setLoading(false);
  } catch (err: unknown) {
    console.error("PhotoReviewPage load failed:", err);
    const message = err instanceof Error ? err.message : "Something went wrong while loading.";

    if (
      (err instanceof Error && err.name === "AbortError") ||
      message.toLowerCase().includes("aborted")
    ) {
      setLoading(false);
      return;
    }

    setError(message);
    setRows([]);
    setLoading(false);
  }
}

async function review(
  photoId: string,
  status: "approved" | "needs_attention" | "rejected",
  actor: "staff" | "admin",
  note?: string
) {
  setBusyId(photoId);
  setError(null);

  // Get the currently logged-in auth user id
  const { data: userRes, error: userErr } = await supabaseBrowser.auth.getUser();
  const authUserId = userRes?.user?.id ?? null;

  if (userErr) {
    console.error("auth.getUser error:", userErr);
  }

  const now = new Date().toISOString();

  const payload: Record<string, unknown> = {
    review_status: status,
    reviewed_at: now, // keep your existing field if you already use it
  };

  if (actor === "staff") {
    payload.staff_reviewed_at = now;
    payload.staff_reviewed_by = authUserId;
    if (typeof note === "string") payload.staff_notes = note;
  } else {
    payload.admin_reviewed_at = now;
    payload.admin_reviewed_by = authUserId;
    if (typeof note === "string") payload.admin_notes = note;
  }

  const { error, data } = await supabaseBrowser
    .from("profile_photos")
    .update(payload)
    .eq("id", photoId)
    .select("id, review_status, staff_notes, admin_notes")
    .single();

  setBusyId(null);

  if (error) {
    console.error("Photo review update failed:", error);
    setError(error.message);
    return;
  }

  console.log("Updated:", data);
  await load();
}


  React.useEffect(() => {
    load();
  }, []);
  
const filteredRows =
  statusFilter === "all"
    ? rows
    : rows.filter((r) => (r.review_status ?? "pending") === statusFilter);

React.useEffect(() => {
  if (statusFilter === "needs_attention") setActorMode("admin");
  else setActorMode("staff");
}, [statusFilter]);

  return (
    <div className="p-6">
      <div className="flex items-end justify-between">
        <div>
          <h1 className="text-2xl font-semibold">Photo Review</h1>
          <p className="text-sm text-gray-600 mt-1">
            Pending queue • {rows.length} items
          </p>
        </div>

        <button
          onClick={load}
          className="rounded-xl border px-4 py-2 text-sm hover:bg-gray-10"
          disabled={loading}
        >
          {loading ? "Loading…" : "Refresh"}
        </button>
      </div>

      {error && (
        <div className="mt-4 rounded-2xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">
          {error}
        </div>
      )}

      
<div className="flex flex-wrap gap-2 mb-4">
  {[
    { key: "pending", label: "Pending" },
    { key: "needs_attention", label: "Needs Attention" },
    { key: "rejected", label: "Rejected" },
    { key: "all", label: "All" },
  ].map((t) => (
    <button
      key={t.key}
      onClick={() => setStatusFilter(t.key as typeof statusFilter)}
      className={
        "px-4 py-2 rounded-full border text-sm transition " +
        (statusFilter === t.key
          ? "bg-blue-600 text-white border-blue-600"
          : "bg-white text-black hover:bg-grey-100")
      }
    >
      {t.label}
    </button>
  ))}
</div>
{/* Acting-as toggle (controls where notes/reviewed_by are saved) */}
<div className="mb-4 flex items-center gap-2">
  <span className="text-xs text-black-600">Acting as:</span>

  <button
    type="button"
    onClick={() => setActorMode("staff")}
    className={
      "px-3 py-1 rounded-full border text-xs transition " +
      (actorMode === "staff"
        ? "bg-gray-900 text-white border-gray-900"
        : "bg-white text-black hover:bg-gray-50")
    }
  >
    Staff
  </button>

  <button
    type="button"
    onClick={() => setActorMode("admin")}
    className={
      "px-3 py-1 rounded-full border text-xs transition " +
      (actorMode === "admin"
        ? "bg-gray-900 text-white border-gray-900"
        : "bg-white text-black hover:bg-gray-50")
    }
  >
    Admin
  </button>

  {statusFilter === "needs_attention" && (
    <span className="ml-2 text-xs text-yellow-700">
      (Admin queue)
    </span>
  )}
</div>

      <div className="grid gap-4 grid-cols-6 sm:grid-cols-5 lg:grid-cols-4 2xl:grid-cols-3">
        
       {filteredRows.map((row) => {
          const key =
            row.storage_bucket && row.storage_path
              ? `${row.storage_bucket}:${row.storage_path}`
              : null;

          const signedUrl =
            row.displayUrl ?? row.signed_url ?? (key ? signedMap[key] : null);

       const cardPhoto = {
  id: row.id,
  user_id: row.user_id,
  storage_bucket: row.storage_bucket,
  storage_path: row.storage_path ?? "",
  thumbPath: row.thumbPath ?? null,
  review_status: row.review_status ?? "pending",
  review_notes: row.review_notes,
  created_at: row.created_at,
  signed_url: signedUrl ?? undefined,
  displayUrl: signedUrl ?? null,
  imageUrl: row.imageUrl ?? null,
  fallbackUrl: row.fallbackUrl ?? row.imageUrl ?? null,
  photoUrlError: row.photoUrlError ?? null,
};

return (
<PhotoReviewCard
  key={row.id}
  photo={cardPhoto}
  busy={busyId === row.id}

onApprove={() => review(row.id, "approved", actorMode)}

onNeedsAttention={(note) => review(row.id, "needs_attention", actorMode, note)}

onReject={(note) => review(row.id, "rejected", actorMode, note)}

/>

);

        })}

        {!loading && rows.length === 0 && !error && (
          <div className="rounded-2xl border bg-white p-6 text-sm text-gray-600">
            Nothing pending right now 🎉
          </div>
        )}
      </div>
    </div>
  );
}
