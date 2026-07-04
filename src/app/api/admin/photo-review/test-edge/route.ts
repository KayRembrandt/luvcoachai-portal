import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

type Json = Record<string, unknown>;

type AdminDb = {
  from: (table: string) => any;
};

function requiredEnv(name: string) {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`Missing required environment variable: ${name}`);
  return value;
}

function cleanEmail(value: unknown) {
  const email = String(value ?? "").trim();
  if (!email || !email.includes("@")) return null;
  return email;
}

function getServiceClient(): AdminDb {
  return createClient(
    requiredEnv("NEXT_PUBLIC_SUPABASE_URL"),
    requiredEnv("SUPABASE_SERVICE_ROLE_KEY"),
    { auth: { persistSession: false, autoRefreshToken: false } }
  ) as unknown as AdminDb;
}

function getAnonClient() {
  return createClient(
    requiredEnv("NEXT_PUBLIC_SUPABASE_URL"),
    requiredEnv("NEXT_PUBLIC_SUPABASE_ANON_KEY"),
    { auth: { persistSession: false, autoRefreshToken: false } }
  );
}

async function requireAdminOrHenry(req: Request, db: AdminDb) {
  const token = req.headers.get("authorization")?.match(/^Bearer\s+(.+)$/i)?.[1] ?? null;

  if (!token) {
    return {
      ok: false as const,
      response: NextResponse.json({ error: "Unauthorized" }, { status: 401 }),
    };
  }

  const anon = getAnonClient();
  const { data: userRes, error: userError } = await anon.auth.getUser(token);

  if (userError || !userRes?.user?.id) {
    return {
      ok: false as const,
      response: NextResponse.json({ error: "Unauthorized" }, { status: 401 }),
    };
  }

  const { data: staff, error: staffError } = await db
    .from("staff")
    .select("id, auth_user_id, role, is_active, status, email")
    .eq("auth_user_id", userRes.user.id)
    .maybeSingle();

  if (staffError) {
    return {
      ok: false as const,
      response: NextResponse.json({ error: staffError.message }, { status: 500 }),
    };
  }

  const role = String(staff?.role ?? "").toLowerCase().trim();
  const status = String(staff?.status ?? "active").toLowerCase().trim();
  const active = staff?.is_active !== false;

  if (!staff || !active || !["active", "approved"].includes(status) || !["admin", "henry"].includes(role)) {
    return {
      ok: false as const,
      response: NextResponse.json(
        { error: "Forbidden", debug: { role, status, active, staff_found: Boolean(staff) } },
        { status: 403 }
      ),
    };
  }

  return { ok: true as const, user: { id: userRes.user.id }, staff: staff as Json };
}

async function callEdgeTestEmail(input: {
  recipientEmail: string;
  recipientName: string | null;
  teamId: string | null;
}) {
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
      mode: "test",
      recipient_email: input.recipientEmail,
      recipient_name: input.recipientName,
      team_id: input.teamId,
    }),
  });

  const json = await response.json().catch(() => ({}));

  if (!response.ok || json?.ok === false) {
    throw new Error(json?.error ?? json?.reason ?? `Edge Function failed (${response.status})`);
  }

  return json;
}

export async function POST(req: Request) {
  try {
    const db = getServiceClient();
    const auth = await requireAdminOrHenry(req, db);
    if (!auth.ok) return auth.response;

    const body = (await req.json().catch(() => ({}))) as Json;
    const recipientEmail = cleanEmail(body.recipient_email ?? body.email);
    const recipientName = String(body.recipient_name ?? body.name ?? "").trim() || null;
    const teamId = String(body.team_id ?? "").trim() || null;

    if (!recipientEmail) {
      return NextResponse.json(
        {
          error: "Missing recipient_email for test email.",
          received_body_keys: Object.keys(body),
        },
        { status: 400 }
      );
    }

    const edge = await callEdgeTestEmail({ recipientEmail, recipientName, teamId });

    return NextResponse.json({
      ok: true,
      sent: true,
      recipient_email: recipientEmail,
      team_id: teamId,
      edge,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Server error";
    console.error("photo-review test edge email failed:", error);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
