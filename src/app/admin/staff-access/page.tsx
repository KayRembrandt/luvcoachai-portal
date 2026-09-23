"use client";
import Link from "next/link";
import { useCallback, useEffect, useRef, useState, type FormEvent } from "react";
import { PortalIcon } from "@/components/portal/PortalIcon";
import { staffRequest, errorMessage } from "@/lib/staffAccessClient";
import { assignableRoles, editableWork, initials, isAdminRole, permissionChanges, roleLabel, savedWorkLabels, staffIsActive, staffName, workOptions, type StaffAccessResponse, type StaffApplication, type StaffRecord, type WorkKey, } from "@/lib/staffAccessModel";
import styles from "@/components/staff/staff.module.css";
type Editor = {
    id: string;
    email: string;
    first_name: string;
    last_name: string;
    role: string;
    status: "keep" | "active" | "inactive";
    work: Record<WorkKey, boolean>;
};
function newEditor(): Editor {
    return {
        id: "", email: "", first_name: "", last_name: "", role: "staff", status: "active",
        work: editableWork({ user_search: true }),
    };
}
function editRecord(row: StaffRecord): Editor {
    return {
        id: row.id, email: row.email ?? "", first_name: row.first_name ?? "", last_name: row.last_name ?? "",
        role: "__keep__", status: "keep", work: editableWork(row.permissions),
    };
}
export default function StaffAccessPage() {
    const [overview, setOverview] = useState<StaffAccessResponse | null>(null);
    const [form, setForm] = useState<Editor>(newEditor);
    const [baseline, setBaseline] = useState<StaffRecord | null>(null);
    const [loading, setLoading] = useState(true);
    const [busy, setBusy] = useState<string | null>(null);
    const [error, setError] = useState<string | null>(null);
    const [notice, setNotice] = useState<string | null>(null);
    const [filter, setFilter] = useState("");
    const [view, setView] = useState<"all" | "active" | "inactive">("all");
    const editorHeading = useRef<HTMLHeadingElement>(null);
    const [approvalRoles, setApprovalRoles] = useState<Record<string, string>>({});
    const cleanForm = baseline ? editRecord(baseline) : newEditor();
    const dirty = JSON.stringify(form) !== JSON.stringify(cleanForm);
    const disabled = loading || busy !== null || overview === null;
    const effectiveRole = form.role === "__keep__" ? baseline?.role ?? "" : form.role;
    const protectedAccount = !!baseline && (isAdminRole(baseline.role) || baseline.id === overview?.meId);
    const activeRows = overview?.staff.filter(staffIsActive) ?? [];
    const inactiveRows = overview?.staff.filter((row) => !staffIsActive(row)) ?? [];
    const visibleRows = (overview?.staff ?? []).filter((row) => {
        const matchesStatus = view === "all" || (view === "active" ? staffIsActive(row) : !staffIsActive(row));
        return matchesStatus && `${staffName(row)} ${row.email ?? ""} ${roleLabel(row.role)}`.toLowerCase().includes(filter.trim().toLowerCase());
    });
    const load = useCallback(async (): Promise<StaffAccessResponse | null> => {
        setLoading(true);
        setError(null);
        try {
            const data = await staffRequest<StaffAccessResponse>("/api/staff/access");
            if (!Array.isArray(data.staff) || !Array.isArray(data.applications))
                throw new Error("The server returned an unexpected staff response.");
            setOverview(data);
            return data;
        }
        catch (failure) {
            setError(errorMessage(failure));
            setOverview(null);
            return null;
        }
        finally {
            setLoading(false);
        }
    }, []);
    useEffect(() => {
        let active = true;
        void load().then((data) => {
            if (!active || !data)
                return;
            const target = new URLSearchParams(window.location.search).get("staff");
            const row = target ? data.staff.find((item) => item.id === target) : null;
            if (row) {
                setBaseline(row);
                setForm(editRecord(row));
            }
            else if (target)
                setError("That staff member was not in the returned list. Use the staff search below.");
        });
        return () => {
            active = false;
        };
    }, [load]);
    useEffect(() => {
        if (!dirty)
            return;
        const warn = (event: BeforeUnloadEvent) => {
            event.preventDefault();
            event.returnValue = "";
        };
        window.addEventListener("beforeunload", warn);
        return () => window.removeEventListener("beforeunload", warn);
    }, [dirty]);
    function mayDiscard() {
        return !dirty || window.confirm("Discard the unsaved staff details and work settings?");
    }
    function chooseStaff(row: StaffRecord | null) {
        if (disabled || !mayDiscard())
            return;
        setError(null);
        setNotice(null);
        setBaseline(row);
        setForm(row ? editRecord(row) : newEditor());
        requestAnimationFrame(() => {
            editorHeading.current?.focus();
            editorHeading.current?.scrollIntoView({ block: "start", behavior: "auto" });
        });
    }
    async function refresh() {
        if (busy || !mayDiscard())
            return;
        const selectedId = baseline?.id;
        const data = await load();
        if (!data)
            return;
        const row = data.staff.find((item) => item.id === selectedId) ?? null;
        setBaseline(row);
        setForm(row ? editRecord(row) : newEditor());
    }
    async function saveStaff(event: FormEvent<HTMLFormElement>) {
        event.preventDefault();
        if (disabled)
            return;
        if (!baseline && !window.confirm(`Add ${form.email.trim()} as ${roleLabel(form.role)}? If a login is missing, this will send a login invitation.`))
            return;
        if (baseline && form.status === "inactive" && !window.confirm(`Deactivate portal access for ${staffName(baseline)}? This does not delete their account or content.`))
            return;
        if (baseline && !isAdminRole(baseline.role) && isAdminRole(effectiveRole) && !window.confirm(`Give ${staffName(baseline)} administrator access, including staff management?`))
            return;
        setBusy("save");
        setError(null);
        setNotice(null);
        try {
            const result = await staffRequest<{
                staff: StaffRecord;
                invitationSent?: boolean;
            }>("/api/staff/access", {
                editor_version: "staff-access-v2",
                id: form.id,
                revision: baseline?.revision,
                email: form.email,
                first_name: form.first_name,
                last_name: form.last_name,
                role: form.role,
                status: form.status,
                permission_changes: baseline ? permissionChanges(baseline.permissions, form.work) : form.work,
                confirm_invitation: !baseline,
            });
            if (!result.staff?.revision)
                throw new Error("The save response was incomplete. Refresh before trying again.");
            setBaseline(result.staff);
            setForm(editRecord(result.staff));
            setOverview((old) => old ? {
                ...old,
                staff: old.staff.some((row) => row.id === result.staff.id)
                    ? old.staff.map((row) => row.id === result.staff.id ? result.staff : row)
                    : [result.staff, ...old.staff],
            } : old);
            setNotice(result.invitationSent ? "Staff saved and a login invitation was sent. Coaching authoring can now be set below." : "Staff details and work settings saved. Coaching authoring is managed separately below.");
        }
        catch (failure) {
            setError(errorMessage(failure));
        }
        finally {
            setBusy(null);
        }
    }
    async function changeAuthorAccess() {
        if (!baseline || disabled || dirty || isAdminRole(baseline.role))
            return;
        const next = baseline.permissions?.coaching_author !== true;
        if (!window.confirm(`${next ? "Enable" : "Disable"} coaching authoring for ${staffName(baseline)}? This changes their module and workbook editing access immediately.`))
            return;
        setBusy("author");
        setError(null);
        setNotice(null);
        try {
            // Reuse the protected coaching command and its expected_author check.
            // Staff details never write or normalize coaching_author/coaching_review.
            await staffRequest("/api/coaching", {
                action: "set_author", id: baseline.id,
                author: next, expected_author: baseline.permissions?.coaching_author === true,
            });
            const refreshed = await staffRequest<StaffAccessResponse>("/api/staff/access");
            const row = refreshed.staff.find((item) => item.id === baseline.id);
            if (!row)
                throw new Error("The authoring change completed, but the staff record could not be refreshed. Refresh before making another change.");
            setOverview(refreshed);
            setBaseline(row);
            setForm(editRecord(row));
            setNotice(`Coaching authoring ${next ? "enabled" : "disabled"}. No Journal access was added.`);
        }
        catch (failure) {
            setError(errorMessage(failure));
        }
        finally {
            setBusy(null);
        }
    }
    async function decideApplication(app: StaffApplication, action: "approve" | "reject") {
        if (disabled || dirty)
            return;
        const chosenRole = approvalRoles[app.id] ?? "staff";
        const message = action === "approve"
            ? `Approve ${app.email} as ${roleLabel(chosenRole)}? This uses the existing application approval process and may send a login invitation.`
            : `Reject the application from ${app.email}?`;
        if (!window.confirm(message))
            return;
        setBusy(app.id);
        setError(null);
        setNotice(null);
        try {
            // Keep the existing application decision endpoint and payload contract.
            await staffRequest("/api/staff/applications/decision", {
                application_id: app.id, action, ...(action === "approve" ? { role: chosenRole } : {}),
            });
            const data = await load();
            if (data)
                setNotice(action === "approve" ? "Application approved. Find the person in the staff list to review their work settings and coaching access." : "Application rejected.");
        }
        catch (failure) {
            setError(errorMessage(failure));
        }
        finally {
            setBusy(null);
        }
    }
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
                            name="lock"
                        />
                    </span>
                    <div>
                        <p
                            className={styles.eyebrow}
                        >
                            Administration
                        </p>
                        <h1>
                            Staff Access
                        </h1>
                        <p>
                            Give each person a clear place to work.
                        </p>
                    </div>
                </div>
                <div
                    className={styles.actions}
                >
                    <Link
                        href="/staff"
                        className={styles.button}
                    >
                        <PortalIcon
                            name="people"
                        />
                        Staff List
                    </Link>
                    <button
                        type="button"
                        className={styles.button}
                        disabled={loading || !!busy}
                        onClick={() => void refresh()}
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
                <PortalIcon
                    name="info"
                />
                <span>
                    {error}
                </span>
            </div>}
            {notice && <div
                role="status"
                className={styles.success}
            >
                <PortalIcon
                    name="check"
                />
                <span>
                    {notice}
                </span>
            </div>}
            <div
                className={styles.summaryGrid}
                aria-label="Returned staff totals"
            >
                <Summary
                    label="Active staff"
                    value={overview ? activeRows.length : "—"}
                    icon="people"
                />
                <Summary
                    label="Inactive staff"
                    value={overview ? inactiveRows.length : "—"}
                    icon="lock"
                />
                <Summary
                    label="Pending applications"
                    value={overview && !overview.applicationWarning ? overview.applications.length : "—"}
                    icon="clipboard"
                />
            </div>
            <section
                id="staff-editor"
                className={styles.panel}
                aria-labelledby="staff-editor-title"
                aria-busy={busy === "save"}
            >
                <div
                    className={styles.panelHeading}
                >
                    <div>
                        <h2
                            id="staff-editor-title"
                            ref={editorHeading}
                            tabIndex={-1}
                        >
                            <PortalIcon
                                name="person"
                            />
                            {baseline ? `Manage ${staffName(baseline)}` : "Add a staff member"}
                        </h2>
                        <p>
                            {baseline ? "Review their details and choose the work settings to change." : "Add an existing login or send an invitation when a login is needed."}
                        </p>
                    </div>
                    <button
                        type="button"
                        className={styles.button}
                        onClick={() => chooseStaff(null)}
                        disabled={disabled}
                    >
                        New staff / clear
                    </button>
                </div>
                <form
                    onSubmit={saveStaff}
                >
                    <fieldset
                        className={styles.formFields}
                        disabled={disabled}
                    >
                        <legend
                            className={styles.srOnly}
                        >
                            Staff details
                        </legend>
                        <div
                            className={styles.fieldGrid}
                        >
                            <label
                                className={styles.field}
                            >
                                <span>
                                    Email
                                </span>
                                <input
                                    type="email"
                                    value={form.email}
                                    required={!baseline}
                                    readOnly={!!baseline}
                                    autoComplete="off"
                                    onChange={(event) => setForm({ ...form, email: event.target.value })}
                                    placeholder="name@example.com"
                                />
                                <small>
                                    {baseline ? "Existing login identity is kept unchanged." : "An invitation can be sent when you save."}
                                </small>
                            </label>
                            <label
                                className={styles.field}
                            >
                                <span>
                                    Primary role
                                </span>
                                <select
                                    value={form.role}
                                    disabled={protectedAccount}
                                    onChange={(event) => setForm({ ...form, role: event.target.value })}
                                >
                                    {baseline && <option
                                        value="__keep__"
                                    >
                                        Keep current ·{" "}
                                        {roleLabel(baseline.role)}
                                    </option>}
                                    {assignableRoles.map((role) => <option
                                        key={role.value}
                                        value={role.value}
                                    >
                                        {role.label}
                                    </option>)}
                                </select>
                                <small>
                                    Changing the role does not select extra work flags automatically.
                                </small>
                            </label>
                            <label
                                className={styles.field}
                            >
                                <span>
                                    First name
                                </span>
                                <input
                                    value={form.first_name}
                                    maxLength={150}
                                    onChange={(event) => setForm({ ...form, first_name: event.target.value })}
                                    autoComplete="off"
                                />
                            </label>
                            <label
                                className={styles.field}
                            >
                                <span>
                                    Last name
                                </span>
                                <input
                                    value={form.last_name}
                                    maxLength={150}
                                    onChange={(event) => setForm({ ...form, last_name: event.target.value })}
                                    autoComplete="off"
                                />
                            </label>
                            <label
                                className={styles.field}
                            >
                                <span>
                                    Portal account status
                                </span>
                                <select
                                    value={form.status}
                                    disabled={protectedAccount}
                                    onChange={(event) => setForm({ ...form, status: event.target.value as Editor["status"] })}
                                >
                                    {baseline && <option
                                        value="keep"
                                    >
                                        Keep current ·{" "}
                                        {staffIsActive(baseline) ? "Active" : "Inactive"}
                                    </option>}
                                    <option
                                        value="active"
                                    >
                                        Active
                                    </option>
                                    <option
                                        value="inactive"
                                    >
                                        Inactive
                                    </option>
                                </select>
                                <small>
                                    Inactive preserves the record; it does not delete the login or content.
                                </small>
                            </label>
                            <div
                                className={styles.field}
                            >
                                <span>
                                    Login connection
                                </span>
                                <p
                                    className={styles.inlineInfo}
                                >
                                    <PortalIcon
                                        name="lock"
                                    />
                                    {baseline ? baseline.auth_user_id ? "Linked to a login" : "No auth_user_id link recorded" : "Checked when staff is added"}
                                </p>
                            </div>
                        </div>
                    </fieldset>
                    {protectedAccount && <p
                        className={styles.hint}
                    >
                        Your own account and existing administrators cannot be deactivated or have their role changed here.
                    </p>}
                    <div
                        className={styles.workHeader}
                    >
                        <h3>
                            Saved work settings
                        </h3>
                        <p>
                            Choose the work flags to save for this person.
                        </p>
                    </div>
                    <p
                        className={styles.caution}
                    >
                        <PortalIcon
                            name="shield"
                        />
                        <span>
                            These settings are not a new portal-wide security boundary. Older pages still use their current access rules; changing a checkbox does not by itself prove that a direct page or data request is blocked.
                        </span>
                    </p>
                    <div
                        className={styles.permissionGroups}
                    >
                        <fieldset
                            className={styles.permissionGroup}
                            disabled={disabled || isAdminRole(effectiveRole)}
                        >
                            <legend>
                                Member support
                            </legend>
                            {workOptions.filter((option) => option.group === "support").map((option) => (<label
                                key={option.key}
                                className={styles.permissionCard}
                                data-checked={form.work[option.key]}
                            >
                                <input
                                    type="checkbox"
                                    checked={form.work[option.key]}
                                    onChange={(event) => setForm({ ...form, work: { ...form.work, [option.key]: event.target.checked } })}
                                />
                                <PortalIcon
                                    name={option.icon}
                                />
                                <span>
                                    <strong>
                                        {option.label}
                                    </strong>
                                    <small>
                                        {option.description}
                                    </small>
                                </span>
                            </label>))}
                        </fieldset>
                        <fieldset
                            className={styles.permissionGroup}
                            disabled={disabled || isAdminRole(effectiveRole)}
                        >
                            <legend>
                                Teaching material
                            </legend>
                            {workOptions.filter((option) => option.group === "content").map((option) => (<label
                                key={option.key}
                                className={styles.permissionCard}
                                data-checked={form.work[option.key]}
                            >
                                <input
                                    type="checkbox"
                                    checked={form.work[option.key]}
                                    onChange={(event) => setForm({ ...form, work: { ...form.work, [option.key]: event.target.checked } })}
                                />
                                <PortalIcon
                                    name={option.icon}
                                />
                                <span>
                                    <strong>
                                        {option.label}
                                    </strong>
                                    <small>
                                        {option.description}
                                    </small>
                                </span>
                            </label>))}
                            <div
                                className={styles.informationCard}
                            >
                                <PortalIcon
                                    name="calendar"
                                />
                                <div>
                                    <strong>
                                        Session Talks
                                    </strong>
                                    <span
                                        className={styles.neutralBadge}
                                    >
                                        Existing staff rules
                                    </span>
                                    <p>
                                        This tool still uses its existing staff-access rules. A separate per-person permission needs to be connected.
                                    </p>
                                    <Link
                                        href="/session-talks"
                                    >
                                        Open Session Talks
                                        <span
                                            aria-hidden="true"
                                        >
                                            →
                                        </span>
                                    </Link>
                                </div>
                            </div>
                            <div
                                className={styles.informationCard}
                            >
                                <PortalIcon
                                    name="clipboard"
                                />
                                <div>
                                    <strong>
                                        Hidden and future tools
                                    </strong>
                                    <p>
                                        Onboarding, Jobs, and System are not offered here. Their existing settings, coaching review, and any other stored keys are preserved.
                                    </p>
                                </div>
                            </div>
                        </fieldset>
                    </div>
                    {isAdminRole(effectiveRole) && <p
                        className={styles.hint}
                    >
                        Administrator access is role-based in the existing protected admin tools. The saved flags above are not an administrator restriction.
                    </p>}
                    <div
                        className={styles.saveBar}
                    >
                        <span
                            className={styles.hint}
                        >
                            {dirty ? "Unsaved details or work settings" : baseline ? "No unsaved details" : "Coaching authoring is set after creating the staff record."}
                        </span>
                        <button
                            type="submit"
                            className={`${styles.button} ${styles.primary}`}
                            disabled={disabled || (!!baseline && !dirty)}
                        >
                            <PortalIcon
                                name="check"
                            />
                            {busy === "save" ? "Saving…" : baseline ? "Save staff details" : "Add staff"}
                        </button>
                    </div>
                </form>
            </section>
            <section
                className={`${styles.panel} ${styles.coachingPanel}`}
                aria-labelledby="author-title"
            >
                <div
                    className={styles.panelHeading}
                >
                    <div>
                        <h2
                            id="author-title"
                        >
                            <PortalIcon
                                name="book"
                            />
                            Coaching authoring
                        </h2>
                        <p>
                            Module and workbook editing. Uses the existing coaching permission and save command.
                        </p>
                    </div>
                    <span
                        className={styles.neutralBadge}
                    >
                        Saved separately
                    </span>
                </div>
                {!baseline ? <p>
                    Select or save a staff member first. Then enable their authoring access here.
                </p> : (<>
                    <div
                        className={styles.coachingRow}
                    >
                        <div>
                            <strong>
                                {staffName(baseline)}
                            </strong>
                            <p>
                                {isAdminRole(baseline.role) ? "Included through the administrator role." : baseline.permissions?.coaching_author === true ? "Author permission is enabled." : "Author permission is not enabled."}
                            </p>
                        </div>
                        <span
                            className={isAdminRole(baseline.role) || baseline.permissions?.coaching_author === true ? styles.goodBadge : styles.neutralBadge}
                        >
                            {isAdminRole(baseline.role) ? "Administrator" : baseline.permissions?.coaching_author === true ? "Enabled" : "Not enabled"}
                        </span>
                        {!isAdminRole(baseline.role) && <button
                            type="button"
                            className={`${styles.button} ${baseline.permissions?.coaching_author === true ? "" : styles.primary}`}
                            disabled={disabled || dirty || (!staffIsActive(baseline) && baseline.permissions?.coaching_author !== true)}
                            onClick={() => void changeAuthorAccess()}
                        >
                            {busy === "author" ? "Updating…" : baseline.permissions?.coaching_author === true ? "Disable authoring" : "Enable authoring"}
                        </button>}
                    </div>
                    {dirty && <p
                        className={styles.hint}
                    >
                        Save or discard staff-detail changes before changing authoring access.
                    </p>}
                    {!staffIsActive(baseline) && <p
                        className={styles.hint}
                    >
                        The staff account is inactive. It cannot use coaching authoring until portal access is restored.
                    </p>}
                </>)}
                <p
                    className={styles.privacyNote}
                >
                    <PortalIcon
                        name="lock"
                    />
                    <span>
                        This authoring setting does not grant access to private Journals. Workbook-progress review is a separate, unfinished workflow.
                    </span>
                </p>
            </section>
            <section
                className={styles.panel}
                aria-labelledby="directory-title"
            >
                <div
                    className={styles.panelHeading}
                >
                    <div>
                        <h2
                            id="directory-title"
                        >
                            <PortalIcon
                                name="people"
                            />
                            Your staff
                        </h2>
                        <p>
                            Choose Manage access to load a person into the editor.
                        </p>
                    </div>
                    <label
                        className={styles.searchField}
                    >
                        <span
                            className={styles.srOnly}
                        >
                            Find staff
                        </span>
                        <PortalIcon
                            name="search"
                        />
                        <input
                            type="search"
                            value={filter}
                            onChange={(event) => setFilter(event.target.value)}
                            placeholder="Find name, email, or role"
                        />
                    </label>
                </div>
                <div
                    className={styles.filterRow}
                    aria-label="Staff status filter"
                >
                    {(["all", "active", "inactive"] as const).map((status) => <button
                        key={status}
                        type="button"
                        className={styles.filter}
                        aria-pressed={view === status}
                        onClick={() => setView(status)}
                    >
                        {status === "all" ? "All staff" : status === "active" ? "Active" : "Inactive"}
                    </button>)}
                </div>
                {overview?.staffLimitReached && <p
                    className={styles.hint}
                >
                    Showing the first 1,000 returned records; totals and filtering apply to this list.
                </p>}
                <div
                    className={styles.tableScroll}
                    role="region"
                    aria-label="Staff directory"
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
                                    Person
                                </th>
                                <th
                                    scope="col"
                                >
                                    Role / account
                                </th>
                                <th
                                    scope="col"
                                >
                                    Saved settings
                                </th>
                                <th
                                    scope="col"
                                >
                                    Action
                                </th>
                            </tr>
                        </thead>
                        <tbody>
                            {visibleRows.map((row) => <tr
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
                                        </div>
                                    </div>
                                </td>
                                <td>
                                    <strong>
                                        {roleLabel(row.role)}
                                    </strong>
                                    <div
                                        className={styles.chips}
                                    >
                                        <span
                                            className={staffIsActive(row) ? styles.goodBadge : styles.neutralBadge}
                                        >
                                            {staffIsActive(row) ? "Active" : "Inactive"}
                                        </span>
                                    </div>
                                </td>
                                <td>
                                    <div
                                        className={styles.chips}
                                    >
                                        {savedWorkLabels(row.permissions).map((label) => <span
                                            className={styles.badge}
                                            key={label}
                                        >
                                            {label}
                                        </span>)}
                                        {savedWorkLabels(row.permissions).length === 0 && <span>
                                            No listed flags
                                        </span>}
                                    </div>
                                </td>
                                <td>
                                    <button
                                        type="button"
                                        className={styles.button}
                                        disabled={disabled}
                                        onClick={() => chooseStaff(row)}
                                    >
                                        Manage access
                                    </button>
                                </td>
                            </tr>)}
                            {!visibleRows.length && <tr>
                                <td
                                    colSpan={4}
                                >
                                    {loading ? "Loading staff…" : overview ? "No staff match this view." : "Staff are unavailable until the request succeeds."}
                                </td>
                            </tr>}
                        </tbody>
                    </table>
                </div>
            </section>
            <section
                className={styles.panel}
                aria-labelledby="applications-title"
            >
                <div
                    className={styles.panelHeading}
                >
                    <div>
                        <h2
                            id="applications-title"
                        >
                            <PortalIcon
                                name="clipboard"
                            />
                            Pending applications
                        </h2>
                        <p>
                            Review the application before choosing a role. Requested roles are not granted automatically.
                        </p>
                    </div>
                    <span
                        className={styles.neutralBadge}
                    >
                        {overview?.applicationWarning ? "Unavailable" : overview ? overview.applications.length : "—"}
                    </span>
                </div>
                {overview?.applicationWarning && <p
                    className={styles.caution}
                >
                    {overview.applicationWarning}
                </p>}
                {overview?.applicationLimitReached && <p
                    className={styles.hint}
                >
                    Showing the first 200 pending applications.
                </p>}
                {dirty && <p
                    className={styles.hint}
                >
                    Finish the unsaved staff edit before approving or rejecting an application.
                </p>}
                {!loading && overview && !overview.applicationWarning && !overview.applications.length && <div
                    className={styles.empty}
                >
                    <PortalIcon
                        name="check"
                    />
                    <div>
                        <strong>
                            No pending applications
                        </strong>
                        <p>
                            New applications will appear here when they are returned by the server.
                        </p>
                    </div>
                </div>}
                {overview?.applications.map((app) => <article
                    className={styles.application}
                    key={app.id}
                >
                    <div
                        className={styles.panelHeading}
                    >
                        <div>
                            <h3>
                                {[app.first_name, app.last_name].filter(Boolean).join(" ") || "Applicant"}
                            </h3>
                            <p>
                                {app.email}
                            </p>
                            <p>
                                Requested role:{" "}
                                {app.request_role || "Not specified"}
                            </p>
                        </div>
                        <span
                            className={styles.neutralBadge}
                        >
                            {app.status || "Pending"}
                        </span>
                    </div>
                    <details>
                        <summary>
                            Read application details
                        </summary>
                        <div
                            className={styles.applicationDetails}
                        >
                            <ApplicationDetail
                                label="Why joining"
                                value={app.why_joining}
                            />
                            <ApplicationDetail
                                label="Experience"
                                value={app.experience}
                            />
                            <ApplicationDetail
                                label="Values alignment"
                                value={app.values_alignment}
                            />
                        </div>
                        <p
                            className={styles.hint}
                        >
                            Submitted:{" "}
                            {app.created_at ? new Date(app.created_at).toLocaleString() : "Not recorded"}
                        </p>
                    </details>
                    <div
                        className={styles.applicationActions}
                    >
                        <label
                            className={styles.field}
                        >
                            <span>
                                Approve as
                            </span>
                            <select
                                disabled={disabled || dirty}
                                value={approvalRoles[app.id] ?? "staff"}
                                onChange={(event) => setApprovalRoles({ ...approvalRoles, [app.id]: event.target.value })}
                            >
                                <option
                                    value="staff"
                                >
                                    Staff
                                </option>
                                <option
                                    value="henry"
                                >
                                    Henry
                                </option>
                                <option
                                    value="admin"
                                >
                                    Administrator
                                </option>
                            </select>
                        </label>
                        <button
                            type="button"
                            disabled={disabled || dirty}
                            className={`${styles.button} ${styles.primary}`}
                            onClick={() => void decideApplication(app, "approve")}
                        >
                            {busy === app.id ? "Working…" : "Approve application"}
                        </button>
                        <button
                            type="button"
                            disabled={disabled || dirty}
                            className={styles.button}
                            onClick={() => void decideApplication(app, "reject")}
                        >
                            Reject application
                        </button>
                    </div>
                </article>)}
            </section>
        </div>
    );
}
function Summary({ label, value, icon }: {
    label: string;
    value: number | string;
    icon: "people" | "lock" | "clipboard";
}) {
    return (
        <div
            className={styles.summary}
        >
            <PortalIcon
                name={icon}
            />
            <div>
                <strong>
                    {value}
                </strong>
                <span>
                    {label}
                </span>
            </div>
        </div>
    );
}
function ApplicationDetail({ label, value }: {
    label: string;
    value: string | null;
}) {
    return (
        <div
            className={styles.detail}
        >
            <h4>
                {label}
            </h4>
            <p>
                {value?.trim() || "Not provided"}
            </p>
        </div>
    );
}

