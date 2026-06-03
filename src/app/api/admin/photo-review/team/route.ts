import { NextRequest } from "next/server";
import {
  getSupabaseAdmin,
  isAllowedStaffStatus,
  isCoverageOnNow,
  normalizeTime,
  normalizeTimezone,
  pickStaffEmail,
  requireAdmin,
  routeError,
  type PhotoReviewCoverageRow,
  type PhotoReviewTeamRow,
  type StaffRow,
} from "@/lib/photoReviewAdmin";

export const dynamic = "force-dynamic";

type SaveTeamBody = {
  action: "save_team";
  staff_id: string;
  team_id?: string | null;
  application_status?: string | null;
  email_address?: string | null;
  email_enabled?: boolean | null;
  sms_enabled?: boolean | null;
  phone_number?: string | null;
  timezone?: string | null;
  notes?: string | null;
};

type ReplaceCoverageBody = {
  action: "replace_coverage";
  team_id: string;
  timezone?: string | null;
  coverage: Array<{
    day_of_week: number;
    start_time?: string | null;
    end_time?: string | null;
    is_active?: boolean | null;
  }>;
};

type PatchBody = SaveTeamBody | ReplaceCoverageBody;

function isActiveStaff(row: StaffRow) {
  return row.is_active !== false && isAllowedStaffStatus(row.status);
}

function sortStaff(a: StaffRow, b: StaffRow) {
  const aName = `${a.first_name ?? ""} ${a.last_name ?? ""}`.trim();
  const bName = `${b.first_name ?? ""} ${b.last_name ?? ""}`.trim();
  return aName.localeCompare(bName);
}

export async function GET(req: NextRequest) {
  try {
    await requireAdmin(req);
    const supabase = getSupabaseAdmin();

    const [staffResult, teamResult, coverageResult, notificationsResult] =
      await Promise.all([
        supabase.from("staff").select("*").order("created_at", {
          ascending: false,
        }),
        supabase.from("staff_photo_review_team").select("*").order("created_at", {
          ascending: false,
        }),
        supabase
          .from("staff_photo_review_coverage")
          .select("*")
          .order("day_of_week", { ascending: true }),
        supabase
          .from("staff_photo_review_notifications")
          .select("*")
          .order("created_at", { ascending: false })
          .limit(25),
      ]);

    if (staffResult.error) throw staffResult.error;
    if (teamResult.error) throw teamResult.error;
    if (coverageResult.error) throw coverageResult.error;

    // The notification log should not block the page if that table is still being migrated.
    const notifications = notificationsResult.error
      ? []
      : notificationsResult.data ?? [];

    const staffRows = ((staffResult.data ?? []) as StaffRow[])
      .filter(isActiveStaff)
      .sort(sortStaff);

    const teamRows = (teamResult.data ?? []) as PhotoReviewTeamRow[];
    const coverageRows = (coverageResult.data ?? []) as PhotoReviewCoverageRow[];

    const teamByStaffId = new Map(teamRows.map((row) => [row.staff_id, row]));

    const members = staffRows.map((staff) => {
      const team = teamByStaffId.get(staff.id) ?? null;
      const memberCoverage = team
        ? coverageRows.filter((row) => row.team_member_id === team.id)
        : [];

      const onDuty =
        !!team &&
        String(team.application_status ?? "").toLowerCase() === "approved" &&
        team.email_enabled !== false &&
        memberCoverage.some((row) => isCoverageOnNow(row));

      return {
        staff,
        team,
        coverage: memberCoverage,
        inferred_email: pickStaffEmail(staff),
        on_duty: onDuty,
      };
    });

    return Response.json({
      members,
      notifications,
      counts: {
        active_staff: staffRows.length,
        configured_reviewers: members.filter((m) => !!m.team).length,
        email_enabled: members.filter((m) => m.team?.email_enabled !== false && !!m.team)
          .length,
        on_duty: members.filter((m) => m.on_duty).length,
      },
    });
  } catch (error) {
    return routeError(error);
  }
}

export async function POST(req: NextRequest) {
  try {
    await requireAdmin(req);
    const supabase = getSupabaseAdmin();
    const body = await req.json().catch(() => ({}));

    if (body?.action !== "sync_active_staff") {
      return Response.json({ error: "Unknown action." }, { status: 400 });
    }

    const { data: staffRows, error: staffError } = await supabase
      .from("staff")
      .select("*");

    if (staffError) throw staffError;

    const activeStaff = ((staffRows ?? []) as StaffRow[]).filter(isActiveStaff);

    const rowsToUpsert = activeStaff.map((staff) => ({
      staff_id: staff.id,
      application_status: "approved",
      email_address: pickStaffEmail(staff),
      email_enabled: true,
      sms_enabled: false,
      timezone: "America/New_York",
      updated_at: new Date().toISOString(),
    }));

    if (rowsToUpsert.length === 0) {
      return Response.json({ ok: true, upserted: 0 });
    }

    const { error: upsertError } = await supabase
      .from("staff_photo_review_team")
      .upsert(rowsToUpsert, {
        onConflict: "staff_id",
        ignoreDuplicates: false,
      });

    if (upsertError) throw upsertError;

    return Response.json({ ok: true, upserted: rowsToUpsert.length });
  } catch (error) {
    return routeError(error);
  }
}

export async function PATCH(req: NextRequest) {
  try {
    await requireAdmin(req);
    const supabase = getSupabaseAdmin();
    const body = (await req.json().catch(() => ({}))) as PatchBody;

    if (body.action === "save_team") {
      if (!body.staff_id) {
        return Response.json({ error: "staff_id is required." }, { status: 400 });
      }

      const row = {
        staff_id: body.staff_id,
        application_status: body.application_status ?? "approved",
        email_address: String(body.email_address ?? "").trim() || null,
        email_enabled: body.email_enabled !== false,
        sms_enabled: body.sms_enabled === true,
        phone_number: String(body.phone_number ?? "").trim() || null,
        timezone: normalizeTimezone(body.timezone),
        notes: String(body.notes ?? "").trim() || null,
        updated_at: new Date().toISOString(),
      };

      const { data, error } = await supabase
        .from("staff_photo_review_team")
        .upsert(row, {
          onConflict: "staff_id",
          ignoreDuplicates: false,
        })
        .select("*")
        .single();

      if (error) throw error;

      return Response.json({ ok: true, team: data });
    }

    if (body.action === "replace_coverage") {
      if (!body.team_id) {
        return Response.json({ error: "team_id is required." }, { status: 400 });
      }

      const timezone = normalizeTimezone(body.timezone);
      const rows = (body.coverage ?? [])
        .filter((row) => row.is_active !== false)
        .map((row) => {
          const start = normalizeTime(row.start_time);
          const end = normalizeTime(row.end_time);

          if (start == null || end == null) return null;

          return {
            team_member_id: body.team_id,
            day_of_week: Number(row.day_of_week),
            start_time: start,
            end_time: end,
            timezone,
            is_active: true,
            updated_at: new Date().toISOString(),
          };
        })
        .filter(Boolean);

      const { error: deleteError } = await supabase
        .from("staff_photo_review_coverage")
        .delete()
        .eq("team_member_id", body.team_id);

      if (deleteError) throw deleteError;

      if (rows.length > 0) {
        const { error: insertError } = await supabase
          .from("staff_photo_review_coverage")
          .insert(rows);

        if (insertError) throw insertError;
      }

      return Response.json({ ok: true, coverage_count: rows.length });
    }

    return Response.json({ error: "Unknown action." }, { status: 400 });
  } catch (error) {
    return routeError(error);
  }
}
