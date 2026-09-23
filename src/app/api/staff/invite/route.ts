import { NextResponse } from "next/server";

import { createSupabaseServiceClient } from "@/lib/supabaseService";

async function requireAdmin(userId: string) {
  const svc = createSupabaseServiceClient();
  const { data } = await svc
    .from("staff")
    .select("id, role, is_active")
    .eq("user_id", userId)
    .eq("is_active", true)
    .maybeSingle();

  return !!data && data.role === "admin";
}

export async function POST(req: Request) {
  const supabase = await createSupabaseServiceClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const ok = await requireAdmin(user.id);
  if (!ok) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const body = await req.json().catch(() => ({}));
  const application_id = String(body.application_id ?? "").trim();
  if (!application_id) return NextResponse.json({ error: "Missing application_id" }, { status: 400 });

  const svc = createSupabaseServiceClient();

  const { data: appRow, error: appErr } = await svc
    .from("staff_applications")
    .select("id,email,status")
    .eq("id", application_id)
    .maybeSingle();

  if (appErr) return NextResponse.json({ error: appErr.message }, { status: 500 });
  if (!appRow) return NextResponse.json({ error: "Application not found" }, { status: 404 });
  if (appRow.status !== "submitted") {
    return NextResponse.json({ error: "Only submitted applications can be invited." }, { status: 400 });
  }

  const email = String(appRow.email).toLowerCase();

  // Send invite email via Supabase Admin
  const { data: inviteData, error: inviteErr } = await svc.auth.admin.inviteUserByEmail(email);
  if (inviteErr) return NextResponse.json({ error: inviteErr.message }, { status: 500 });

  const invitedUserId = inviteData?.user?.id ?? null;

  const { error: upErr } = await svc
    .from("staff_applications")
    .update({
      status: "invited",
      invited_at: new Date().toISOString(),
      invited_by: user.id,
      invite_sent_to: email,
      invited_user_id: invitedUserId,
      updated_at: new Date().toISOString(),
    })
    .eq("id", application_id);

  if (upErr) return NextResponse.json({ error: upErr.message }, { status: 500 });

  return NextResponse.json({ ok: true, invited_user_id: invitedUserId });
}
