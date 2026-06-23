import { NextRequest, NextResponse } from "next/server";
import { apiError, assertPortalAdmin, STAFF_SELECT, upsertStaffByEmail } from "@/lib/portalStaffAccess";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  try {
    const { supabase } = await assertPortalAdmin(req);

    const [staffResult, applicationsResult] = await Promise.all([
      supabase
        .from("staff")
        .select(STAFF_SELECT)
        .order("status", { ascending: true })
        .order("created_at", { ascending: false }),
      supabase
        .from("staff_applications")
        .select(
          "id,first_name,last_name,email,phone,request_role,why_joining,experience,values_alignment,status,created_at"
        )
        .or("status.is.null,status.eq.submitted,status.eq.pending,status.eq.new")
        .order("created_at", { ascending: false }),
    ]);

    if (staffResult.error) throw staffResult.error;
    if (applicationsResult.error) throw applicationsResult.error;

    return NextResponse.json({
      staff: staffResult.data || [],
      applications: applicationsResult.data || [],
    });
  } catch (e) {
    const { message, status } = apiError(e);
    return NextResponse.json({ error: message }, { status });
  }
}

export async function POST(req: NextRequest) {
  try {
    const { supabase } = await assertPortalAdmin(req);
    const body = await req.json();

    const staff = await upsertStaffByEmail(supabase, body, {
      origin: req.nextUrl.origin,
      inviteIfMissing: true,
    });

    return NextResponse.json({ staff });
  } catch (e) {
    const { message, status } = apiError(e);
    return NextResponse.json({ error: message }, { status });
  }
}
