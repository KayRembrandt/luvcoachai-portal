"use client";

import React from "react";
import { supabaseBrowser } from "@/lib/supabaseBrowser";
import styles from "./team.module.css";

type StaffRow = {
  id: string;
  role?: string | null;
  status?: string | null;
  is_active?: boolean | null;
  first_name?: string | null;
  last_name?: string | null;
  email?: string | null;
  notification_email?: string | null;
  work_email?: string | null;
  staff_email?: string | null;
  [key: string]: unknown;
};

type TeamRow = {
  id: string;
  staff_id: string;
  application_status?: string | null;
  email_address?: string | null;
  email_enabled?: boolean | null;
  sms_enabled?: boolean | null;
  phone_number?: string | null;
  timezone?: string | null;
  notes?: string | null;
  [key: string]: unknown;
};

type CoverageRow = {
  id?: string;
  team_member_id: string;
  day_of_week: number;
  start_time: string;
  end_time: string;
  timezone?: string | null;
  is_active?: boolean | null;
};

type NotificationRow = {
  id: string;
  channel?: string | null;
  status?: string | null;
  recipient_email?: string | null;
  subject?: string | null;
  pending_count?: number | null;
  error_message?: string | null;
  created_at?: string | null;
};

type TeamMember = {
  staff: StaffRow;
  team: TeamRow | null;
  coverage: CoverageRow[];
  inferred_email: string | null;
  on_duty: boolean;
};

type ApiState = {
  members: TeamMember[];
  notifications: NotificationRow[];
  counts: {
    active_staff: number;
    configured_reviewers: number;
    email_enabled: number;
    on_duty: number;
  };
};

type ScheduleDraftRow = {
  day_of_week: number;
  label: string;
  is_active: boolean;
  start_time: string;
  end_time: string;
};

const DEFAULT_TIMEZONE = "America/Los_Angeles";

const WEEKDAYS: Array<{ value: number; label: string }> = [
  { value: 1, label: "Monday" },
  { value: 2, label: "Tuesday" },
  { value: 3, label: "Wednesday" },
  { value: 4, label: "Thursday" },
  { value: 5, label: "Friday" },
  { value: 6, label: "Saturday" },
  { value: 0, label: "Sunday" },
];

function staffName(staff: StaffRow) {
  const first = String(staff.first_name ?? "").trim();
  const last = String(staff.last_name ?? "").trim();
  return [first, last].filter(Boolean).join(" ") || "Staff member";
}

function pickInitialEmail(member: TeamMember) {
  return String(member.team?.email_address ?? member.inferred_email ?? "").trim();
}

function formatDate(value?: string | null) {
  if (!value) return "—";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleString();
}

function buildScheduleDraft(member: TeamMember | null): ScheduleDraftRow[] {
  return WEEKDAYS.map((day) => {
    const row = member?.coverage?.find((c) => Number(c.day_of_week) === day.value);

    return {
      day_of_week: day.value,
      label: day.label,
      is_active: row?.is_active !== false && !!row,
      start_time: row?.start_time?.slice(0, 5) ?? "09:00",
      end_time: row?.end_time?.slice(0, 5) ?? "17:00",
    };
  });
}

function weekdayScheduleDraft() {
  return WEEKDAYS.map((day) => ({
    day_of_week: day.value,
    label: day.label,
    is_active: day.value >= 1 && day.value <= 5,
    start_time: "09:00",
    end_time: "17:00",
  }));
}

async function getToken() {
  const {
    data: { session },
    error,
  } = await supabaseBrowser.auth.getSession();

  if (error) throw new Error(error.message);
  if (!session?.access_token) throw new Error("Not logged in.");

  return session.access_token;
}

function TeamMemberCard({
  member,
  selected,
  onSelect,
  onSaved,
  onTestEmail,
}: {
  member: TeamMember;
  selected: boolean;
  onSelect: () => void;
  onSaved: () => void;
  onTestEmail: (staffId: string, teamId: string | null, email: string) => void;
}) {
  const [applicationStatus, setApplicationStatus] = React.useState(
    member.team?.application_status ?? "approved"
  );
  const [email, setEmail] = React.useState(pickInitialEmail(member));
  const [emailEnabled, setEmailEnabled] = React.useState(
    member.team?.email_enabled !== false
  );
  const [timezone, setTimezone] = React.useState(
    member.team?.timezone ?? DEFAULT_TIMEZONE
  );
  const [notes, setNotes] = React.useState(member.team?.notes ?? "");
  const [saving, setSaving] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  React.useEffect(() => {
    setApplicationStatus(member.team?.application_status ?? "approved");
    setEmail(pickInitialEmail(member));
    setEmailEnabled(member.team?.email_enabled !== false);
    setTimezone(member.team?.timezone ?? DEFAULT_TIMEZONE);
    setNotes(member.team?.notes ?? "");
  }, [member]);

  async function save() {
    setSaving(true);
    setError(null);

    try {
      const token = await getToken();
      const res = await fetch("/api/admin/photo-review/team", {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        cache: "no-store",
        body: JSON.stringify({
          action: "save_team",
          staff_id: member.staff.id,
          team_id: member.team?.id ?? null,
          application_status: applicationStatus,
          email_address: email,
          email_enabled: emailEnabled,
          sms_enabled: false,
          timezone,
          notes,
        }),
      });

      const json = await res.json().catch(() => ({}));

      if (!res.ok) {
        throw new Error(json?.error ?? `Save failed (${res.status})`);
      }

      onSaved();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Save failed.");
    } finally {
      setSaving(false);
    }
  }

  const configured = !!member.team;
  const canTest = !!email.trim() && emailEnabled;

  return (
    <article className={[styles.memberCard, selected ? styles.selectedCard : ""].join(" ")}>
      <div className={styles.memberHeader}>
        <button type="button" className={styles.memberNameButton} onClick={onSelect}>
          <span className={styles.memberName}>{staffName(member.staff)}</span>
          <span className={styles.memberMeta}>
            {member.staff.role ?? "staff"} · {member.staff.status ?? "active"}
          </span>
        </button>

        <span className={member.on_duty ? styles.onDutyBadge : styles.offDutyBadge}>
          {member.on_duty ? "On duty now" : "Off shift"}
        </span>
      </div>

      <div className={styles.formGrid}>
        <label className={styles.field}>
          <span>Email for alerts</span>
          <input
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            placeholder="name@example.com"
          />
          {member.inferred_email ? (
            <small className={styles.fieldHint}>
              Login email found: {member.inferred_email}{" "}
              {email !== member.inferred_email ? (
                <button type="button" onClick={() => setEmail(member.inferred_email ?? "")}>
                  Use login email
                </button>
              ) : null}
            </small>
          ) : (
            <small className={styles.fieldHint}>No login email found yet. You can enter one manually.</small>
          )}
        </label>

        <label className={styles.field}>
          <span>Status</span>
          <select
            value={applicationStatus}
            onChange={(event) => setApplicationStatus(event.target.value)}
          >
            <option value="approved">Approved</option>
            <option value="paused">Paused</option>
            <option value="pending">Pending</option>
            <option value="declined">Declined</option>
          </select>
        </label>

        <label className={styles.field}>
          <span>Timezone</span>
          <input
            value={timezone}
            onChange={(event) => setTimezone(event.target.value)}
            placeholder="America/Los_Angeles"
          />
        </label>

        <label className={styles.checkRow}>
          <input
            type="checkbox"
            checked={emailEnabled}
            onChange={(event) => setEmailEnabled(event.target.checked)}
          />
          <span>Email alerts enabled</span>
        </label>
      </div>

      <label className={styles.field}>
        <span>Notes</span>
        <textarea
          value={notes}
          onChange={(event) => setNotes(event.target.value)}
          placeholder="Coverage notes, fallback notes, or HR reminder"
          rows={2}
        />
      </label>

      {error ? <div className={styles.errorBox}>{error}</div> : null}

      <div className={styles.cardActions}>
        <button type="button" className={styles.secondaryButton} onClick={onSelect}>
          Edit schedule
        </button>
        <button
          type="button"
          className={styles.secondaryButton}
          onClick={() => onTestEmail(member.staff.id, member.team?.id ?? null, email)}
          disabled={!canTest}
        >
          Send test email
        </button>
        <button type="button" className={styles.primaryButton} onClick={save} disabled={saving}>
          {saving ? "Saving…" : configured ? "Save" : "Enable"}
        </button>
      </div>

      <p className={styles.smsNote}>SMS is intentionally off for V1. Resend email is the active channel.</p>
    </article>
  );
}

export default function AdminPhotoReviewTeamPage() {
  const [data, setData] = React.useState<ApiState | null>(null);
  const [loading, setLoading] = React.useState(true);
  const [busy, setBusy] = React.useState<string | null>(null);
  const [error, setError] = React.useState<string | null>(null);
  const [notice, setNotice] = React.useState<string | null>(null);
  const [selectedStaffId, setSelectedStaffId] = React.useState<string | null>(null);
  const [scheduleDraft, setScheduleDraft] = React.useState<ScheduleDraftRow[]>(weekdayScheduleDraft());

  const selectedMember = React.useMemo(() => {
    if (!data?.members?.length) return null;
    return data.members.find((member) => member.staff.id === selectedStaffId) ?? data.members[0] ?? null;
  }, [data?.members, selectedStaffId]);

  React.useEffect(() => {
    if (!selectedStaffId && data?.members?.[0]?.staff?.id) {
      setSelectedStaffId(data.members[0].staff.id);
    }
  }, [data, selectedStaffId]);

  React.useEffect(() => {
    setScheduleDraft(buildScheduleDraft(selectedMember));
  }, [selectedMember?.staff.id, selectedMember?.team?.id]);

  async function apiFetch(path: string, init?: RequestInit) {
    const token = await getToken();

    const res = await fetch(path, {
      ...init,
      headers: {
        ...(init?.headers ?? {}),
        Authorization: `Bearer ${token}`,
      },
      cache: "no-store",
    });

    const json = await res.json().catch(() => ({}));

    if (!res.ok) {
      throw new Error(json?.error ?? `Request failed (${res.status})`);
    }

    return json;
  }

  async function load() {
    setLoading(true);
    setError(null);

    try {
      const json = await apiFetch("/api/admin/photo-review/team");
      setData(json);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not load photo-review team.");
    } finally {
      setLoading(false);
    }
  }

  React.useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function syncActiveStaff() {
    setBusy("sync");
    setError(null);
    setNotice(null);

    try {
      const json = await apiFetch("/api/admin/photo-review/team", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "sync_active_staff" }),
      });

      const filled = Number(json.email_filled ?? 0);
      const missing = Number(json.missing_email ?? 0);
      setNotice(
        `Synced ${json.upserted ?? 0} active staff into the photo-review team. Filled ${filled} alert email${filled === 1 ? "" : "s"}. ${missing ? `${missing} still need manual email entry.` : "Everyone has an alert email."}`
      );
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not sync staff.");
    } finally {
      setBusy(null);
    }
  }

  async function notifyOnDuty() {
    setBusy("notify");
    setError(null);
    setNotice(null);

    try {
      const json = await apiFetch("/api/admin/photo-review/replay-edge", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ backfill_missing: true, limit: 50 }),
      });

      const summary = json.summary ?? {};
      const sent = Number(summary.sent ?? 0);
      const skipped = Number(summary.skipped ?? 0);
      const failed = Number(summary.failed ?? 0);
      const inserted = Number(summary.inserted_notification_count ?? 0);
      const attempted = Number(summary.edge_invocations_attempted ?? 0);

      setNotice(
        `Photo-review Edge email replay: ${sent} sent, ${skipped} skipped, ${failed} failed. ${attempted} Edge invocation${attempted === 1 ? "" : "s"} attempted. ${inserted} missing notification row${inserted === 1 ? "" : "s"} backfilled.`
      );
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not send notification.");
    } finally {
      setBusy(null);
    }
  }

  async function sendTestEmail(staffId: string, teamId: string | null, email: string) {
    const clean = email.trim();
    if (!clean) {
      setError("Enter an alert email before sending a test email.");
      return;
    }

    setBusy(`test-${teamId ?? clean}`);
    setError(null);
    setNotice(null);

    try {
      const json = await apiFetch("/api/admin/photo-review/test-edge", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ staff_id: staffId, team_id: teamId, recipient_email: clean }),
      });

      setNotice(`Test email sent to ${json.recipient_email ?? clean}.`);
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not send test email.");
    } finally {
      setBusy(null);
    }
  }

  async function saveSchedule() {
    if (!selectedMember?.team?.id) {
      setError("Save this staff member as a photo-review team member before setting a schedule.");
      return;
    }

    setBusy("schedule");
    setError(null);
    setNotice(null);

    try {
      await apiFetch("/api/admin/photo-review/team", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "replace_coverage",
          team_id: selectedMember.team.id,
          timezone: selectedMember.team.timezone ?? DEFAULT_TIMEZONE,
          coverage: scheduleDraft.map((row) => ({
            day_of_week: row.day_of_week,
            start_time: row.start_time,
            end_time: row.end_time,
            is_active: row.is_active,
          })),
        }),
      });

      setNotice(`Schedule saved for ${staffName(selectedMember.staff)}.`);
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not save schedule.");
    } finally {
      setBusy(null);
    }
  }

  function updateScheduleRow(day: number, patch: Partial<ScheduleDraftRow>) {
    setScheduleDraft((rows) =>
      rows.map((row) => (row.day_of_week === day ? { ...row, ...patch } : row))
    );
  }

  const members = data?.members ?? [];
  const counts = data?.counts;

  return (
    <main className={styles.pageShell}>
      <section className={styles.heroCard}>
        <div>
          <p className={styles.eyebrow}>Admin · Photo Review</p>
          <h1>Photo Review Team</h1>
          <p>
            Manage who receives Resend email alerts, who is on shift, and the recent notification log. Default schedule timezone is Pacific time.
          </p>
        </div>

        <div className={styles.heroActions}>
          <button type="button" className={styles.secondaryButton} onClick={load} disabled={loading}>
            {loading ? "Refreshing…" : "Refresh"}
          </button>
          <button type="button" className={styles.secondaryButton} onClick={syncActiveStaff} disabled={busy === "sync"}>
            {busy === "sync" ? "Syncing…" : "Sync active staff"}
          </button>
          <button type="button" className={styles.primaryButton} onClick={notifyOnDuty} disabled={busy === "notify"}>
            {busy === "notify" ? "Sending…" : "Replay pending emails"}
          </button>
        </div>
      </section>

      {error ? <div className={styles.errorBox}>{error}</div> : null}
      {notice ? <div className={styles.noticeBox}>{notice}</div> : null}

      <section className={styles.statsGrid}>
        <div className={styles.statCard}>
          <span>Active staff</span>
          <strong>{counts?.active_staff ?? "—"}</strong>
        </div>
        <div className={styles.statCard}>
          <span>Configured reviewers</span>
          <strong>{counts?.configured_reviewers ?? "—"}</strong>
        </div>
        <div className={styles.statCard}>
          <span>Email enabled</span>
          <strong>{counts?.email_enabled ?? "—"}</strong>
        </div>
        <div className={styles.statCard}>
          <span>On duty now</span>
          <strong>{counts?.on_duty ?? "—"}</strong>
        </div>
      </section>

      <section className={styles.contentGrid}>
        <div className={styles.panel}>
          <div className={styles.panelHeader}>
            <div>
              <h2>Team settings</h2>
              <p>Everyone active can help cover. Save each person once to enable email settings.</p>
            </div>
          </div>

          <div className={styles.teamList}>
            {loading ? (
              <div className={styles.emptyState}>Loading team…</div>
            ) : members.length === 0 ? (
              <div className={styles.emptyState}>No active staff found.</div>
            ) : (
              members.map((member) => (
                <TeamMemberCard
                  key={member.staff.id}
                  member={member}
                  selected={selectedMember?.staff.id === member.staff.id}
                  onSelect={() => setSelectedStaffId(member.staff.id)}
                  onSaved={load}
                  onTestEmail={sendTestEmail}
                />
              ))
            )}
          </div>
        </div>

        <aside className={styles.sideColumn}>
          <section className={styles.panel}>
            <div className={styles.panelHeader}>
              <div>
                <h2>Coverage schedule</h2>
                <p>{selectedMember ? staffName(selectedMember.staff) : "Choose a staff member"}</p>
              </div>
              <button type="button" className={styles.secondaryButton} onClick={() => setScheduleDraft(weekdayScheduleDraft())}>
                Mon-Fri 9-5
              </button>
            </div>

            <div className={styles.scheduleList}>
              {scheduleDraft.map((row) => (
                <div key={row.day_of_week} className={styles.scheduleRow}>
                  <label className={styles.dayToggle}>
                    <input
                      type="checkbox"
                      checked={row.is_active}
                      onChange={(event) =>
                        updateScheduleRow(row.day_of_week, { is_active: event.target.checked })
                      }
                    />
                    <span>{row.label}</span>
                  </label>

                  <input
                    type="time"
                    value={row.start_time}
                    disabled={!row.is_active}
                    onChange={(event) =>
                      updateScheduleRow(row.day_of_week, { start_time: event.target.value })
                    }
                  />
                  <span className={styles.toText}>to</span>
                  <input
                    type="time"
                    value={row.end_time}
                    disabled={!row.is_active}
                    onChange={(event) =>
                      updateScheduleRow(row.day_of_week, { end_time: event.target.value })
                    }
                  />
                </div>
              ))}
            </div>

            <button type="button" className={styles.primaryButtonWide} onClick={saveSchedule} disabled={busy === "schedule"}>
              {busy === "schedule" ? "Saving schedule…" : "Save schedule"}
            </button>

            <p className={styles.helpText}>
              Schedule rows decide who receives automatic queue email. The replay button backfills missed notification rows, then asks the Edge Function to send any pending emails. If nobody is on duty, the Edge Function uses PHOTO_REVIEW_FALLBACK_EMAILS.
            </p>
          </section>

          <section className={styles.panel}>
            <div className={styles.panelHeader}>
              <div>
                <h2>Recent notification log</h2>
                <p>Latest Resend attempts from the photo-review system.</p>
              </div>
            </div>

            <div className={styles.logList}>
              {(data?.notifications ?? []).length === 0 ? (
                <div className={styles.emptyState}>No notification log entries yet.</div>
              ) : (
                data!.notifications.map((row) => (
                  <div key={row.id} className={styles.logRow}>
                    <div>
                      <strong>{row.status ?? "unknown"}</strong>
                      <span>{row.recipient_email ?? row.channel ?? "email"}</span>
                    </div>
                    <p>{row.subject ?? "Photo review notification"}</p>
                    <small>
                      {formatDate(row.created_at)} · pending {row.pending_count ?? "—"}
                    </small>
                    {row.error_message ? <em>{row.error_message}</em> : null}
                  </div>
                ))
              )}
            </div>
          </section>
        </aside>
      </section>
    </main>
  );
}
