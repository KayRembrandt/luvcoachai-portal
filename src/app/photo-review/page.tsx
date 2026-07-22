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
  oldest_pending_at: string | null;
  newest_pending_at: string | null;

  // The API should return this for every user, including approved-only users.
  // The fallbacks below keep the page compatible with the older response.
  latest_photo_at?: string | null;
  latest_activity_at?: string | null;
};

type NotificationSummary = {
  unreadCount: number;
  newestAt: string | null;
};

type QueueFilter = "pending" | "needs_attention" | "rejected" | "all";

type PaginationState = {
  total: number | null;
  hasNext: boolean;
};

type LoadOptions = {
  silent?: boolean;
};

const PAGE_SIZE = 25;

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

function asFiniteNumber(...values: unknown[]) {
  for (const value of values) {
    if (typeof value === "number" && Number.isFinite(value)) return value;

    if (typeof value === "string" && value.trim()) {
      const parsed = Number(value);
      if (Number.isFinite(parsed)) return parsed;
    }
  }

  return null;
}

function asBoolean(...values: unknown[]) {
  for (const value of values) {
    if (typeof value === "boolean") return value;
    if (value === "true") return true;
    if (value === "false") return false;
  }

  return null;
}

function getMostRecentAt(row: PendingUserRow) {
  return (
    row.latest_photo_at ??
    row.latest_activity_at ??
    row.newest_pending_at ??
    row.oldest_pending_at ??
    null
  );
}

function getTimestamp(value: string | null | undefined) {
  if (!value) return 0;
  const parsed = new Date(value).getTime();
  return Number.isNaN(parsed) ? 0 : parsed;
}

function sortNewestFirst(rows: PendingUserRow[]) {
  return [...rows].sort((a, b) => {
    const dateDifference =
      getTimestamp(getMostRecentAt(b)) - getTimestamp(getMostRecentAt(a));

    if (dateDifference !== 0) return dateDifference;

    const aName = a.display_name ?? a.screen_name ?? a.user_id;
    const bName = b.display_name ?? b.screen_name ?? b.user_id;
    return aName.localeCompare(bName);
  });
}

function errorMessage(error: unknown, fallback: string) {
  if (error instanceof Error && error.message) return error.message;
  return fallback;
}

export default function PhotoReviewPage() {
  const router = useRouter();

  const [rows, setRows] = React.useState<PendingUserRow[]>([]);
  const [error, setError] = React.useState<string | null>(null);
  const [loading, setLoading] = React.useState(true);
  const [statusFilter, setStatusFilter] =
    React.useState<QueueFilter>("pending");
  const [page, setPage] = React.useState(1);
  const [pagination, setPagination] = React.useState<PaginationState>({
    total: null,
    hasNext: false,
  });
  const [notificationSummary, setNotificationSummary] =
    React.useState<NotificationSummary | null>(null);

  const activeRequestRef = React.useRef<AbortController | null>(null);

  const load = React.useCallback(
    async (options: LoadOptions = {}) => {
      const silent = options.silent === true;
      const controller = new AbortController();

      activeRequestRef.current?.abort();
      activeRequestRef.current = controller;

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
          setPagination({ total: null, hasNext: false });
          return;
        }

        const token = session?.access_token ?? null;

        if (!token) {
          console.error("PhotoReviewPage: no access token found.");
          setError("Not logged in.");
          setRows([]);
          setPagination({ total: null, hasNext: false });
          return;
        }

        const offset = (page - 1) * PAGE_SIZE;
        const params = new URLSearchParams({
          status: statusFilter,
          page: String(page),
          pageSize: String(PAGE_SIZE),
          limit: String(PAGE_SIZE),
          offset: String(offset),
          sort: "latest_photo_at",
          order: "desc",
        });

        // "All" should mean every user with a non-archived profile photo,
        // including users whose photos are all approved.
        if (statusFilter === "all") {
          params.set("includeApprovedOnly", "true");
        }

        const res = await fetch(`/api/photos/pending-users?${params}`, {
          method: "GET",
          headers: {
            Authorization: `Bearer ${token}`,
          },
          cache: "no-store",
          signal: controller.signal,
        });

        const json = await res.json().catch(() => ({}));
        const rawRows = Array.isArray(json?.rows)
          ? json.rows
          : Array.isArray(json?.users)
            ? json.users
            : [];
        const nextRows = sortNewestFirst(rawRows as PendingUserRow[]);
        const responsePagination = json?.pagination ?? {};
        const total = asFiniteNumber(
          responsePagination?.total,
          responsePagination?.totalCount,
          json?.total,
          json?.totalCount,
        );
        const explicitHasNext = asBoolean(
          responsePagination?.hasNext,
          responsePagination?.hasMore,
          json?.hasNext,
          json?.hasMore,
        );
        const hasNext =
          explicitHasNext ??
          (total !== null
            ? offset + nextRows.length < total
            : nextRows.length === PAGE_SIZE);

        console.log("PhotoReviewPage pending-users response:", res.status, {
          ...json,
          rows: `[${nextRows.length} rows]`,
        });

        if (!res.ok) {
          setError(json?.error ?? `Failed to load (${res.status})`);
          setRows(nextRows);
          setPagination({ total, hasNext });
          return;
        }

        // This fallback sort fixes an older API response that arrived oldest-first.
        // The API must also sort before applying OFFSET/LIMIT so pagination is
        // globally newest-first, not merely newest-first inside each page.
        setRows(nextRows);
        setPagination({ total, hasNext });
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
          // Do not break the queue if this table or its RLS policy is not deployed.
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
      } catch (loadError: unknown) {
        if (
          loadError instanceof DOMException &&
          loadError.name === "AbortError"
        ) {
          return;
        }

        if (
          errorMessage(loadError, "")
            .toLowerCase()
            .includes("aborted")
        ) {
          return;
        }

        console.error("PhotoReviewPage load failed:", loadError);
        setError(
          errorMessage(
            loadError,
            "Something went wrong while loading the photo queue.",
          ),
        );
      } finally {
        if (activeRequestRef.current === controller) {
          activeRequestRef.current = null;
          if (!silent) setLoading(false);
        }
      }
    },
    [page, statusFilter],
  );

  React.useEffect(() => {
    void load();

    // Staff can leave the queue open and still see fresh uploads.
    const intervalId = window.setInterval(() => {
      void load({ silent: true });
    }, 30_000);

    return () => {
      window.clearInterval(intervalId);
      activeRequestRef.current?.abort();
    };
  }, [load]);

  function changeFilter(nextFilter: QueueFilter) {
    if (nextFilter === statusFilter) return;
    setPage(1);
    setStatusFilter(nextFilter);
  }

  function getAwaitingCount(row: PendingUserRow) {
    if (statusFilter === "needs_attention") return row.needs_attention_count;
    if (statusFilter === "rejected") return row.rejected_count;
    if (statusFilter === "pending") return row.pending_count;
    return row.pending_count + row.needs_attention_count + row.rejected_count;
  }

  const unreadNotificationCount = notificationSummary?.unreadCount ?? 0;
  const totalPages =
    pagination.total !== null
      ? Math.max(1, Math.ceil(pagination.total / PAGE_SIZE))
      : null;
  const canGoPrevious = page > 1 && !loading;
  const canGoNext =
    !loading &&
    (totalPages !== null ? page < totalPages : pagination.hasNext);
  const firstVisible = rows.length > 0 ? (page - 1) * PAGE_SIZE + 1 : 0;
  const lastVisible = rows.length > 0 ? firstVisible + rows.length - 1 : 0;
  const visibleCountLabel =
    pagination.total !== null
      ? `${pagination.total} ${pagination.total === 1 ? "user" : "users"}`
      : `${rows.length} ${rows.length === 1 ? "user" : "users"} on this page`;
  const queueDescription =
    statusFilter === "all"
      ? "All users with profile photos"
      : "Queue of users with photos awaiting review";

  return (
    <div className="p-6">
      <div className="flex items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold text-[#0F1B33]">
            Photo Review
          </h1>
          <p className="mt-1 text-sm text-gray-600">
            {queueDescription} • {visibleCountLabel}
          </p>
        </div>

        <button
          type="button"
          onClick={() => void load()}
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
              onClick={() => changeFilter(item.key as QueueFilter)}
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
          <div className="col-span-2">Most Recent ↓</div>
        </div>

        {loading ? (
          <div className="p-6 text-sm text-gray-600">Loading…</div>
        ) : rows.length === 0 ? (
          <div className="p-6 text-sm text-gray-600">
            {statusFilter === "all"
              ? "No users with profile photos were found."
              : "Nothing in this queue right now 🎉"}
          </div>
        ) : (
          rows.map((row) => {
            const age = calcAge(row.date_of_birth);
            const name = row.display_name ?? row.screen_name ?? "—";
            const gender = row.gender_identity ?? "—";
            const tier = row.tier ?? "—";
            const status = row.status ?? "—";
            const awaiting = getAwaitingCount(row);
            const mostRecentAt = getMostRecentAt(row);

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
                  {mostRecentAt
                    ? new Date(mostRecentAt).toLocaleString()
                    : "—"}
                </div>
              </button>
            );
          })
        )}
      </div>

      <div className="mt-3 flex flex-wrap items-center justify-between gap-3">
        <p className="text-xs text-gray-500">
          {rows.length > 0 ? (
            <>
              Showing {firstVisible}–{lastVisible}
              {pagination.total !== null ? ` of ${pagination.total}` : ""} •
              newest photos first
            </>
          ) : (
            "Newest photos appear first."
          )}
        </p>

        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => setPage((current) => Math.max(1, current - 1))}
            disabled={!canGoPrevious}
            className="rounded-xl border px-3 py-2 text-sm hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-50"
          >
            Previous
          </button>

          <span className="min-w-24 text-center text-sm text-gray-600">
            Page {page}
            {totalPages !== null ? ` of ${totalPages}` : ""}
          </span>

          <button
            type="button"
            onClick={() => setPage((current) => current + 1)}
            disabled={!canGoNext}
            className="rounded-xl border px-3 py-2 text-sm hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-50"
          >
            Next
          </button>
        </div>
      </div>

      <p className="mt-3 text-xs text-gray-500">
        Clicking a row opens the full User 360 page on the Photos tab so staff
        can review context before making a decision.
      </p>
    </div>
  );
}
