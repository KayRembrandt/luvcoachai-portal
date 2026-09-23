/** Shared, dependency-free types for the two staff administration screens.
 * This file does not create permissions or enforce access on other portal pages.
 */
export type SavedPermissions = Record<string, unknown>;
export type StaffRecord = {
    id: string;
    email: string | null;
    first_name: string | null;
    last_name: string | null;
    display_name?: string | null;
    role: string | null;
    status: string | null;
    is_active: boolean | null;
    permissions: SavedPermissions | null;
    auth_user_id?: string | null;
    created_at?: string | null;
    updated_at?: string | null;
    revision: string;
};
export type StaffApplication = {
    id: string;
    first_name: string | null;
    last_name: string | null;
    email: string;
    phone: string | null;
    request_role: string | null;
    why_joining: string | null;
    experience: string | null;
    values_alignment: string | null;
    status: string | null;
    created_at: string;
};
// These role values are the ones allowed by the supplied staff_role_check.
// Existing, different values are displayed/preserved, not converted to Staff.
export const assignableRoles = [
    { value: "staff", label: "Staff" },
    { value: "coach-team", label: "Coaching team" },
    { value: "photo-review", label: "Photo review team" },
    { value: "henry", label: "Henry" },
    { value: "admin", label: "Administrator" },
] as const;
export type AssignableRole = (typeof assignableRoles)[number]["value"];
export const workOptions = [
    { key: "user_search", label: "User Search", description: "Member lookup and profile support.", icon: "search", group: "support" },
    { key: "photo_review", label: "Photo Review", description: "Profile-photo review work.", icon: "photo", group: "support" },
    { key: "henry_desk", label: "Henry Desk", description: "Staff guidance and escalated work.", icon: "chat", group: "support" },
    { key: "safety", label: "User Blocked", description: "Uses the existing Safety setting for block-review work.", icon: "shield", group: "support" },
    { key: "library_review", label: "Library Review", description: "Journey categories, lessons, and teaching prompts.", icon: "book", group: "content" },
] as const;
export type WorkKey = (typeof workOptions)[number]["key"];
export const workKeys: readonly WorkKey[] = workOptions.map((option) => option.key);
export function isAdminRole(role: string | null | undefined): boolean {
    return ["admin", "super_admin"].includes((role ?? "").trim().toLowerCase());
}
export function staffIsActive(row: Pick<StaffRecord, "status" | "is_active">): boolean {
    return row.is_active === true && ["", "active", "approved"].includes((row.status ?? "").trim().toLowerCase());
}
export function roleLabel(role: string | null | undefined): string {
    return assignableRoles.find((option) => option.value === role)?.label
        ?? (role === "super_admin" ? "Super administrator" : role === "csr" ? "CSR" : role || "Not set");
}
export function staffName(row: Pick<StaffRecord, "first_name" | "last_name" | "display_name" | "email">): string {
    return row.display_name?.trim()
        || [row.first_name, row.last_name].filter(Boolean).join(" ").trim()
        || row.email
        || "Unnamed staff member";
}
export function initials(name: string): string {
    return name.split(/\s+/).filter(Boolean).slice(0, 2).map((part) => part[0]).join("").toUpperCase() || "?";
}
export function savedWorkLabels(permissions: SavedPermissions | null): string[] {
    const labels: string[] = workOptions.filter((option) => permissions?.[option.key] === true).map((option) => option.label);
    if (permissions?.coaching_author === true)
        labels.push("Coaching author");
    return labels;
}
export function permissionChanges(current: SavedPermissions | null, next: Partial<Record<WorkKey, boolean>>): Partial<Record<WorkKey, boolean>> {
    const changes: Partial<Record<WorkKey, boolean>> = {};
    for (const key of workKeys) {
        if (next[key] !== (current?.[key] === true))
            changes[key] = next[key] === true;
    }
    return changes;
}
export function editableWork(permissions: SavedPermissions | null): Record<WorkKey, boolean> {
    return Object.fromEntries(workKeys.map((key) => [key, permissions?.[key] === true])) as Record<WorkKey, boolean>;
}
export type StaffAccessResponse = {
    staff: StaffRecord[];
    applications: StaffApplication[];
    applicationWarning?: string | null;
    meId: string;
    meRole: string;
    staffLimitReached?: boolean;
    applicationLimitReached?: boolean;
};
export type StaffListResponse = {
    rows: StaffRecord[];
    meRole: string;
    meId: string;
    staffLimitReached?: boolean;
};

