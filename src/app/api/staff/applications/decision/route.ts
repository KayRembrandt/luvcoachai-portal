import { NextRequest, NextResponse } from "next/server";
import {
  apiError,
  assertPortalAdmin,
  defaultPermissions,
  normalizeRole,
  upsertStaffByEmail,
} from "@/lib/portalStaffAccess";

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  try {
    const { supabase, user } = await assertPortalAdmin(req);
    const body = await req.json();

    const applicationId = String(body?.application_id || "").trim();
    const action = String(body?.action || "").trim().toLowerCase();

    if (!applicationId) {
      return NextResponse.json({ error: "application_id is required." }, { status: 400 });
    }

    if (!["approve", "reject"].includes(action)) {
      return NextResponse.json({ error: "Action must be approve or reject." }, { status: 400 });
    }

    const { data: application, error: applicationError } = await supabase
      .from("staff_applications")
      .select("id,first_name,last_name,email,request_role,status")
      .eq("id", applicationId)
      .single();

    if (applicationError) throw applicationError;
    if (!application) {
      return NextResponse.json({ error: "Application not found." }, { status: 404 });
    }

    if (action === "reject") {
      const { error: rejectError } = await supabase
        .from("staff_applications")
        .update({
          status: "rejected",
          reviewed_at: new Date().toISOString(),
          reviewed_by: user.id,
          updated_at: new Date().toISOString(),
        })
        .eq("id", applicationId);

      if (rejectError) throw rejectError;
      return NextResponse.json({ ok: true, status: "rejected" });
    }

    const role = normalizeRole(body?.role || application.request_role || "staff");
    const staff = await upsertStaffByEmail(
      supabase,
      {
        email: application.email,
        first_name: application.first_name,
        last_name: application.last_name,
        role,
        status: "active",
        permissions: defaultPermissions[role],
      },
      {
        origin: req.nextUrl.origin,
        inviteIfMissing: true,
      }
    );

    const { error: approveError } = await supabase
      .from("staff_applications")
      .update({
        status: "approved",
        reviewed_at: new Date().toISOString(),
        reviewed_by: user.id,
        updated_at: new Date().toISOString(),
      })
      .eq("id", applicationId);

    if (approveError) throw approveError;

    return NextResponse.json({ ok: true, status: "approved", staff });
  } catch (e) {
    const { message, status } = apiError(e);
    return NextResponse.json({ error: message }, { status });
  }
}
