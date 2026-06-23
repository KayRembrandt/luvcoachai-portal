import { createClient, type SupabaseClient, type User } from "@supabase/supabase-js";
import { NextRequest } from "next/server";

export type StaffRole = "staff" | "csr" | "henry" | "admin" | "super_admin";
export type StaffStatus = "active" | "inactive";

export type StaffPermissions = {
  user_search?: boolean;
  onboarding?: boolean;
  photo_review?: boolean;
  library_review?: boolean;
  jobs?: boolean;
  henry_desk?: boolean;
  safety?: boolean;
  system?: boolean;
};

export type StaffUpsertInput = {
  id?: string | null;
  email: string;
  first_name?: string | null;
  last_name?: string | null;
  role?: string | null;
  status?: string | null;
  permissions?: StaffPermissions | null;
};

export type StaffRow = {
  id: string;
  email: string | null;
  first_name: string | null;
  last_name: string | null;
  display_name?: string | null;
  role: StaffRole | string | null;
  status: StaffStatus | string | null;
  is_active?: boolean | null;
  permissions: StaffPermissions | null;
  auth_user_id?: string | null;
  created_at?: string | null;
  updated_at?: string | null;
};

export const STAFF_SELECT =
  "id,email,first_name,last_name,display_name,role,status,is_active,permissions,auth_user_id,created_at,updated_at";

export const defaultPermissions: Record<StaffRole, StaffPermissions> = {
  staff: { user_search: true },
  csr: { user_search: true, onboarding: true, jobs: true },
  henry: { user_search: true, henry_desk: true, jobs: true },
  admin: {
    user_search: true,
    onboarding: true,
    photo_review: true,
    library_review: true,
    jobs: true,
    henry_desk: true,
    safety: true,
    system: true,
  },
  super_admin: {
    user_search: true,
    onboarding: true,
    photo_review: true,
    library_review: true,
    jobs: true,
    henry_desk: true,
    safety: true,
    system: true,
  },
};

const allowedPermissionKeys: (keyof StaffPermissions)[] = [
  "user_search",
  "onboarding",
  "photo_review",
  "library_review",
  "jobs",
  "henry_desk",
  "safety",
  "system",
];

export function createServiceClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!url || !key) {
    throw new Error("Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY.");
  }

  return createClient(url, key, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  });
}

export function normalizeEmail(email: unknown) {
  return String(email || "").trim().toLowerCase();
}

export function normalizeRole(role: unknown): StaffRole {
  const value = String(role || "staff").trim().toLowerCase();
  if (["staff", "csr", "henry", "admin", "super_admin"].includes(value)) {
    return value as StaffRole;
  }
  return "staff";
}

export function normalizeStatus(status: unknown): StaffStatus {
  return String(status || "active").trim().toLowerCase() === "inactive" ? "inactive" : "active";
}

export function normalizePermissions(role: StaffRole, permissions: unknown): StaffPermissions {
  const base = defaultPermissions[role] || defaultPermissions.staff;
  const input = typeof permissions === "object" && permissions !== null ? (permissions as StaffPermissions) : {};
  const clean: StaffPermissions = { ...base };

  for (const key of allowedPermissionKeys) {
    if (Object.prototype.hasOwnProperty.call(input, key)) {
      clean[key] = !!input[key];
    }
  }

  return clean;
}

function cleanNullableText(value: unknown) {
  const text = String(value || "").trim();
  return text ? text : null;
}

function makeDisplayName(firstName: string | null, lastName: string | null, email: string) {
  const name = `${firstName || ""} ${lastName || ""}`.trim();
  return name || email.split("@")[0] || email;
}

function siteUrlFrom(origin?: string | null) {
  return (
    process.env.NEXT_PUBLIC_SITE_URL ||
    process.env.NEXT_PUBLIC_APP_URL ||
    origin ||
    ""
  ).replace(/\/$/, "");
}

export function getBearerToken(req: NextRequest) {
  const header = req.headers.get("authorization") || req.headers.get("Authorization") || "";
  const match = header.match(/^Bearer\s+(.+)$/i);
  return match?.[1] || null;
}

export async function getAuthedUser(req: NextRequest, supabase: SupabaseClient) {
  const token = getBearerToken(req);
  if (!token) {
    const error = new Error("Missing login token.");
    (error as any).status = 401;
    throw error;
  }

  const { data, error } = await supabase.auth.getUser(token);
  if (error || !data.user) {
    const authError = new Error("Invalid or expired login token.");
    (authError as any).status = 401;
    throw authError;
  }

  return data.user;
}

export async function findStaffForUser(supabase: SupabaseClient, user: User) {
  const email = normalizeEmail(user.email);
  const orParts = [`auth_user_id.eq.${user.id}`, `id.eq.${user.id}`];
  if (email) orParts.push(`email.eq.${email}`);

  const { data, error } = await supabase
    .from("staff")
    .select(STAFF_SELECT)
    .or(orParts.join(","))
    .limit(1)
    .maybeSingle();

  if (error) throw error;
  return data as StaffRow | null;
}

export async function assertPortalAdmin(req: NextRequest) {
  const supabase = createServiceClient();
  const user = await getAuthedUser(req, supabase);
  const staff = await findStaffForUser(supabase, user);

  const role = String(staff?.role || "").toLowerCase();
  const status = String(staff?.status || "").toLowerCase();
  const isActive = staff?.is_active !== false && !["inactive", "disabled", "rejected"].includes(status);
  const isAdmin = isActive && ["admin", "super_admin"].includes(role);

  if (!isAdmin) {
    const error = new Error("Admin access required.");
    (error as any).status = 403;
    throw error;
  }

  return { supabase, user, staff };
}

async function findAuthUserByEmail(supabase: SupabaseClient, email: string) {
  // Supabase Auth Admin does not have a direct getUserByEmail call.
  // We page through users and match the email so staff.id can stay equal to auth.users.id.
  const perPage = 1000;

  for (let page = 1; page <= 20; page += 1) {
    const { data, error } = await supabase.auth.admin.listUsers({ page, perPage });
    if (error) throw error;

    const users = data?.users || [];
    const found = users.find((u) => normalizeEmail(u.email) === email);
    if (found) return found;

    if (users.length < perPage) break;
  }

  return null;
}

async function inviteAuthUserByEmail(supabase: SupabaseClient, email: string, origin?: string | null) {
  const siteUrl = siteUrlFrom(origin);
  const redirectTo = siteUrl ? `${siteUrl}/login?next=/admin` : undefined;

  const { data, error } = await supabase.auth.admin.inviteUserByEmail(
    email,
    redirectTo ? { redirectTo } : undefined
  );

  if (error) throw error;
  if (!data?.user?.id) {
    throw new Error("Invite was sent, but Supabase did not return an auth user id.");
  }

  return data.user;
}

export async function upsertStaffByEmail(
  supabase: SupabaseClient,
  input: StaffUpsertInput,
  options: { origin?: string | null; inviteIfMissing?: boolean } = {}
) {
  const email = normalizeEmail(input.email);
  if (!email || !/^\S+@\S+\.\S+$/.test(email)) {
    const error = new Error("A valid email is required.");
    (error as any).status = 400;
    throw error;
  }

  const role = normalizeRole(input.role);
  const status = normalizeStatus(input.status);
  const firstName = cleanNullableText(input.first_name);
  const lastName = cleanNullableText(input.last_name);
  const permissions = normalizePermissions(role, input.permissions);
  const isActive = status === "active";

  const payload = {
    email,
    first_name: firstName,
    last_name: lastName,
    display_name: makeDisplayName(firstName, lastName, email),
    role,
    status,
    is_active: isActive,
    permissions,
    updated_at: new Date().toISOString(),
  };

  // Editing an existing staff row from the table.
  if (input.id) {
    const { data, error } = await supabase
      .from("staff")
      .update(payload)
      .eq("id", input.id)
      .select(STAFF_SELECT)
      .single();

    if (error) throw error;
    return data as StaffRow;
  }

  // Existing staff by email: update it, do not create a duplicate.
  const { data: existingByEmail, error: existingByEmailError } = await supabase
    .from("staff")
    .select("id,auth_user_id,email")
    .eq("email", email)
    .limit(1)
    .maybeSingle();

  if (existingByEmailError) throw existingByEmailError;

  if (existingByEmail?.id) {
    const { data, error } = await supabase
      .from("staff")
      .update(payload)
      .eq("id", existingByEmail.id)
      .select(STAFF_SELECT)
      .single();

    if (error) throw error;
    return data as StaffRow;
  }

  // New staff: find their existing auth login. If not found, invite them.
  let authUser = await findAuthUserByEmail(supabase, email);

  if (!authUser) {
    if (options.inviteIfMissing === false) {
      const error = new Error("No login exists for this email yet. Send an invite first.");
      (error as any).status = 404;
      throw error;
    }

    authUser = await inviteAuthUserByEmail(supabase, email, options.origin);
  }

  const authUserId = authUser.id;

  // If staff exists under this auth id with an older email, update it instead of inserting.
  const { data: existingByAuth, error: existingByAuthError } = await supabase
    .from("staff")
    .select("id,auth_user_id,email")
    .or(`id.eq.${authUserId},auth_user_id.eq.${authUserId}`)
    .limit(1)
    .maybeSingle();

  if (existingByAuthError) throw existingByAuthError;

  if (existingByAuth?.id) {
    const { data, error } = await supabase
      .from("staff")
      .update({ ...payload, auth_user_id: authUserId })
      .eq("id", existingByAuth.id)
      .select(STAFF_SELECT)
      .single();

    if (error) throw error;
    return data as StaffRow;
  }

  // Your portal convention: staff.id is the Supabase auth UUID.
  const { data, error } = await supabase
    .from("staff")
    .insert({
      id: authUserId,
      auth_user_id: authUserId,
      ...payload,
    })
    .select(STAFF_SELECT)
    .single();

  if (error) throw error;
  return data as StaffRow;
}

export function apiError(error: unknown) {
  const anyError = error as any;

  const message =
    error instanceof Error
      ? error.message
      : anyError?.message ||
        anyError?.error_description ||
        anyError?.details ||
        anyError?.hint ||
        "Something went wrong.";

  const status =
    typeof anyError?.status === "number"
      ? anyError.status
      : typeof anyError?.statusCode === "number"
        ? anyError.statusCode
        : 500;

  console.error("[staff access api error]", anyError);
  return { message, status };
}
