import "server-only";
import { createHash } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { createServiceClient, STAFF_SELECT } from "@/lib/portalStaffAccess";
import { assignableRoles, isAdminRole, staffIsActive, workKeys, type SavedPermissions, type StaffRecord, } from "@/lib/staffAccessModel";
type Db = ReturnType<typeof createServiceClient>;
type StoredStaff = Omit<StaffRecord, "revision">;
export type StaffAdmin = {
    db: Db;
    userId: string;
    staff: StoredStaff;
};
const responseHeaders = { "Cache-Control": "private, no-store, max-age=0", Vary: "Authorization" };
const pendingStatusFilter = "status.is.null,status.eq.submitted,status.eq.pending,status.eq.new";
const revisionFields = ["id", "email", "first_name", "last_name", "display_name", "role", "status", "is_active", "permissions", "auth_user_id", "created_at", "updated_at"] as const;
export class StaffAccessError extends Error {
    constructor(message: string, public status = 400) {
        super(message);
    }
}
export function jsonResponse(value: unknown, status = 200) {
    return NextResponse.json(value, { status, headers: responseHeaders });
}
export function staffFailure(error: unknown) {
    if (error instanceof StaffAccessError)
        return jsonResponse({ error: error.message }, error.status);
    const code = error && typeof error === "object" && "code" in error ? String(error.code) : "unknown";
    console.error("[staff administration] request failed", { code });
    const message = code === "23505"
        ? "A staff record already uses that email or login. Refresh and edit the existing record."
        : code === "23514"
            ? "The database did not accept that role or status. No staff record was saved."
            : "The staff request could not be completed. Please refresh and try again. Reference: " + code;
    return jsonResponse({ error: message }, code === "23505" ? 409 : 500);
}
/** Do not trust a browser role, a hidden navigation item, or an email-only match. */
export async function requireStaffAdmin(req: NextRequest): Promise<StaffAdmin> {
    const token = req.headers.get("authorization")?.match(/^Bearer\s+(\S+)$/i)?.[1];
    if (!token || token.length > 16384)
        throw new StaffAccessError("Please sign in again.", 401);
    const db = createServiceClient();
    const { data, error } = await db.auth.getUser(token);
    if (error || !data.user)
        throw new StaffAccessError("Your login has expired. Please sign in again.", 401);
    const linked = await db.from("staff").select(STAFF_SELECT).eq("auth_user_id", data.user.id).maybeSingle();
    if (linked.error)
        throw linked.error;
    let row = linked.data as StoredStaff | null;
    if (!row) {
        const legacy = await db.from("staff").select(STAFF_SELECT).eq("id", data.user.id).is("auth_user_id", null).maybeSingle();
        if (legacy.error)
            throw legacy.error;
        row = legacy.data as StoredStaff | null;
    }
    if (!row || !staffIsActive(row) || !isAdminRole(row.role)) {
        throw new StaffAccessError("Active administrator access is required.", 403);
    }
    return { db, userId: data.user.id, staff: row };
}
function canonical(value: unknown): string {
    if (Array.isArray(value))
        return "[" + value.map(canonical).join(",") + "]";
    if (value !== null && typeof value === "object") {
        const record = value as Record<string, unknown>;
        return "{" + Object.keys(record).sort().map((key) => JSON.stringify(key) + ":" + canonical(record[key])).join(",") + "}";
    }
    return JSON.stringify(value ?? null);
}
/** A concurrency token, NOT an authorization credential. Never contains secrets. */
export function revisionFor(row: StoredStaff): string {
    const values = Object.fromEntries(revisionFields.map((key) => [key, row[key] ?? null]));
    return createHash("sha256").update(canonical(values)).digest("hex");
}
export function withRevision(row: StoredStaff): StaffRecord {
    return { ...row, revision: revisionFor(row) };
}
export async function listStaff(admin: StaffAdmin) {
    const result = await admin.db.from("staff").select(STAFF_SELECT).order("created_at", { ascending: false }).order("id").range(0, 999);
    if (result.error)
        throw result.error;
    const rows = (result.data ?? []) as StoredStaff[];
    return { rows: rows.map(withRevision), staffLimitReached: rows.length === 1000 };
}
export async function accessOverview(admin: StaffAdmin) {
    const [staff, applications] = await Promise.all([
        listStaff(admin),
        admin.db.from("staff_applications")
            .select("id,first_name,last_name,email,phone,request_role,why_joining,experience,values_alignment,status,created_at")
            .or(pendingStatusFilter).order("created_at", { ascending: false }).order("id").range(0, 199),
    ]);
    return {
        staff: staff.rows,
        staffLimitReached: staff.staffLimitReached,
        applications: applications.error ? [] : applications.data ?? [],
        applicationWarning: applications.error ? "Staff loaded, but applications could not be loaded. Refresh before acting on an application." : null,
        applicationLimitReached: !applications.error && applications.data?.length === 200,
        meId: admin.staff.id,
        meRole: admin.staff.role,
    };
}
export async function readEditorBody(req: NextRequest): Promise<Record<string, unknown>> {
    if (!req.headers.get("content-type")?.toLowerCase().startsWith("application/json")) {
        throw new StaffAccessError("Use a JSON request.", 415);
    }
    const origin = req.headers.get("origin");
    const allowed = new Set([req.nextUrl.origin]);
    const site = process.env.NEXT_PUBLIC_SITE_URL || process.env.NEXT_PUBLIC_APP_URL;
    if (site) {
        try {
            allowed.add(new URL(site).origin);
        }
        catch { /* A malformed configuration does not grant access. */ }
    }
    if (origin && !allowed.has(origin))
        throw new StaffAccessError("Use the staff portal to make this change.", 403);
    const reader = req.body?.getReader();
    if (!reader)
        throw new StaffAccessError("Request body is missing.");
    let size = 0;
    const chunks: Uint8Array[] = [];
    try {
        while (true) {
            const result = await reader.read();
            if (result.done)
                break;
            size += result.value.byteLength;
            if (size > 32768) {
                await reader.cancel();
                throw new StaffAccessError("The request is too large.", 413);
            }
            chunks.push(result.value);
        }
    }
    finally {
        reader.releaseLock();
    }
    const bytes = new Uint8Array(size);
    let offset = 0;
    for (const part of chunks) {
        bytes.set(part, offset);
        offset += part.length;
    }
    let body: unknown;
    try {
        body = JSON.parse(new TextDecoder().decode(bytes));
    }
    catch {
        throw new StaffAccessError("Invalid JSON request.");
    }
    if (!body || typeof body !== "object" || Array.isArray(body))
        throw new StaffAccessError("Invalid request.");
    const record = body as Record<string, unknown>;
    if (record.editor_version !== "staff-access-v2") {
        throw new StaffAccessError("This staff editor was updated. Refresh the page before saving.", 409);
    }
    return record;
}
function text(value: unknown, field: string, max = 150): string {
    if (typeof value !== "string" || value.length > max)
        throw new StaffAccessError(`Check ${field}.`);
    return value.trim();
}
function id(value: unknown): string {
    const result = text(value, "staff identifier", 36);
    if (!/^[\da-f]{8}-[\da-f]{4}-[\da-f]{4}-[\da-f]{4}-[\da-f]{12}$/i.test(result))
        throw new StaffAccessError("Invalid staff identifier.");
    return result;
}
function changesFrom(value: unknown): SavedPermissions {
    if (!value || typeof value !== "object" || Array.isArray(value))
        throw new StaffAccessError("Check the work settings.");
    const result: SavedPermissions = {};
    for (const [key, enabled] of Object.entries(value)) {
        if (!(workKeys as readonly string[]).includes(key) || typeof enabled !== "boolean") {
            throw new StaffAccessError("This change contains an unsupported work setting. Refresh the editor.");
        }
        result[key] = enabled;
    }
    return result;
}
async function findTarget(admin: StaffAdmin, targetId: string) {
    const result = await admin.db.from("staff").select(STAFF_SELECT).eq("id", targetId).maybeSingle();
    if (result.error)
        throw result.error;
    if (!result.data)
        throw new StaffAccessError("That staff member was not found.", 404);
    return result.data as StoredStaff;
}
function checkRevision(row: StoredStaff, expected: unknown) {
    if (typeof expected !== "string" || expected !== revisionFor(row)) {
        throw new StaffAccessError("This staff record changed elsewhere. Your edits are still on screen. Refresh the record before trying again.", 409);
    }
}
function guardPrivilegedAccount(admin: StaffAdmin, current: StoredStaff, role: string | null, status: string | null, active: boolean | null) {
    if (current.id === admin.staff.id || current.auth_user_id === admin.userId || isAdminRole(current.role)) {
        if (role !== current.role || status !== current.status || active !== current.is_active) {
            throw new StaffAccessError("This workspace does not deactivate or change the role of your own account or an existing administrator.", 403);
        }
    }
}
async function compareAndSave(admin: StaffAdmin, current: StoredStaff, payload: Record<string, unknown>) {
    let query = admin.db.from("staff").update({ ...payload, updated_at: new Date().toISOString() }).eq("id", current.id);
    // Check every field represented by the editor, including permissions modified by
    // the existing Coaching workspace. A concurrent write fails rather than winning silently.
    for (const key of revisionFields) {
        if (key === "id")
            continue;
        const value = current[key];
        query = value === null || value === undefined
            ? query.is(key, null)
            : query.eq(key, key === "permissions" ? JSON.stringify(value) : value);
    }
    const result = await query.select(STAFF_SELECT).maybeSingle();
    if (result.error)
        throw result.error;
    if (!result.data)
        throw new StaffAccessError("This staff record changed while saving. Refresh it before retrying; nothing was overwritten.", 409);
    return withRevision(result.data as StoredStaff);
}
export async function updateStaff(admin: StaffAdmin, body: Record<string, unknown>) {
    const current = await findTarget(admin, id(body.id));
    checkRevision(current, body.revision);
    const email = text(body.email, "email", 254).toLowerCase();
    if (email !== (current.email ?? "").trim().toLowerCase()) {
        throw new StaffAccessError("An existing login email cannot be changed here. Staff details and login identity stay linked.");
    }
    const first = text(body.first_name, "first name");
    const last = text(body.last_name, "last name");
    const roleInput = text(body.role, "role", 100);
    const role = roleInput === "__keep__" ? current.role : roleInput;
    if (role !== current.role && !assignableRoles.some((item) => item.value === role)) {
        throw new StaffAccessError("Choose a supported role, or keep the existing one.");
    }
    let status = current.status;
    let active = current.is_active;
    if (body.status !== "keep") {
        if (body.status !== "active" && body.status !== "inactive")
            throw new StaffAccessError("Choose Active, Inactive, or keep the existing status.");
        status = body.status;
        active = status === "active";
    }
    guardPrivilegedAccount(admin, current, role, status, active);
    const previous = current.permissions;
    if (previous !== null && (typeof previous !== "object" || Array.isArray(previous))) {
        throw new StaffAccessError("This account has an unsupported permissions format. No settings were changed.", 409);
    }
    const change = changesFrom(body.permission_changes);
    const permissions = Object.keys(change).length ? { ...(previous ?? {}), ...change } : previous;
    const namesChanged = first !== (current.first_name ?? "").trim() || last !== (current.last_name ?? "").trim();
    return compareAndSave(admin, current, {
        first_name: first || null,
        last_name: last || null,
        display_name: namesChanged ? [first, last].filter(Boolean).join(" ") || email.split("@")[0] : current.display_name ?? null,
        role,
        status,
        is_active: active,
        permissions,
    });
}
export async function setStaffStatus(admin: StaffAdmin, body: Record<string, unknown>) {
    if (body.action !== "set_status" || typeof body.active !== "boolean")
        throw new StaffAccessError("Invalid account-status change.");
    const current = await findTarget(admin, id(body.id));
    checkRevision(current, body.revision);
    const status = body.active ? "active" : "inactive";
    guardPrivilegedAccount(admin, current, current.role, status, body.active);
    return compareAndSave(admin, current, { status, is_active: body.active });
}
export async function createStaff(admin: StaffAdmin, body: Record<string, unknown>, origin: string) {
    const email = text(body.email, "email", 254).toLowerCase();
    if (!/^\S+@\S+\.\S+$/.test(email))
        throw new StaffAccessError("A valid email is required.");
    const first = text(body.first_name, "first name");
    const last = text(body.last_name, "last name");
    const role = text(body.role, "role", 100);
    if (!assignableRoles.some((item) => item.value === role))
        throw new StaffAccessError("Choose a supported staff role.");
    if (body.status !== "active" && body.status !== "inactive")
        throw new StaffAccessError("Choose Active or Inactive.");
    const permissions = changesFrom(body.permission_changes);
    // Make unchecked visible settings explicitly false. No role-based hidden grants.
    for (const key of workKeys)
        if (!(key in permissions))
            permissions[key] = false;
    if (body.confirm_invitation !== true)
        throw new StaffAccessError("Confirm adding this person and sending a login invitation if needed.");
    const existingEmail = await admin.db.from("staff").select("id,email").ilike("email", email.replace(/[\\%_]/g, "\\$&")).limit(2);
    if (existingEmail.error)
        throw existingEmail.error;
    if (existingEmail.data?.length)
        throw new StaffAccessError("A staff record already uses this email. Edit that record instead of adding it again.", 409);
    let loginId: string | null = null;
    let complete = false;
    for (let page = 1; page <= 20; page += 1) {
        const result = await admin.db.auth.admin.listUsers({ page, perPage: 1000 });
        if (result.error)
            throw result.error;
        const users = result.data.users;
        const found = users.find((user) => user.email?.trim().toLowerCase() === email);
        if (found) {
            loginId = found.id;
            complete = true;
            break;
        }
        if (users.length < 1000) {
            complete = true;
            break;
        }
    }
    if (!complete)
        throw new StaffAccessError("The login directory is too large for this lookup. No invitation was sent.", 503);
    if (loginId) {
        const existingLogin = await admin.db.from("staff").select("id").or(`id.eq.${loginId},auth_user_id.eq.${loginId}`).limit(2);
        if (existingLogin.error)
            throw existingLogin.error;
        if (existingLogin.data?.length)
            throw new StaffAccessError("This login is already linked to a staff record. Use that record's Manage access action.", 409);
    }
    let invited = false;
    if (!loginId) {
        const site = (process.env.NEXT_PUBLIC_SITE_URL || process.env.NEXT_PUBLIC_APP_URL || origin).replace(/\/$/, "");
        const result = await admin.db.auth.admin.inviteUserByEmail(email, { redirectTo: `${site}/login?next=/` });
        if (result.error)
            throw result.error;
        loginId = result.data.user?.id ?? null;
        if (!loginId)
            throw new StaffAccessError("The login invitation did not return an account identifier. Check the Auth directory before trying again.", 502);
        invited = true;
    }
    const result = await admin.db.from("staff").insert({
        id: loginId,
        auth_user_id: loginId,
        email,
        first_name: first || null,
        last_name: last || null,
        display_name: [first, last].filter(Boolean).join(" ") || email.split("@")[0],
        role,
        status: body.status,
        is_active: body.status === "active",
        permissions,
        updated_at: new Date().toISOString(),
    }).select(STAFF_SELECT).single();
    if (result.error) {
        if (invited)
            throw new StaffAccessError("The login invitation was sent, but the staff record was not saved. Refresh the staff list before retrying with the same email.", 409);
        throw result.error;
    }
    return { staff: withRevision(result.data as StoredStaff), invitationSent: invited };
}

