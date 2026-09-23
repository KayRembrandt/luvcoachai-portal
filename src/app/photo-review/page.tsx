"use client";
import React from "react";
import Link from "next/link";
import { PortalIcon } from "@/components/portal/PortalIcon";
import { EmptyState, InitialsBadge, ReviewHeader } from "@/components/portal/ReviewUI";
import styles from "@/components/portal/review.module.css";
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
    <div className={styles.page}>
      <ReviewHeader
        title="Photo Review"
        icon="photo"
        description={<>{queueDescription} • {visibleCountLabel}</>}
        action={
          <button
            type="button"
            onClick={() => void load()}
            disabled={loading}
            className={styles.button}
          >
            <PortalIcon name="refresh" />
            {loading ? "Loading…" : "Refresh"}
          </button>
        }
      />
      <section className={styles.panel} aria-label="Photo review queue">
        {unreadNotificationCount > 0 && (
          <div className={styles.notice} role="status">
            <PortalIcon name="bell" />
            <div>
              <strong>Photo review alert</strong>
              <p>{unreadNotificationCount} uploaded {unreadNotificationCount === 1 ? "photo needs" : "photos need"} staff review
                {notificationSummary?.newestAt ? ` • Latest upload ${new Date(notificationSummary.newestAt).toLocaleString()}` : ""}
              </p>
            </div>
          </div>
        )}
        <div
          className={styles.filters}
          role="group"
          aria-label="Filter photo review queue"
        >
          {[
            {
              key: "pending",
              label: "Pending",
              icon: "clock"
            },
            {
              key: "needs_attention",
              label: "Needs Attention",
              icon: "alert"
            },
            {
              key: "rejected",
              label: "Rejected",
              icon: "close"
            },
            {
              key: "all",
              label: "All",
              icon: "photo"
            },
          ].map((item) => (
            <button
              key={item.key}
              type="button"
              onClick={() => changeFilter(item.key as QueueFilter)}
              aria-pressed={statusFilter === item.key}
              className={styles.filter}
            >
              <PortalIcon name={item.icon as "clock" | "alert" | "close" | "photo"} />
              {item.label}
            </button>
          ))}
        </div>
        {error && <div className={styles.errorBox} role="alert">
          <PortalIcon name="alert" />
          <span>
            {error}
          </span>
        </div>}
        <div className={styles.queueSummary}>
          <h2 id="photo-queue-title">
            {statusFilter === "all"
              ? "All profile photos"
              : statusFilter === "needs_attention"
                ? "Needs attention"
                : statusFilter === "rejected"
                  ? "Rejected photos"
                  : "Pending review"}
          </h2>
          <span className={styles.resultCount} role="status">
            {loading ? "Loading…" : visibleCountLabel}
          </span>
        </div>
        {loading ? (
          <EmptyState title="Loading the photo queue" icon="photo">Please wait while the latest records are retrieved.</EmptyState>
        ) : rows.length === 0 ? (
          <EmptyState
            title={error ? "Queue unavailable" : statusFilter === "all" ? "No profile photos found" : "Nothing in this queue right now"}
            icon={error ? "alert" : "photo"}
          >
            {error ? "Check the message above, then refresh the queue." : "Choose another filter or refresh to check again."}
          </EmptyState>
        ) : (
          <div
            className={styles.tableScroll}
            tabIndex={0}
            role="region"
            aria-label="Photo queue; scroll horizontally on smaller screens"
          >
            <table className={`${styles.table} ${styles.photoTable}`} aria-labelledby="photo-queue-title">
              <thead>
                <tr>
                  <th scope="col">User</th>
                  <th scope="col">Age / Gender</th>
                  <th scope="col">Tier / Status</th>
                  <th scope="col">Awaiting / Approved</th>
                  <th scope="col" aria-sort="descending">
                    <span className={styles.sortLabel}>Most Recent <PortalIcon name="arrowDown" /></span>
                  </th>
                </tr>
              </thead>
              <tbody>
                {rows.map((row) => {
                  const age = calcAge(row.date_of_birth);
                  const name = row.display_name ?? row.screen_name ?? "—";
                  const gender = row.gender_identity ?? "—";
                  const tier = row.tier ?? "—";
                  const status = row.status ?? "—";
                  const awaiting = getAwaitingCount(row);
                  const mostRecentAt = getMostRecentAt(row);
                  const profileHref = `/users/${row.user_id}?tab=photos`;
                  return (
                    <tr
                      key={row.user_id}
                      className={styles.clickableRow}
                      onClick={(event) => {
                        // Native links remain available for keyboard/new-tab use.
                        if ((event.target as HTMLElement).closest("a")) return;
                        router.push(profileHref);
                      }}
                    >
                      <th scope="row">
                        <div className={styles.userCell}>
                          <InitialsBadge name={name} />
                          <div className={styles.userText}>
                            <Link
                              href={profileHref}
                              prefetch={false}
                              className={styles.nameLink}
                              aria-label={`Open photo review for ${name}`}
                            >
                              {name}
                              <PortalIcon name="arrowRight" />
                            </Link>
                            <span className={styles.idText}>
                              {row.user_id}
                            </span>
                          </div>
                        </div>
                      </th>
                      <td>{age != null ? age : "—"} / {gender}</td>
                      <td>{tier} / {status}</td>
                      <td>
                        <span className={styles.countPair}>
                          <span className={styles.countBadge} data-state={awaiting > 0 ? "attention" : "neutral"}>
                            {awaiting}
                          </span>
                          <span>/</span>
                          <span className={styles.countBadge} data-state={row.approved_count > 0 ? "approved" : "neutral"}>
                            {row.approved_count}
                          </span>
                        </span>
                      </td>
                      <td>
                        {mostRecentAt ? <time dateTime={mostRecentAt} className={styles.tableTime}>
                          {new Date(mostRecentAt).toLocaleString()}
                        </time> : "—"}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
        <div className={styles.pagination}>
          <p>
            {rows.length > 0 ? (
              <>
                Showing {firstVisible}–{lastVisible}
                {pagination.total !== null ? ` of ${pagination.total}` : ""}
                {" • newest photos first"}
              </>
            ) : "Newest photos appear first."}
          </p>
          <div className={styles.paginationButtons}>
            <button
              type="button"
              onClick={() => setPage((current) => Math.max(1, current - 1))}
              disabled={!canGoPrevious}
              className={styles.button}
            >Previous</button>
            <span>Page {page}{totalPages !== null ? ` of ${totalPages}` : ""}</span>
            <button
              type="button"
              onClick={() => setPage((current) => current + 1)}
              disabled={!canGoNext}
              className={styles.button}
            >Next</button>
          </div>
        </div>
        <p className={styles.caption}>Open a row to review the member’s photos in User 360. Review their context before making a decision.</p>
      </section>
    </div>
  );
}
