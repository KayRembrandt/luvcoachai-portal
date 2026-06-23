"use client";

import React from "react";
import { useRouter } from "next/navigation";
import { supabaseBrowser } from "@/lib/supabaseBrowser";

type PendingUserRow = {
  user_id: string;
  screen_name: string | null;
  display_name: string | null;
  date_of_birth: string | null;
  gender_identity: string | null;
  tier: string | null;
  status: string | null;
  pending_count: number;
  needs_attention_count: number;
  rejected_count: number;
  approved_count: number;
  oldest_pending_at: string;
  newest_pending_at: string;
};

type NotificationSummary = {
  unreadCount: number;
  newestAt: string | null;
};

function calcAge(dob: string | null) {
  if (!dob) return null;
  const d = new Date(dob);
  if (Number.isNaN(d.getTime())) return null;

  const now = new Date();
  let age = now.getFullYear() - d.getFullYear();
  const monthDiff = now.getMonth() - d.getMonth();

  if (monthDiff < 0 || (monthDiff === 0 && now.getDate() < d.getDate())) {
    age -= 1;
  }

  return age;
}

type QueueFilter = "pending" | "needs_attention" | "rejected" | "all";

export default function PhotoReviewPage() {
  const router = useRouter();

  const [rows, setRows] = React.useState<PendingUserRow[]>([]);
  const [error, setError] = React.useState<string | null>(null);
  const [loading, setLoading] = React.useState(true);
  const [statusFilter, setStatusFilter] =
    React.useState<QueueFilter>("pending");
  const [notificationSummary, setNotificationSummary] =
    React.useState<NotificationSummary | null>(null);

  async function load(options: { silent?: boolean } = {}) {
    const silent = options.silent === true;

    if (!silent) {
      setLoading(true);
      setError(null);
    }

    try {
      const {
        data: { session },
        error: sessionError,
      } = await supabaseBrowser.auth.getSession();

      if (sessionError) {
        console.error("PhotoReviewPage getSession error:", sessionError);
        setError(sessionError.message || "Could not verify your session.");
        setRows([]);
        return;
      }

      const token = session?.access_token ?? null;

      if (!token) {
        console.error("PhotoReviewPage: no access token found.");
        setError("Not logged in.");
        setRows([]);
        return;
      }

      console.log("PhotoReviewPage load session:", {
        auth_user_id: session?.user?.id ?? null,
        auth_email: session?.user?.email ?? null,
        hasToken: !!token,
      });

      const res = await fetch(
        `/api/photos/pending-users?status=${encodeURIComponent(statusFilter)}`,
        {
          method: "GET",
          headers: {
            Authorization: `Bearer ${token}`,
          },
          cache: "no-store",
        },
      );

      const json = await res.json().catch(() => ({}));

      console.log("PhotoReviewPage pending-users response:", res.status, json);

      if (!res.ok) {
        setError(json?.error ?? `Failed to load (${res.status})`);
        setRows(json?.rows ?? json?.users ?? []);
        return;
      }

      setRows(json?.rows ?? json?.users ?? []);
      setError(null);

      const {
        count,
        data: notificationRows,
        error: notificationError,
      } = await supabaseBrowser
        .from("photo_review_notifications")
        .select("id, created_at", { count: "exact" })
        .eq("status", "unread")
        .order("created_at", { ascending: false })
        .limit(1);

      if (notificationError) {
        // Do not break the queue if the notification table or RLS policy is not deployed yet.
        console.warn(
          "PhotoReviewPage notification summary skipped:",
          notificationError.message,
        );
        setNotificationSummary(null);
      } else {
        setNotificationSummary({
          unreadCount: count ?? notificationRows?.length ?? 0,
          newestAt: notificationRows?.[0]?.created_at ?? null,
        });
      }
    } catch (err: any) {
      console.error("PhotoReviewPage load failed:", err);

      if (
        err?.name === "AbortError" ||
        String(err?.message ?? "")
          .toLowerCase()
          .includes("aborted")
      ) {
        return;
      }

      setError(err?.message ?? "Something went wrong while loading.");
    } finally {
      if (!silent) {
        setLoading(false);
      }
    }
  }

  React.useEffect(() => {
    load();

    // This gives staff an in-portal notification even if they leave the queue open.
    const intervalId = window.setInterval(() => {
      load({ silent: true });
    }, 30_000);

    return () => window.clearInterval(intervalId);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [statusFilter]);

  function getAwaitingCount(row: PendingUserRow) {
    if (statusFilter === "needs_attention") return row.needs_attention_count;
    if (statusFilter === "rejected") return row.rejected_count;
    if (statusFilter === "pending") return row.pending_count;
    return row.pending_count + row.needs_attention_count + row.rejected_count;
  }

  const unreadNotificationCount = notificationSummary?.unreadCount ?? 0;

  return (
    <div className="p-6">
      <div className="flex items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold text-[#0F1B33]">
            Photo Review
          </h1>
          <p className="mt-1 text-sm text-gray-600">
            Queue of users with photos awaiting review • {rows.length} users
          </p>
        </div>

        <button
          type="button"
          onClick={() => load()}
          disabled={loading}
          className="rounded-xl border px-4 py-2 text-sm hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-60"
        >
          {loading ? "Loading…" : "Refresh"}
        </button>
      </div>

      {unreadNotificationCount > 0 && (
        <div className="mt-4 rounded-2xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">
          <div className="font-semibold">🔔 Photo review alert</div>
          <div className="mt-1">
            {unreadNotificationCount} uploaded{" "}
            {unreadNotificationCount === 1 ? "photo needs" : "photos need"}{" "}
            staff review
            {notificationSummary?.newestAt
              ? ` • Latest upload ${new Date(notificationSummary.newestAt).toLocaleString()}`
              : ""}
          </div>
        </div>
      )}

      {error && (
        <div className="mt-4 rounded-2xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">
          {error}
        </div>
      )}

      <div className="my-4 flex flex-wrap gap-2">
        {[
          { key: "pending", label: "Pending" },
          { key: "needs_attention", label: "Needs Attention" },
          { key: "rejected", label: "Rejected" },
          { key: "all", label: "All" },
        ].map((item) => {
          const active = statusFilter === item.key;

          return (
            <button
              key={item.key}
              type="button"
              onClick={() => setStatusFilter(item.key as QueueFilter)}
              className={[
                "rounded-full border px-4 py-2 text-sm transition",
                active
                  ? "border-blue-600 bg-blue-600 text-white"
                  : "bg-white text-black hover:bg-gray-50",
              ].join(" ")}
            >
              {item.label}
            </button>
          );
        })}
      </div>

      <div className="overflow-hidden rounded-2xl border bg-white">
        <div className="grid grid-cols-12 gap-2 border-b bg-gray-50 px-4 py-3 text-xs font-semibold text-gray-600">
          <div className="col-span-4">User</div>
          <div className="col-span-2">Age / Gender</div>
          <div className="col-span-2">Tier / Status</div>
          <div className="col-span-2">Awaiting / Approved</div>
          <div className="col-span-2">Oldest Pending</div>
        </div>

        {loading ? (
          <div className="p-6 text-sm text-gray-600">Loading…</div>
        ) : rows.length === 0 ? (
          <div className="p-6 text-sm text-gray-600">
            Nothing in this queue right now 🎉
          </div>
        ) : (
          rows.map((row) => {
            const age = calcAge(row.date_of_birth);
            const name = row.display_name ?? row.screen_name ?? "—";
            const gender = row.gender_identity ?? "—";
            const tier = row.tier ?? "—";
            const status = row.status ?? "—";
            const awaiting = getAwaitingCount(row);

            return (
              <button
                key={row.user_id}
                type="button"
                onClick={() => router.push(`/users/${row.user_id}?tab=photos`)}
                className="grid w-full grid-cols-12 gap-2 border-b px-4 py-3 text-left hover:bg-gray-50"
              >
                <div className="col-span-4">
                  <div className="text-sm font-medium text-gray-900">
                    {name}
                  </div>
                  <div className="text-xs text-gray-500">{row.user_id}</div>
                </div>

                <div className="col-span-2 text-sm text-gray-800">
                  {age != null ? age : "—"} / {gender}
                </div>

                <div className="col-span-2 text-sm text-gray-800">
                  {tier} / {status}
                </div>

                <div className="col-span-2 text-sm text-gray-800">
                  <span className="font-semibold">{awaiting}</span> /{" "}
                  {row.approved_count}
                </div>

                <div className="col-span-2 text-sm text-gray-800">
                  {row.oldest_pending_at
                    ? new Date(row.oldest_pending_at).toLocaleString()
                    : "—"}
                </div>
              </button>
            );
          })
        )}
      </div>

      <p className="mt-3 text-xs text-gray-500">
        Clicking a row opens the full User 360 page on the Photos tab so staff
        can review context before making a decision.
      </p>
    </div>
  );
}
