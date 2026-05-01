// src/app/api/user-search/route.ts
import { NextResponse } from "next/server";
import { createSupabaseServiceClient } from "@/lib/supabaseService";

type ProfileRow = {
  id: string;
  email: string | null;
  screen_name: string | null;
  legal_first_name: string | null;
  legal_last_name: string | null;
  preferred_name: string | null;
  display_name: string | null;
  is_verified: boolean | null;
  verification_status: string | null;
  membership_tier: string | null;
  subscription_status: string | null;
  onboarded: boolean | null;
  onboarding_completed: boolean | null;
  show_in_connections: boolean | null;
  is_active_for_connections: boolean | null;
  updated_at: string | null;
};

export async function POST(req: Request) {
  const body = await req.json().catch(() => ({}));
  const email = String(body.email ?? "").trim();
  const first_name = String(body.first_name ?? "").trim();
  const last_name = String(body.last_name ?? "").trim();

  // ✅ Service role can read regardless of RLS (portal admin/staff tool)
  const supabase = createSupabaseServiceClient();

  let q = supabase
    .from("profiles")
    .select(
      [
        "id",
        "email",
        "screen_name",
        "preferred_name",
        "display_name",
        "legal_first_name",
        "legal_last_name",
        "is_verified",
        "verification_status",
        "membership_tier",
        "subscription_status",
        "onboarded",
        "onboarding_completed",
        "show_in_connections",
        "is_active_for_connections",
        "updated_at",
      ].join(",")
    )
    .limit(25);

  if (email) {
    // case-insensitive exact match
    q = q.ilike("email", email);
  } else {
    // staff rule: last name required if email not provided
    q = q.ilike("legal_last_name", `%${last_name}%`);
    if (first_name) q = q.ilike("legal_first_name", `%${first_name}%`);
  }

  const { data, error } = (await q) as { data: ProfileRow[] | null; error: any };

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 400 });
  }

  return NextResponse.json({
    results: (data ?? []).map((p) => ({
      id: p.id,
      email: p.email,
      screen_name: p.screen_name,
      first_name: p.legal_first_name,
      last_name: p.legal_last_name,
      preferred_name: p.preferred_name,
      display_name: p.display_name,
      is_verified: p.is_verified,
      verification_status: p.verification_status,
      membership_tier: p.membership_tier,
      subscription_status: p.subscription_status,
      onboarded: p.onboarded,
      onboarding_completed: p.onboarding_completed,
      show_in_connections: p.show_in_connections,
      is_active_for_connections: p.is_active_for_connections,
      updated_at: p.updated_at,
    })),
  });
}
