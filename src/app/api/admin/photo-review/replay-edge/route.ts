import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

type JsonObject = Record<string, unknown>;

type SupabaseLooseClient = {
  auth: {
    getUser: (jwt?: string) => Promise<any>;
  };
  from: (table: string) => any;
  rpc: (functionName: string, args?: Record<string, unknown>) => Promise<{ data: any; error: any }>;
};

type PendingPhoto = {
  id: string;
  user_id: string;
  photo_kind?: string | null;
  review_status?: string | null;
};

type OnShiftReviewer = {
  team_member_id: string;
  staff_id: string;
  email_address?: string | null;
  email_enabled?: boolean | null;
  sms_enabled?: boolean | null;
  phone_number?: string | null;
  shift_timezone?: string | null;
};

type NotificationRow = {
  id: string;
  photo_id: string;
  staff_id?: string | null;
  team_member_id?: string | null;
  email_status?: string | null;
  status?: string | null;
};

type AuthDenied = {
  ok: false;
  response: NextResponse;
};

type AuthAllowed = {
  ok: true;
  staff: any;
  user: any;
  svc: SupabaseLooseClient;
};

type AuthResult = AuthDenied | AuthAllowed;

function requiredEnv(name: string) {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`Missing required environment variable: ${name}`);
  return value;
}

function getServiceSupabase(): SupabaseLooseClient {
  return createClient(
    requiredEnv("NEXT_PUBLIC_SUPABASE_URL"),
    requiredEnv("SUPABASE_SERVICE_ROLE_KEY"),
    { auth: { persistSession: false, autoRefreshToken: false } },
  ) as unknown as SupabaseLooseClient;
}

function getAnonSupabase(): SupabaseLooseClient {
  return createClient(
    requiredEnv("NEXT_PUBLIC_SUPABASE_URL"),
    requiredEnv("NEXT_PUBLIC_SUPABASE_ANON_KEY"),
    { auth: { persistSession: false, autoRefreshToken: false } },
  ) as unknown as SupabaseLooseClient;
}

function photoLabel(photoKind: unknown) {
  const kind = String(photoKind ?? "profile_photo")
    .toLowerCase()
    .trim()
    .replaceAll("-", "_");

  if (["identity_selfie", "identify_selfie", "selfie", "verification_selfie"].includes(kind)) {
    return "identity selfie";
  }

  if (["verification_photo", "verify_photo"].includes(kind)) {
    return "verification photo";
  }

  if (["profile_photo", "profile", "photo"].includes(kind)) {
    return "profile photo";
  }

  return kind.replaceAll("_", " ") || "photo";
}

function normalizePhotoKind(photoKind: unknown) {
  return (
    String(photoKind ?? "profile_photo")
      .toLowerCase()
      .trim()
      .replaceAll("-", "_") || "profile_photo"
  );
}

async function requireAdminOrHenry(req: Request): Promise<AuthResult> {
  const token = req.headers.get("authorization")?.match(/^Bearer\s+(.+)$/i)?.[1] ?? null;
  if (!token) {
    return { ok: false, response: NextResponse.json({ error: "Unauthorized" }, { status: 401 }) };
  }

  const anon = getAnonSupabase();
  const { data: userRes, error: userError } = await anon.auth.getUser(token);

  if (userError || !userRes?.user?.id) {
    return { ok: false, response: NextResponse.json({ error: "Unauthorized" }, { status: 401 }) };
  }

  const svc = getServiceSupabase();
  const { data: staff, error: staffError } = await svc
    .from("staff")
    .select("id, auth_user_id, role, is_active, status, email")
    .eq("auth_user_id", userRes.user.id)
    .maybeSingle();

  if (staffError) {
    return { ok: false, response: NextResponse.json({ error: staffError.message }, { status: 500 }) };
  }

  const role = String(staff?.role ?? "").toLowerCase().trim();
  const status = String(staff?.status ?? "active").toLowerCase().trim();
  const active = staff?.is_active !== false;

  if (!staff || !active || !["active", "approved"].includes(status) || !["admin", "henry"].includes(role)) {
    return {
      ok: false,
      response: NextResponse.json(
        { error: "Forbidden", debug: { role, status, active, staff_found: Boolean(staff) } },
        { status: 403 },
      ),
    };
  }

  return { ok: true, staff, user: userRes.user, svc };
}

async function getOnShiftReviewers(svc: SupabaseLooseClient) {
  const { data, error } = await svc.rpc("get_on_shift_staff_photo_review_team");
  if (error) throw error;
  return ((data ?? []) as OnShiftReviewer[]).filter((row) => row.email_enabled !== false);
}

async function fetchPendingPhotos(svc: SupabaseLooseClient) {
  const { data, error } = await svc
    .from("profile_photos")
    .select("id, user_id, photo_kind, review_status")
    .is("archived_at", null)
    .in("review_status", ["pending", "pending_review"])
    .order("created_at", { ascending: true });

  if (error) throw error;
  return (data ?? []) as PendingPhoto[];
}

async function fetchUnreadNotificationsForPhotos(svc: SupabaseLooseClient, photoIds: string[]) {
  if (photoIds.length === 0) return [] as NotificationRow[];

  const { data, error } = await svc
    .from("photo_review_notifications")
    .select("id, photo_id, staff_id, team_member_id, status, email_status")
    .eq("status", "unread")
    .in("photo_id", photoIds);

  if (error) throw error;
  return (data ?? []) as NotificationRow[];
}

async function backfillMissingNotifications(svc: SupabaseLooseClient) {
  const [pendingPhotos, onShiftReviewers] = await Promise.all([
    fetchPendingPhotos(svc),
    getOnShiftReviewers(svc),
  ]);

  const existing = await fetchUnreadNotificationsForPhotos(
    svc,
    pendingPhotos.map((photo) => photo.id),
  );

  const existingPhotoIds = new Set(existing.map((row) => row.photo_id));
  const missingPhotos = pendingPhotos.filter((photo) => !existingPhotoIds.has(photo.id));

  if (missingPhotos.length === 0) {
    return { inserted: [] as NotificationRow[], missing_photo_count: 0, on_shift_count: onShiftReviewers.length };
  }

  const rowsToInsert: JsonObject[] = [];

  for (const photo of missingPhotos) {
    const kind = normalizePhotoKind(photo.photo_kind);
    const label = photoLabel(kind);

    if (onShiftReviewers.length > 0) {
      for (const reviewer of onShiftReviewers) {
        rowsToInsert.push({
          photo_id: photo.id,
          user_id: photo.user_id,
          photo_kind: kind,
          staff_id: reviewer.staff_id,
          team_member_id: reviewer.team_member_id,
          type: "photo_review_required",
          title: "Photo review needed",
          message: `A new ${label} needs staff review.`,
          status: "unread",
          metadata: {
            source_table: "profile_photos",
            review_status: photo.review_status ?? "pending",
            photo_kind: kind,
            photo_id: photo.id,
            user_id: photo.user_id,
            recipient_scope: "manual_admin_backfill_on_shift",
            recipient_staff_id: reviewer.staff_id,
            team_member_id: reviewer.team_member_id,
            email_address: reviewer.email_address,
            email_enabled: reviewer.email_enabled,
            sms_enabled: reviewer.sms_enabled,
            phone_number_present: Boolean(reviewer.phone_number),
            shift_timezone: reviewer.shift_timezone,
            backfilled_at: new Date().toISOString(),
          },
        });
      }
    } else {
      rowsToInsert.push({
        photo_id: photo.id,
        user_id: photo.user_id,
        photo_kind: kind,
        staff_id: null,
        team_member_id: null,
        type: "photo_review_required",
        title: "Photo review needed",
        message: `A new ${label} needs staff review.`,
        status: "unread",
        metadata: {
          source_table: "profile_photos",
          review_status: photo.review_status ?? "pending",
          photo_kind: kind,
          photo_id: photo.id,
          user_id: photo.user_id,
          recipient_scope: "manual_admin_backfill_fallback_no_on_shift_reviewer",
          backfilled_at: new Date().toISOString(),
        },
      });
    }
  }

  const { data, error } = await svc
    .from("photo_review_notifications")
    .insert(rowsToInsert)
    .select("id, photo_id, staff_id, team_member_id, status, email_status");

  // Unique conflicts can happen if the database webhook/trigger creates rows at the same time.
  // Return a soft result instead of breaking the admin action.
  if (error) {
    return {
      inserted: [] as NotificationRow[],
      missing_photo_count: missingPhotos.length,
      on_shift_count: onShiftReviewers.length,
      insert_error: error.message,
    };
  }

  return {
    inserted: (data ?? []) as NotificationRow[],
    missing_photo_count: missingPhotos.length,
    on_shift_count: onShiftReviewers.length,
  };
}

async function fetchPendingEmailNotifications(svc: SupabaseLooseClient, limit: number) {
  const { data, error } = await svc
    .from("photo_review_notifications")
    .select("id, photo_id, staff_id, team_member_id, status, email_status")
    .eq("status", "unread")
    .in("email_status", ["pending", "failed"])
    .order("created_at", { ascending: true })
    .limit(limit);

  if (error) throw error;
  return (data ?? []) as NotificationRow[];
}

async function invokeEdgeNotification(notificationId: string) {
  const supabaseUrl = requiredEnv("NEXT_PUBLIC_SUPABASE_URL").replace(/\/+$/, "");
  const edgeUrl = `${supabaseUrl}/functions/v1/send-photo-review-notification`;
  const secret = requiredEnv("PHOTO_REVIEW_WEBHOOK_SECRET");

  const response = await fetch(edgeUrl, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-luvcoach-webhook-secret": secret,
    },
    body: JSON.stringify({
      type: "INSERT",
      schema: "public",
      table: "photo_review_notifications",
      record: { id: notificationId },
    }),
  });

  const json = await response.json().catch(() => ({}));

  return {
    notification_id: notificationId,
    http_status: response.status,
    ok: response.ok && json?.ok !== false,
    skipped: Boolean(json?.skipped),
    provider_id: json?.provider_id ?? null,
    recipient_count: Number(json?.recipient_count ?? 0),
    error: json?.error ?? json?.reason ?? null,
    raw: json,
  };
}

export async function POST(req: Request) {
  try {
    const auth = await requireAdminOrHenry(req);
    if (!auth.ok) return auth.response;

    const svc = auth.svc;

    const body = await req.json().catch(() => ({}));
    const limit = Math.min(Math.max(Number(body.limit ?? 25), 1), 100);
    const shouldBackfill = body.backfill_missing !== false;

    const backfill = shouldBackfill
      ? await backfillMissingNotifications(svc)
      : { inserted: [] as NotificationRow[], missing_photo_count: 0, on_shift_count: 0 };

    const pending = await fetchPendingEmailNotifications(svc, limit);

    const results = [];
    for (const row of pending) {
      results.push(await invokeEdgeNotification(row.id));
    }

    const sent = results.filter((row) => row.ok && !row.skipped && row.recipient_count > 0).length;
    const skipped = results.filter((row) => row.ok && row.skipped).length;
    const failed = results.filter((row) => !row.ok).length;

    return NextResponse.json({
      ok: true,
      summary: {
        backfill_missing: shouldBackfill,
        missing_photo_count: backfill.missing_photo_count,
        inserted_notification_count: backfill.inserted.length,
        on_shift_count: backfill.on_shift_count,
        pending_email_notifications_found: pending.length,
        edge_invocations_attempted: results.length,
        sent,
        skipped,
        failed,
        insert_error: "insert_error" in backfill ? backfill.insert_error : null,
      },
      backfill,
      results,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Server error";
    console.error("photo-review replay edge failed:", error);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
