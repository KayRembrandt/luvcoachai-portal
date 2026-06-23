import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import type { NextRequest } from "next/server";

export const DEFAULT_PHOTO_REVIEW_TIMEZONE = "America/Los_Angeles";

export type StaffRole = "staff" | "henry" | "admin";

export type StaffRow = {
  id: string;
  auth_user_id?: string | null;
  user_id?: string | null;
  role?: string | null;
  is_active?: boolean | null;
  status?: string | null;
  first_name?: string | null;
  last_name?: string | null;
  email?: string | null;
  notification_email?: string | null;
  work_email?: string | null;
  staff_email?: string | null;
  [key: string]: unknown;
};

export type PhotoReviewTeamRow = {
  id: string;
  staff_id: string;
  application_status?: string | null;
  phone_number?: string | null;
  sms_enabled?: boolean | null;
  email_address?: string | null;
  email_enabled?: boolean | null;
  timezone?: string | null;
  notes?: string | null;
  created_at?: string | null;
  updated_at?: string | null;
  [key: string]: unknown;
};

export type PhotoReviewCoverageRow = {
  id?: string;
  team_member_id: string;
  day_of_week: number;
  start_time: string;
  end_time: string;
  timezone?: string | null;
  is_active?: boolean | null;
  created_at?: string | null;
  updated_at?: string | null;
  [key: string]: unknown;
};

export type VerifiedAdmin = {
  userId: string;
  email: string | null;
  staff: StaffRow;
};

function requiredEnv(name: string) {
  const value = process.env[name];
  if (!value) throw new Error(`Missing environment variable: ${name}`);
  return value;
}

export function getSupabaseAdmin(): SupabaseClient {
  return createClient(
    requiredEnv("NEXT_PUBLIC_SUPABASE_URL"),
    requiredEnv("SUPABASE_SERVICE_ROLE_KEY"),
    {
      auth: {
        persistSession: false,
        autoRefreshToken: false,
      },
    },
  );
}

function getAuthClient(token: string): SupabaseClient {
  return createClient(
    requiredEnv("NEXT_PUBLIC_SUPABASE_URL"),
    requiredEnv("NEXT_PUBLIC_SUPABASE_ANON_KEY"),
    {
      auth: {
        persistSession: false,
        autoRefreshToken: false,
      },
      global: {
        headers: {
          Authorization: `Bearer ${token}`,
        },
      },
    },
  );
}

export function pickBearerToken(req: NextRequest) {
  const raw = req.headers.get("authorization") ?? "";
  const match = raw.match(/^Bearer\s+(.+)$/i);
  return match?.[1] ?? null;
}

export function isAllowedStaffStatus(status: unknown) {
  const s = String(status ?? "")
    .toLowerCase()
    .trim();
  return s === "" || s === "active" || s === "approved";
}

export function isAdminRole(role: unknown) {
  return (
    String(role ?? "")
      .toLowerCase()
      .trim() === "admin"
  );
}

export async function requireAdmin(req: NextRequest): Promise<VerifiedAdmin> {
  const token = pickBearerToken(req);

  if (!token) {
    throw Object.assign(new Error("Missing bearer token."), { status: 401 });
  }

  const authClient = getAuthClient(token);
  const admin = getSupabaseAdmin();

  const { data: userData, error: userError } = await authClient.auth.getUser();

  if (userError || !userData?.user?.id) {
    throw Object.assign(new Error("Could not verify login session."), {
      status: 401,
    });
  }

  const { data: staff, error: staffError } = await admin
    .from("staff")
    .select("*")
    .eq("auth_user_id", userData.user.id)
    .maybeSingle<StaffRow>();

  if (staffError) {
    throw Object.assign(new Error(staffError.message), { status: 500 });
  }

  if (!staff) {
    throw Object.assign(new Error("No staff record found for this account."), {
      status: 403,
    });
  }

  if (staff.is_active === false || !isAllowedStaffStatus(staff.status)) {
    throw Object.assign(new Error("Your staff account is not active."), {
      status: 403,
    });
  }

  if (!isAdminRole(staff.role)) {
    throw Object.assign(new Error("Admin access is required."), {
      status: 403,
    });
  }

  return {
    userId: userData.user.id,
    email: userData.user.email ?? null,
    staff,
  };
}

export function routeError(error: unknown) {
  const err = error as Error & { status?: number };
  const status = typeof err?.status === "number" ? err.status : 500;
  return Response.json(
    { error: err?.message ?? "Something went wrong." },
    { status },
  );
}

export function staffDisplayName(staff: StaffRow | null | undefined) {
  const first = String(staff?.first_name ?? "").trim();
  const last = String(staff?.last_name ?? "").trim();
  return [first, last].filter(Boolean).join(" ") || "Staff member";
}

export function cleanEmail(value: unknown) {
  const email = String(value ?? "").trim();
  return email.includes("@") ? email : null;
}

export function getStaffAuthUserId(staff: StaffRow | null | undefined) {
  const authUserId = String(staff?.auth_user_id ?? "").trim();
  if (authUserId) return authUserId;

  // Some older project tables used user_id for the Supabase auth user id.
  const userId = String(staff?.user_id ?? "").trim();
  return userId || null;
}

export async function loadAuthEmailMap(
  supabase: SupabaseClient,
  staffRows: StaffRow[],
) {
  const authUserIds = new Set(
    staffRows
      .map((staff) => getStaffAuthUserId(staff))
      .filter((value): value is string => !!value),
  );

  const emailByAuthUserId = new Map<string, string>();

  if (authUserIds.size === 0) {
    return emailByAuthUserId;
  }

  try {
    const perPage = 1000;

    for (let page = 1; page <= 10; page += 1) {
      const { data, error } = await supabase.auth.admin.listUsers({
        page,
        perPage,
      });

      if (error) {
        console.warn(
          "Photo review admin could not list auth users:",
          error.message,
        );
        break;
      }

      const users = data?.users ?? [];

      for (const user of users) {
        if (authUserIds.has(user.id) && user.email) {
          emailByAuthUserId.set(user.id, user.email);
        }
      }

      if (
        emailByAuthUserId.size >= authUserIds.size ||
        users.length < perPage
      ) {
        break;
      }
    }
  } catch (error) {
    console.warn("Photo review admin auth email lookup failed:", error);
  }

  return emailByAuthUserId;
}

export function pickStaffEmail(
  staff: StaffRow | null | undefined,
  authEmailByUserId?: Map<string, string>,
) {
  const candidates = [
    staff?.notification_email,
    staff?.email,
    staff?.work_email,
    staff?.staff_email,
  ];

  for (const candidate of candidates) {
    const value = cleanEmail(candidate);
    if (value) return value;
  }

  const authUserId = getStaffAuthUserId(staff);
  const authEmail = authUserId
    ? cleanEmail(authEmailByUserId?.get(authUserId))
    : null;

  return authEmail;
}

export function normalizeTime(value: unknown) {
  const raw = String(value ?? "").trim();
  const match = raw.match(/^(\d{1,2}):(\d{2})/);
  if (!match) return null;

  const hour = Number(match[1]);
  const minute = Number(match[2]);

  if (hour < 0 || hour > 23 || minute < 0 || minute > 59) return null;

  return `${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}`;
}

export function normalizeTimezone(value: unknown) {
  const tz = String(value ?? "").trim();
  return tz || DEFAULT_PHOTO_REVIEW_TIMEZONE;
}

export function getLocalDayAndMinutes(timezone: string, now = new Date()) {
  const formatter = new Intl.DateTimeFormat("en-US", {
    timeZone: normalizeTimezone(timezone),
    weekday: "short",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });

  const parts = formatter.formatToParts(now);
  const weekday = parts.find((p) => p.type === "weekday")?.value ?? "Sun";
  const hour = Number(parts.find((p) => p.type === "hour")?.value ?? "0");
  const minute = Number(parts.find((p) => p.type === "minute")?.value ?? "0");

  const dayMap: Record<string, number> = {
    Sun: 0,
    Mon: 1,
    Tue: 2,
    Wed: 3,
    Thu: 4,
    Fri: 5,
    Sat: 6,
  };

  return {
    dayOfWeek: dayMap[weekday] ?? 0,
    minutes: hour * 60 + minute,
  };
}

export function timeToMinutes(value: string) {
  const normalized = normalizeTime(value);
  if (!normalized) return null;
  const [hour, minute] = normalized.split(":").map(Number);
  return hour * 60 + minute;
}

export function isCoverageOnNow(
  coverage: Pick<
    PhotoReviewCoverageRow,
    "day_of_week" | "start_time" | "end_time" | "timezone" | "is_active"
  >,
  now = new Date(),
) {
  if (coverage.is_active === false) return false;

  const timezone = normalizeTimezone(coverage.timezone);
  const { dayOfWeek, minutes } = getLocalDayAndMinutes(timezone, now);

  if (Number(coverage.day_of_week) !== dayOfWeek) return false;

  const start = timeToMinutes(coverage.start_time);
  const end = timeToMinutes(coverage.end_time);

  if (start == null || end == null) return false;

  // Normal same-day shift: 09:00-17:00
  if (start <= end) return minutes >= start && minutes < end;

  // Overnight shift: 22:00-06:00
  return minutes >= start || minutes < end;
}

export type PhotoReviewNotificationStatus = "unread" | "resolved" | "dismissed";

export type PhotoReviewNotificationRow = {
  id: string;
  photo_id: string;
  user_id: string;
  type: "photo_review_required" | string;
  title: string;
  message: string;
  status: PhotoReviewNotificationStatus | string;
  created_at?: string | null;
  resolved_at?: string | null;
  resolved_by?: string | null;
  metadata?: Record<string, unknown> | null;
  [key: string]: unknown;
};

export type CreatePhotoReviewNotificationInput = {
  photoId: string;
  userId: string;
  uploadType?: unknown;
  source?: string;
  message?: string;
  metadata?: Record<string, unknown>;
};

export function normalizePhotoUploadType(value: unknown) {
  return String(value ?? "")
    .trim()
    .toLowerCase()
    .replace(/-/g, "_");
}

export function isReviewablePhotoUploadType(value: unknown) {
  const uploadType = normalizePhotoUploadType(value);

  return (
    uploadType === "identity_selfie" ||
    uploadType === "profile_photo" ||
    uploadType === "verification_photo" ||
    uploadType === "photo"
  );
}

export function photoReviewNotificationMessage(uploadType: unknown) {
  const normalized = normalizePhotoUploadType(uploadType || "photo");
  const label = normalized.replace(/_/g, " ");
  return `A new ${label} needs staff review.`;
}

export async function createPhotoReviewNotification(
  supabase: SupabaseClient,
  input: CreatePhotoReviewNotificationInput,
) {
  const photoId = String(input.photoId ?? "").trim();
  const userId = String(input.userId ?? "").trim();
  const uploadType = normalizePhotoUploadType(
    input.uploadType || "profile_photo",
  );

  if (!photoId) {
    throw new Error("Missing photo id for photo review notification.");
  }

  if (!userId) {
    throw new Error("Missing user id for photo review notification.");
  }

  if (!isReviewablePhotoUploadType(uploadType)) {
    return {
      ok: true,
      created: false,
      skipped: true,
      reason: "upload type does not require photo review",
    } as const;
  }

  const { data, error } = await supabase
    .from("photo_review_notifications")
    .insert({
      photo_id: photoId,
      user_id: userId,
      type: "photo_review_required",
      title: "Photo review needed",
      message: input.message ?? photoReviewNotificationMessage(uploadType),
      status: "unread",
      metadata: {
        ...(input.metadata ?? {}),
        upload_type: uploadType,
        source: input.source ?? "photo_upload",
      },
    })
    .select("id")
    .maybeSingle<{ id: string }>();

  if (error) {
    // Duplicate means this photo already has an unread review notification.
    // Do not block the upload for that.
    if (error.code === "23505") {
      return {
        ok: true,
        created: false,
        duplicate: true,
      } as const;
    }

    throw error;
  }

  return {
    ok: true,
    created: true,
    notificationId: data?.id ?? null,
  } as const;
}

export async function resolvePhotoReviewNotification(
  supabase: SupabaseClient,
  input: {
    photoId: string;
    resolvedBy: string;
    reviewStatus: string;
    resolvedAt?: string;
  },
) {
  const photoId = String(input.photoId ?? "").trim();
  const resolvedBy = String(input.resolvedBy ?? "").trim();
  const resolvedAt = input.resolvedAt ?? new Date().toISOString();

  if (!photoId) {
    throw new Error(
      "Missing photo id for resolving photo review notification.",
    );
  }

  const { error } = await supabase
    .from("photo_review_notifications")
    .update({
      status: "resolved",
      resolved_at: resolvedAt,
      resolved_by: resolvedBy || null,
      metadata: {
        resolved_review_status: input.reviewStatus,
        resolved_from: "photo_review_action",
      },
    })
    .eq("photo_id", photoId)
    .eq("status", "unread");

  if (error) {
    throw error;
  }

  return { ok: true } as const;
}
