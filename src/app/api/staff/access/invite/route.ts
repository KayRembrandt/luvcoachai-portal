import { NextRequest, NextResponse } from "next/server";
import {
  apiError,
  assertPortalAdmin,
  normalizeEmail,
} from "@/lib/portalStaffAccess";

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  try {
    const { supabase } = await assertPortalAdmin(req);
    const body = await req.json();

    const email = normalizeEmail(body.email);

    if (!email || !/^\S+@\S+\.\S+$/.test(email)) {
      const error = new Error("A valid email is required.");
      (error as any).status = 400;
      throw error;
    }

    const siteUrl =
      process.env.NEXT_PUBLIC_SITE_URL ||
      process.env.NEXT_PUBLIC_APP_URL ||
      req.nextUrl.origin;

    const redirectTo = `${siteUrl}/login?next=/admin`;

    const { data, error } = await supabase.auth.admin.inviteUserByEmail(email, {
      redirectTo,
    });

    if (error) throw error;

    await supabase
      .from("staff")
      .update({
        invite_sent_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })
      .eq("email", email);

    return NextResponse.json({
      ok: true,
      user: data.user ?? null,
    });
  } catch (e) {
    const { message, status } = apiError(e);
    return NextResponse.json({ error: message }, { status });
  }
}