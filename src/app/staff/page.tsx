"use client";
import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { PortalIcon } from "@/components/portal/PortalIcon";
import { errorMessage, staffRequest } from "@/lib/staffAccessClient";
import { initials, isAdminRole, roleLabel, staffIsActive, staffName, type StaffListResponse, type StaffRecord } from "@/lib/staffAccessModel";
import styles from "@/components/staff/staff.module.css";
export default function StaffPage() {
    const [data, setData] = useState<StaffListResponse | null>(null);
    const [loading, setLoading] = useState(true);
    const [busy, setBusy] = useState<string | null>(null);
    const [error, setError] = useState<string | null>(null);
    const [notice, setNotice] = useState<string | null>(null);
    const [query, setQuery] = useState("");
    const [filter, setFilter] = useState<"all" | "active" | "inactive">("all");
    const load = useCallback(async () => {
        setLoading(true);
        setError(null);
        try {
            const next = await staffRequest<StaffListResponse>("/api/staff/list");
            if (!Array.isArray(next.rows))
                throw new Error("The server returned an unexpected staff response.");
            setData(next);
        }
        catch (failure) {
            setError(errorMessage(failure));
            setData(null);
        }
        finally {
            setLoading(false);
        }
    }, []);
    useEffect(() => {
        void load();
    }, [load]);
    async function setStatus(row: StaffRecord) {
        if (busy || loading || !data || isAdminRole(row.role) || row.id === data.meId)
            return;
        const next = !staffIsActive(row);
        if (!window.confirm(`${next ? "Restore" : "Deactivate"} portal access for ${staffName(row)}? This changes the staff account status; it does not delete their login or content.`))
            return;
        setBusy(row.id);
        setError(null);
        setNotice(null);
        try {
            // Both status fields are changed by the administrator-only API, not by a
            // browser table update. The server rechecks the record and its revision.
            const result = await staffRequest<{
                staff: StaffRecord;
            }>("/api/staff/access", {
                editor_version: "staff-access-v2", action: "set_status", id: row.id,
                revision: row.revision, active: next,
            }, "PATCH");
            if (!result.staff?.revision)
                throw new Error("The response was incomplete. Refresh before trying again.");
            setData((previous) => previous ? { ...previous, rows: previous.rows.map((item) => item.id === row.id ? result.staff : item) } : previous);
            setNotice(`${staffName(row)}: portal account ${next ? "restored" : "deactivated"}.`);
        }
        catch (failure) {
            setError(errorMessage(failure));
        }
        finally {
            setBusy(null);
        }
    }
    const activeCount = data?.rows.filter(staffIsActive).length ?? 0;
    const shown = (data?.rows ?? []).filter((row) => {
        const statusMatch = filter === "all" || (filter === "active" ? staffIsActive(row) : !staffIsActive(row));
        return statusMatch && `${staffName(row)} ${row.email ?? ""} ${roleLabel(row.role)}`.toLowerCase().includes(query.trim().toLowerCase());
    });
    return (
        <div
            className={styles.page}
        >
            <header
                className={styles.pageHeader}
            >
                <div
                    className={styles.headingGroup}
                >
                    <span
                        className={styles.headingIcon}
                    >
                        <PortalIcon
                            name="people"
                        />
                    </span>
                    <div>
                        <p
                            className={styles.eyebrow}
                        >
                            Administration
                        </p>
                        <h1>
                            Staff Members
                        </h1>
                        <p>
                            Your team, their roles, and their portal account status.
                        </p>
                    </div>
                </div>
                <div
                    className={styles.actions}
                >
                    <Link
                        href="/admin/staff-access"
                        className={`${styles.button} ${styles.primary}`}
                    >
                        <PortalIcon
                            name="person"
                        />
                        Add / manage staff
                    </Link>
                    <button
                        type="button"
                        className={styles.button}
                        disabled={loading || !!busy}
                        onClick={() => void load()}
                    >
                        <PortalIcon
                            name="refresh"
                        />
                        {loading ? "Loading…" : "Refresh"}
                    </button>
                </div>
            </header>
            {error && <div
                role="alert"
                className={styles.error}
            >
                {error}
            </div>}
            {notice && <div
                role="status"
                className={styles.success}
            >
                {notice}
            </div>}
            <section
                className={styles.panel}
                aria-labelledby="staff-list-title"
            >
                <div
                    className={styles.panelHeading}
                >
                    <div>
                        <h2
                            id="staff-list-title"
                        >
                            Staff directory
                        </h2>
                        <p>
                            {data ? `${data.rows.length} returned · ${activeCount} active · ${data.rows.length - activeCount} inactive` : "Loading the administrator-only directory…"}
                        </p>
                    </div>
                    <label
                        className={styles.searchField}
                    >
                        <span
                            className={styles.srOnly}
                        >
                            Find a staff member
                        </span>
                        <PortalIcon
                            name="search"
                        />
                        <input
                            type="search"
                            value={query}
                            onChange={(event) => setQuery(event.target.value)}
                            placeholder="Find name, email, or role"
                        />
                    </label>
                </div>
                <div
                    className={styles.filterRow}
                >
                    {(["all", "active", "inactive"] as const).map((value) => <button
                        key={value}
                        type="button"
                        className={styles.filter}
                        aria-pressed={filter === value}
                        onClick={() => setFilter(value)}
                    >
                        {value === "all" ? "All staff" : value === "active" ? "Active" : "Inactive"}
                    </button>)}
                </div>
                {data?.staffLimitReached && <p
                    className={styles.hint}
                >
                    Showing the first 1,000 returned records. Totals and filters apply to this list.
                </p>}
                <div
                    className={styles.tableScroll}
                    role="region"
                    aria-label="Staff members"
                    tabIndex={0}
                >
                    <table
                        className={styles.table}
                    >
                        <thead>
                            <tr>
                                <th
                                    scope="col"
                                >
                                    Staff member
                                </th>
                                <th
                                    scope="col"
                                >
                                    Role
                                </th>
                                <th
                                    scope="col"
                                >
                                    Account
                                </th>
                                <th
                                    scope="col"
                                >
                                    Access management
                                </th>
                            </tr>
                        </thead>
                        <tbody>
                            {shown.map((row) => {
            const protectedRow = isAdminRole(row.role) || row.id === data?.meId;
            return <tr
                                key={row.id}
                            >
                                <td>
                                    <div
                                        className={styles.person}
                                    >
                                        <span
                                            className={styles.avatar}
                                            aria-hidden="true"
                                        >
                                            {initials(staffName(row))}
                                        </span>
                                        <div>
                                            <strong>
                                                {staffName(row)}
                                            </strong>
                                            <span>
                                                {row.email || "No email recorded"}
                                            </span>
                                            <small>
                                                ID{" "}
                                                {row.id}
                                            </small>
                                        </div>
                                    </div>
                                </td>
                                <td>
                                    {roleLabel(row.role)}
                                </td>
                                <td>
                                    <span
                                        className={staffIsActive(row) ? styles.goodBadge : styles.neutralBadge}
                                    >
                                        {staffIsActive(row) ? "Active" : "Inactive"}
                                    </span>
                                </td>
                                <td>
                                    <div
                                        className={styles.actions}
                                    >
                                        <Link
                                            className={styles.button}
                                            href={`/admin/staff-access?staff=${encodeURIComponent(row.id)}#staff-editor`}
                                        >
                                            Manage access
                                            <PortalIcon
                                                name="arrowRight"
                                            />
                                        </Link>
                                        {!protectedRow && <button
                                            type="button"
                                            className={styles.button}
                                            disabled={loading || !!busy}
                                            onClick={() => void setStatus(row)}
                                        >
                                            {busy === row.id ? "Updating…" : staffIsActive(row) ? "Deactivate" : "Restore"}
                                        </button>}
                                    </div>
                                    {protectedRow && <small
                                        className={styles.hint}
                                    >
                                        Protected administrator account
                                    </small>}
                                </td>
                            </tr>;
        })}
                            {!shown.length && <tr>
                                <td
                                    colSpan={4}
                                >
                                    {loading ? "Loading staff…" : data ? "No staff match this view." : "Staff could not be loaded. Use Refresh after checking the error above."}
                                </td>
                            </tr>}
                        </tbody>
                    </table>
                </div>
                <p
                    className={styles.privacyNote}
                >
                    <PortalIcon
                        name="lock"
                    />
                    <span>
                        Manage access opens the one shared Staff Access editor. Deactivation preserves saved work settings and coaching material.
                    </span>
                </p>
            </section>
        </div>
    );
}

