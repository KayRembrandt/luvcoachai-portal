import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { createServerClient } from "@supabase/ssr";
import { createClient } from "@supabase/supabase-js";

type ReviewStatus = "approved" | "needs_attention" | "rejected";
type Actor = "staff" | "admin";

type CookieToSet = {
  name: string;
  value: string;
  options?: Record<string, any>;
};

function getServiceSupabase() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    {
      auth: { persistSession: false },
    }
  );
}

function isAllowedStaffStatus(status: unknown) {
  const s = String(status ?? "").toLowerCase();
  return s === "active" || s === "approved";
}

async function createRouteSupabase() {
  const cookieStore = await cookies();
  const pending: CookieToSet[] = [];

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll(cookiesToSet) {
          pending.push(...(cookiesToSet as CookieToSet[]));
          for (const c of cookiesToSet as CookieToSet[]) {
            try {
              cookieStore.set(c.name, c.value, c.options);
            } catch {
              // response cookies still applied below
            }
          }
        },
      },
    }
  );

  const withCookies = (res: NextResponse) => {
    for (const c of pending) {
      res.cookies.set(c.name, c.value, c.options);
    }
    return res;
  };

  return { supabase, withCookies, cookieStore };
}

export async function POST(req: Request) {
  try {
    const { supabase, withCookies, cookieStore } = await createRouteSupabase();

    let user: { id: string; email?: string | null } | null = null;

    // 1) Try cookie auth first
    const { data: cookieUserRes, error: cookieUserErr } =
      await supabase.auth.getUser();

    if (cookieUserErr) {
      console.error("photos/review auth.getUser error (cookie):", cookieUserErr);
    }

    user = cookieUserRes?.user ?? null;

    // 2) Fallback to bearer token from the browser request
    if (!user) {
      const authHeader = req.headers.get("authorization") || "";
      const token = authHeader.match(/^Bearer\s+(.+)$/i)?.[1] ?? null;

      console.log("photos/review bearer token present:", !!token);

      if (token) {
        const { data: bearerUserRes, error: bearerUserErr } =
          await supabase.auth.getUser(token);

        if (bearerUserErr) {
          console.error(
            "photos/review auth.getUser error (bearer):",
            bearerUserErr
          );
        }

        user = bearerUserRes?.user ?? null;
      }
    }

    if (!user) {
      return withCookies(
        NextResponse.json(
          {
            error: "Unauthorized",
            debug: {
              reason: "No authenticated user from cookie or bearer token",
              cookie_names: cookieStore.getAll().map((c) => c.name),
            },
          },
          { status: 401 }
        )
      );
    }

    const svc = getServiceSupabase();

    const { data: staff, error: staffErr } = await svc
      .from("staff")
      .select("id, auth_user_id, role, is_active, status, first_name")
      .eq("auth_user_id", user.id)
      .maybeSingle();

    if (staffErr) {
      console.error("photos/review staff lookup error:", staffErr);
      return withCookies(
        NextResponse.json({ error: staffErr.message }, { status: 500 })
      );
    }

    const role = String(staff?.role ?? "").toLowerCase();
    const active = staff?.is_active !== false;
    const okStatus = isAllowedStaffStatus(staff?.status);

    const canReview =
      !!staff &&
      active &&
      okStatus &&
      (role === "admin" || role === "henry" || role === "staff");

    console.log("REVIEW auth user:", {
      id: user.id,
      email: user.email ?? null,
    });

    console.log("REVIEW staff row:", staff ?? null);

    if (!canReview) {
      return withCookies(
        NextResponse.json(
          {
            error: "Forbidden",
            debug: {
              auth_user_id: user.id,
              auth_email: user.email ?? null,
              staff_found: !!staff,
              staff_row: staff ?? null,
              role,
              active,
              okStatus,
            },
          },
          { status: 403 }
        )
      );
    }

    const body = await req.json().catch(() => ({}));

    const photo_id = String(body.photo_id ?? "");
    const status = String(body.status ?? "") as ReviewStatus;
    const notes = body.notes != null ? String(body.notes) : null;
    const actor =
      (String(body.actor ?? "staff").toLowerCase() as Actor) || "staff";

    if (!photo_id || !status) {
      return withCookies(
        NextResponse.json(
          { error: "Missing photo_id or status" },
          { status: 400 }
        )
      );
    }

    if (!["approved", "needs_attention", "rejected"].includes(status)) {
      return withCookies(
        NextResponse.json({ error: "Invalid status" }, { status: 400 })
      );
    }

    const now = new Date().toISOString();

    const payload: Record<string, any> = {
      review_status: status,
      reviewed_at: now,
    };

    if (actor === "admin") {
      payload.admin_reviewed_at = now;
      payload.admin_reviewed_by = staff.id;
      payload.admin_notes = notes;
    } else {
      payload.staff_reviewed_at = now;
      payload.staff_reviewed_by = staff.id;
      payload.staff_notes = notes;
    }

    const { error: updErr } = await svc
      .from("profile_photos")
      .update(payload)
      .eq("id", photo_id);

    if (updErr) {
      console.error("photos/review update error:", updErr);
      return withCookies(
        NextResponse.json({ error: updErr.message }, { status: 500 })
      );
    }

    return withCookies(
      NextResponse.json({
        ok: true,
        debug: {
          auth_user_id: user.id,
          staff_id: staff.id,
          role,
          photo_id,
          status,
          actor,
        },
      })
    );
  } catch (e: any) {
    console.error("photos/review fatal:", e);
    return NextResponse.json(
      { error: e?.message ?? "Server error" },
      { status: 500 }
    );
  }
}