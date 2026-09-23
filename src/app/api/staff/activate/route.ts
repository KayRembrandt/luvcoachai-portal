import { NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabaseServer";
import { createSupabaseServiceClient } from "@/lib/supabaseService";
import { createClient } from "@supabase/supabase-js";


async function requireAdmin(userId: string) {
  const db = createSupabaseServiceClient();
  const { data, error } = await db
    .from("staff")
    .select("role,is_active,status")
    .eq("auth_user_id", userId)
    .maybeSingle();

  if (error) throw new Error(error.message);
  if (!data) return false;
  if (data.is_active === false) return false;

  const status = String(data.status ?? "").toLowerCase();
  const okStatus = status === "" || status === "active" || status === "approved";

  return okStatus && String(data.role).toLowerCase() === "admin";
}

function getBearerToken(req: Request) {
  const h = req.headers.get("authorization") || "";
  const m = h.match(/^Bearer\s+(.+)$/i);
  return m?.[1] ?? null;
}

async function getUserFromBearer(req: Request) {
  const token = getBearerToken(req);
  if (!token) return { user: null, error: "Missing bearer token" };

  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  );

  const { data, error } = await supabase.auth.getUser(token);
  if (error || !data?.user) return { user: null, error: error?.message ?? "Invalid token" };

  return { user: data.user, error: null };
}

export async function POST(req: Request) {
  try {

const { user: reviewer, error: authErr } = await getUserFromBearer(req);
if (!reviewer) return NextResponse.json({ error: "Unauthorized: " + authErr }, { status: 401 });



    const ok = await requireAdmin(reviewer.id);
    if (!ok) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

    const body = await req.json().catch(() => ({}));
    const application_id = String(body.application_id || "");
    const action = String(body.action || "");

    if (!application_id) {
      return NextResponse.json({ error: "application_id is required" }, { status: 400 });
    }
    if (!["approve", "reject"].includes(action)) {
      return NextResponse.json({ error: "action must be approve|reject" }, { status: 400 });
    }

    const db = createSupabaseServiceClient(); // service role
// use db.from(...).update/upsert...


    const { data: app, error: appErr } = await db
      .from("staff_applications")
      .select("*")
      .eq("id", application_id)
      .single();

    if (appErr) return NextResponse.json({ error: appErr.message }, { status: 400 });

    const now = new Date().toISOString();

    if (action === "reject") {
      const { error } = await db
        .from("staff_applications")
        .update({
          status: "rejected",
          reviewed_by: reviewer.id,
          reviewed_at: now,
        })
        .eq("id", application_id);

      if (error) return NextResponse.json({ error: error.message }, { status: 400 });
      return NextResponse.json({ ok: true });
    }

    // APPROVE
    const email = String(app.email || "").trim().toLowerCase();
    const requested = String(app.request_role || "staff").toLowerCase();
    const role = requested === "henry" ? "henry" : "staff"; // never grant admin via applications


    // 1) Ensure Auth user exists (create if missing)
    // NOTE: This uses service role and supabase-js admin API.
    let userId: string | null = null;

    const list = await db.auth.admin.listUsers({ page: 1, perPage: 200 });
    const found = list?.data?.users?.find((u) => (u.email || "").toLowerCase() === email);
    if (found?.id) {
      userId = found.id;
    } else {
      // Create user with a temporary password reset email approach
      const created = await db.auth.admin.createUser({
        email,
        email_confirm: true,
      });
      if (created.error) {
        return NextResponse.json({ error: created.error.message }, { status: 400 });
      }
      userId = created.data.user?.id ?? null;
    }
console.log("applicant auth_user_id:", userId);
    if (!userId) return NextResponse.json({ error: "Could not create/find auth user" }, { status: 500 });

   // 2) Upsert staff row (NOTE: staff table uses id as the auth uid)
const { error: staffErr } = await db.from("staff").upsert(
  {
    id: application_id,
    auth_user_id: userId,
    first_name: app.first_name ?? null,
    last_name: app.last_name ?? null,
    display_name:
      [app.first_name, app.last_name].filter(Boolean).join(" ") || app.email || null,
    role,
    status: "active",
    is_active: true,
    approved_by: reviewer.id,
    approved_at: now,
  },
  { onConflict: "id" }
);
console.log("=== STAFF ACTIVATE DEBUG ===");
console.log("application_id:", application_id);
console.log("app.email:", app.email);
console.log("app.first_name:", app.first_name);
console.log("app.last_name:", app.last_name);

if (staffErr) return NextResponse.json({ error: staffErr.message }, { status: 400 });


    // 3) Mark application approved
    const { error: updErr } = await db
      .from("staff_applications")
      .update({
        status: "approved",
        reviewed_by: reviewer.id,
        reviewed_at: now,
      })
      .eq("id", application_id);
console.log("=== STAFF ACTIVATE DEBUG ===");
console.log("reviewer (admin) id:", reviewer.id);
console.log("application_id:", application_id);
console.log("app.email:", app.email);
console.log("app.first_name:", app.first_name);
console.log("app.last_name:", app.last_name);
console.log("applicant auth_user_id:", userId);
console.log("about to write staff row:", {
  id: application_id,
  auth_user_id: userId,
  role,
});
    if (updErr) return NextResponse.json({ error: updErr.message }, { status: 400 });
console.log("reviewer (admin) id:", reviewer.id);
    return NextResponse.json({ ok: true });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || "Unexpected error" }, { status: 500 });
  }
}
