import { NextRequest } from "next/server";
import {
  getSupabaseAdmin,
  isCoverageOnNow,
  normalizeTimezone,
  requireAdmin,
  routeError,
  staffDisplayName,
  type PhotoReviewCoverageRow,
  type PhotoReviewTeamRow,
  type StaffRow,
} from "@/lib/photoReviewAdmin";

export const dynamic = "force-dynamic";

type NotifyBody = {
  mode?: "queue" | "test";
  team_id?: string | null;
  force?: boolean | null;
};

function envOrDefault(name: string, fallback: string) {
  return process.env[name] || fallback;
}

function portalBaseUrl(req: NextRequest) {
  const configured =
    process.env.NEXT_PUBLIC_PORTAL_URL || process.env.NEXT_PUBLIC_APP_URL;

  if (configured) return configured.replace(/\/$/, "");

  const proto = req.headers.get("x-forwarded-proto") ?? "https";
  const host = req.headers.get("host") ?? "localhost:3000";
  return `${proto}://${host}`;
}

async function sendResendEmail(input: {
  to: string;
  subject: string;
  text: string;
  html: string;
}) {
  const apiKey = process.env.RESEND_API_KEY;
  const from = process.env.PHOTO_REVIEW_FROM_EMAIL;

  if (!apiKey) {
    throw new Error("Missing RESEND_API_KEY.");
  }

  if (!from) {
    throw new Error("Missing PHOTO_REVIEW_FROM_EMAIL.");
  }

  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      from,
      to: input.to,
      subject: input.subject,
      text: input.text,
      html: input.html,
    }),
  });

  const json = await res.json().catch(() => ({}));

  if (!res.ok) {
    throw new Error(json?.message ?? json?.error ?? `Resend failed (${res.status})`);
  }

  return json as { id?: string };
}

function isApproved(row: PhotoReviewTeamRow) {
  return String(row.application_status ?? "").toLowerCase() === "approved";
}

function hasEmail(row: PhotoReviewTeamRow) {
  return !!String(row.email_address ?? "").trim();
}

function emailEnabled(row: PhotoReviewTeamRow) {
  return row.email_enabled !== false;
}

export async function POST(req: NextRequest) {
  try {
    const adminActor = await requireAdmin(req);
    const supabase = getSupabaseAdmin();
    const body = (await req.json().catch(() => ({}))) as NotifyBody;

    const mode = body.mode ?? "queue";
    const force = body.force === true;

    const since = new Date(Date.now() - 15 * 60 * 1000).toISOString();

    if (mode === "queue" && !force) {
      const { data: recentSent, error: recentError } = await supabase
        .from("staff_photo_review_notifications")
        .select("id, created_at")
        .eq("channel", "email")
        .eq("status", "sent")
        .gte("created_at", since)
        .limit(1);

      if (!recentError && recentSent && recentSent.length > 0) {
        return Response.json({
          ok: true,
          skipped: true,
          reason: "cooldown",
          message: "A photo-review email was already sent in the last 15 minutes.",
        });
      }
    }

    const [{ count: pendingCount }, teamResult, staffResult, coverageResult] =
      await Promise.all([
        supabase
          .from("profile_photos")
          .select("id", { count: "exact", head: true })
          .in("review_status", ["pending", "needs_attention"]),
        supabase.from("staff_photo_review_team").select("*"),
        supabase.from("staff").select("*"),
        supabase.from("staff_photo_review_coverage").select("*"),
      ]);

    if (teamResult.error) throw teamResult.error;
    if (staffResult.error) throw staffResult.error;
    if (coverageResult.error) throw coverageResult.error;

    const teamRows = (teamResult.data ?? []) as PhotoReviewTeamRow[];
    const staffRows = (staffResult.data ?? []) as StaffRow[];
    const coverageRows = (coverageResult.data ?? []) as PhotoReviewCoverageRow[];

    const staffById = new Map(staffRows.map((row) => [row.id, row]));
    const coverageByTeamId = new Map<string, PhotoReviewCoverageRow[]>();

    for (const coverage of coverageRows) {
      const current = coverageByTeamId.get(coverage.team_member_id) ?? [];
      current.push(coverage);
      coverageByTeamId.set(coverage.team_member_id, current);
    }

    let recipients = teamRows.filter(
      (row) => isApproved(row) && emailEnabled(row) && hasEmail(row)
    );

    if (mode === "test") {
      if (!body.team_id) {
        return Response.json(
          { error: "team_id is required for test notifications." },
          { status: 400 }
        );
      }

      recipients = recipients.filter((row) => row.id === body.team_id);
    } else {
      recipients = recipients.filter((row) => {
        const coverage = coverageByTeamId.get(row.id) ?? [];
        return coverage.some((coverageRow) => isCoverageOnNow(coverageRow));
      });

      // Safety fallback for V1: if no shift rows match, notify approved admins.
      if (recipients.length === 0) {
        recipients = teamRows.filter((row) => {
          const staff = staffById.get(row.staff_id);
          return (
            isApproved(row) &&
            emailEnabled(row) &&
            hasEmail(row) &&
            String(staff?.role ?? "").toLowerCase() === "admin"
          );
        });
      }
    }

    if (recipients.length === 0) {
      await supabase.from("staff_photo_review_notifications").insert({
        channel: "email",
        status: "no_recipients",
        pending_count: pendingCount ?? 0,
        subject: mode === "test" ? "Photo review test" : "Photo review needed",
        message: "No approved email-enabled photo reviewers were available.",
        triggered_by_staff_id: adminActor.staff.id,
        created_at: new Date().toISOString(),
      });

      return Response.json({
        ok: false,
        error: "No approved email-enabled photo reviewers were available.",
        recipients: [],
      });
    }

    const queueUrl = `${portalBaseUrl(req)}/photo-review`;
    const subject = mode === "test" ? "Photo review test" : "Photo review needed";
    const count = pendingCount ?? 0;
    const text =
      mode === "test"
        ? `This is a test notification from the LuvCoachAI photo review system.\n\nOpen Photo Review:\n${queueUrl}`
        : `A profile photo is waiting for review. Pending queue count: ${count}.\n\nOpen Photo Review:\n${queueUrl}`;
    const html = `
      <div style="font-family: Arial, sans-serif; line-height: 1.5; color: #0f172a;">
        <h2 style="margin: 0 0 12px;">${subject}</h2>
        <p>${mode === "test" ? "This is a test notification from the LuvCoachAI photo review system." : `A profile photo is waiting for review. Pending queue count: <strong>${count}</strong>.`}</p>
        <p><a href="${queueUrl}" style="display:inline-block;padding:10px 14px;border-radius:999px;background:#0f172a;color:white;text-decoration:none;">Open Photo Review</a></p>
      </div>
    `;

    const results = [];

    for (const recipient of recipients) {
      const staff = staffById.get(recipient.staff_id);
      const email = String(recipient.email_address ?? "").trim();

      try {
        const resend = await sendResendEmail({
          to: email,
          subject,
          text,
          html,
        });

        await supabase.from("staff_photo_review_notifications").insert({
          team_member_id: recipient.id,
          recipient_staff_id: recipient.staff_id,
          recipient_email: email,
          channel: "email",
          status: "sent",
          provider: "resend",
          provider_message_id: resend.id ?? null,
          pending_count: count,
          subject,
          message: text,
          triggered_by_staff_id: adminActor.staff.id,
          created_at: new Date().toISOString(),
        });

        results.push({
          team_id: recipient.id,
          staff_id: recipient.staff_id,
          name: staffDisplayName(staff),
          email,
          status: "sent",
          provider_message_id: resend.id ?? null,
        });
      } catch (error) {
        const message = error instanceof Error ? error.message : "Send failed.";

        await supabase.from("staff_photo_review_notifications").insert({
          team_member_id: recipient.id,
          recipient_staff_id: recipient.staff_id,
          recipient_email: email,
          channel: "email",
          status: "failed",
          provider: "resend",
          pending_count: count,
          subject,
          message: text,
          error_message: message,
          triggered_by_staff_id: adminActor.staff.id,
          created_at: new Date().toISOString(),
        });

        results.push({
          team_id: recipient.id,
          staff_id: recipient.staff_id,
          name: staffDisplayName(staff),
          email,
          status: "failed",
          error: message,
        });
      }
    }

    return Response.json({
      ok: results.some((row) => row.status === "sent"),
      mode,
      pending_count: count,
      recipients: results,
    });
  } catch (error) {
    return routeError(error);
  }
}
