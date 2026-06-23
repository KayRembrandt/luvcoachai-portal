"use client";

import { useEffect, useMemo, useState } from "react";
import type { ReactNode } from "react";
import { Panel } from "@/components/Panel";
import { PageShell } from "@/components/ui/PageShell";
import { supabaseBrowser } from "@/lib/supabaseBrowser";

type StaffRole = "staff" | "csr" | "henry" | "admin";
type StaffStatus = "active" | "inactive";

type StaffPermissions = {
  user_search?: boolean;
  onboarding?: boolean;
  photo_review?: boolean;
  library_review?: boolean;
  jobs?: boolean;
  henry_desk?: boolean;
  safety?: boolean;
  system?: boolean;
};

type StaffRow = {
  id: string;
  email: string | null;
  first_name: string | null;
  last_name: string | null;
  role: StaffRole | string | null;
  status: StaffStatus | string | null;
  permissions: StaffPermissions | null;
  auth_user_id?: string | null;
  created_at?: string | null;
  updated_at?: string | null;
};

type StaffApplication = {
  id: string;
  first_name: string | null;
  last_name: string | null;
  email: string;
  phone: string | null;
  request_role: string | null;
  why_joining: string | null;
  experience: string | null;
  values_alignment: string | null;
  status: string | null;
  created_at: string;
};

type ApiPayload = {
  staff?: StaffRow[];
  applications?: StaffApplication[];
  error?: string;
};

const roleOptions: { value: StaffRole; label: string; help: string }[] = [
  { value: "staff", label: "Staff", help: "Basic portal staff access" },
  { value: "csr", label: "CSR", help: "User support and onboarding" },
  { value: "henry", label: "Henry", help: "Henry desk / guided support" },
  { value: "admin", label: "Admin", help: "Admin tools and staff access" },
];

const permissionOptions: { key: keyof StaffPermissions; label: string }[] = [
  { key: "user_search", label: "User Search" },
  { key: "onboarding", label: "Onboarding" },
  { key: "photo_review", label: "Photo Review" },
  { key: "library_review", label: "Library Review" },
  { key: "jobs", label: "Jobs" },
  { key: "henry_desk", label: "Henry Desk" },
  { key: "safety", label: "Safety" },
  { key: "system", label: "System" },
];

const defaultPermissions: Record<StaffRole, StaffPermissions> = {
  staff: { user_search: true },
  csr: { user_search: true, onboarding: true, jobs: true },
  henry: { user_search: true, henry_desk: true, jobs: true },
  admin: {
    user_search: true,
    onboarding: true,
    photo_review: true,
    library_review: true,
    jobs: true,
    henry_desk: true,
    safety: true,
    system: true,
  },
};

const blankForm = {
  id: "",
  email: "",
  first_name: "",
  last_name: "",
  role: "staff" as StaffRole,
  status: "active" as StaffStatus,
  permissions: defaultPermissions.staff,
};

export default function StaffAccessPage() {
  const [staff, setStaff] = useState<StaffRow[]>([]);
  const [applications, setApplications] = useState<StaffApplication[]>([]);
  const [form, setForm] = useState(blankForm);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [busyApplicationId, setBusyApplicationId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  async function getToken() {
    const { data } = await supabaseBrowser.auth.getSession();
    return data.session?.access_token || null;
  }

  async function load() {
    setLoading(true);
    setError(null);
    try {
      const token = await getToken();
      if (!token) throw new Error("Not logged in.");

      const res = await fetch("/api/staff/access", {
        cache: "no-store",
        headers: { Authorization: `Bearer ${token}` },
      });
      const json: ApiPayload = await res.json();
      if (!res.ok) throw new Error(json?.error || "Failed to load staff access.");

      setStaff(json.staff || []);
      setApplications(json.applications || []);
    } catch (e: any) {
      setError(e?.message || "Failed to load staff access.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
  }, []);

  const activeStaff = useMemo(
    () => staff.filter((s) => (s.status || "").toLowerCase() === "active"),
    [staff]
  );

  const inactiveStaff = useMemo(
    () => staff.filter((s) => (s.status || "").toLowerCase() !== "active"),
    [staff]
  );

  const pendingApplications = useMemo(() => {
    return applications.filter((a) => {
      const status = (a.status || "").toLowerCase();
      return status === "" || status === "submitted" || status === "pending";
    });
  }, [applications]);

  function startEdit(row: StaffRow) {
    setNotice(null);
    setError(null);
    setForm({
      id: row.id,
      email: row.email || "",
      first_name: row.first_name || "",
      last_name: row.last_name || "",
      role: normalizeRole(row.role),
      status: normalizeStatus(row.status),
      permissions: row.permissions || {},
    });
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  function startFromApplication(app: StaffApplication) {
    const role = normalizeRole(app.request_role || "staff");
    setNotice(null);
    setError(null);
    setForm({
      id: "",
      email: app.email || "",
      first_name: app.first_name || "",
      last_name: app.last_name || "",
      role,
      status: "active",
      permissions: defaultPermissions[role],
    });
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  function updateRole(role: StaffRole) {
    setForm((current) => ({
      ...current,
      role,
      permissions: { ...defaultPermissions[role], ...current.permissions },
    }));
  }

  function togglePermission(key: keyof StaffPermissions) {
    setForm((current) => ({
      ...current,
      permissions: {
        ...current.permissions,
        [key]: !current.permissions?.[key],
      },
    }));
  }

  async function saveStaff() {
    setSaving(true);
    setError(null);
    setNotice(null);
    try {
      const token = await getToken();
      if (!token) throw new Error("Not logged in.");

      const res = await fetch("/api/staff/access", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify(form),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json?.error || "Failed to save staff access.");

      setNotice("Staff access saved.");
      setForm(blankForm);
      await load();
    } catch (e: any) {
      setError(e?.message || "Failed to save staff access.");
    } finally {
      setSaving(false);
    }
  }

  async function decideApplication(
    applicationId: string,
    action: "approve" | "reject",
    role?: StaffRole
  ) {
    setBusyApplicationId(applicationId);
    setError(null);
    setNotice(null);
    try {
      const token = await getToken();
      if (!token) throw new Error("Not logged in.");

      const res = await fetch("/api/staff/applications/decision", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ application_id: applicationId, action, role }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json?.error || "Application action failed.");

      setNotice(action === "approve" ? "Application approved and staff access created." : "Application rejected.");
      await load();
    } catch (e: any) {
      setError(e?.message || "Application action failed.");
    } finally {
      setBusyApplicationId(null);
    }
  }

  return (
    <PageShell
      label="Admin"
      emoji="🛡️"
      title="Staff Access"
      subtitle="Add portal staff, assign their role, and approve applications from one place."
      wide
    >
      <div className="max-w-[1100px] mx-auto space-y-5">
        {(error || notice) && (
          <div
            className={
              error
                ? "rounded-xl bg-[#FEE2E2] text-[#9B2C2C] text-sm px-3 py-2"
                : "rounded-xl bg-emerald-50 text-emerald-800 text-sm px-3 py-2 border border-emerald-100"
            }
          >
            {error || notice}
          </div>
        )}

        <Panel>
          <div className="flex flex-col gap-1 sm:flex-row sm:items-start sm:justify-between mb-4">
            <div>
              <h2 className="text-lg font-semibold text-slate-900">Add or update staff</h2>
              <p className="text-sm text-slate-500">
                Use this for people who should have portal access even if they never submitted an application.
              </p>
            </div>
            {form.id && (
              <button
                type="button"
                className="text-sm text-slate-600 underline mt-2 sm:mt-0"
                onClick={() => setForm(blankForm)}
              >
                Clear edit
              </button>
            )}
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <Field label="Email" required>
              <input
                className="lc-input w-full"
                value={form.email}
                onChange={(e) => setForm({ ...form, email: e.target.value })}
                placeholder="name@example.com"
              />
            </Field>
            <Field label="Primary role" required>
              <select
                className="lc-input w-full"
                value={form.role}
                onChange={(e) => updateRole(e.target.value as StaffRole)}
              >
                {roleOptions.map((role) => (
                  <option key={role.value} value={role.value}>
                    {role.label}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="First name">
              <input
                className="lc-input w-full"
                value={form.first_name}
                onChange={(e) => setForm({ ...form, first_name: e.target.value })}
                placeholder="First name"
              />
            </Field>
            <Field label="Last name">
              <input
                className="lc-input w-full"
                value={form.last_name}
                onChange={(e) => setForm({ ...form, last_name: e.target.value })}
                placeholder="Last name"
              />
            </Field>
            <Field label="Status">
              <select
                className="lc-input w-full"
                value={form.status}
                onChange={(e) => setForm({ ...form, status: e.target.value as StaffStatus })}
              >
                <option value="active">Active</option>
                <option value="inactive">Inactive</option>
              </select>
            </Field>
          </div>

          <div className="mt-4">
            <div className="text-xs uppercase tracking-wide text-slate-500 mb-2">Work permissions</div>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
              {permissionOptions.map((permission) => (
                <label
                  key={permission.key}
                  className="flex items-center gap-2 rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-700"
                >
                  <input
                    type="checkbox"
                    checked={!!form.permissions?.[permission.key]}
                    onChange={() => togglePermission(permission.key)}
                  />
                  {permission.label}
                </label>
              ))}
            </div>
          </div>

          <div className="flex justify-end mt-5">
            <button
              type="button"
              className="lc-button rounded-full px-5 py-2 disabled:opacity-70"
              disabled={saving}
              onClick={saveStaff}
            >
              {saving ? "Saving…" : form.id ? "Update staff" : "Add staff"}
            </button>
          </div>
        </Panel>

        <Panel>
          <div className="flex items-start justify-between mb-4">
            <div>
              <h2 className="text-lg font-semibold text-slate-900">Pending applications</h2>
              <p className="text-sm text-slate-500">
                Includes submitted, pending, and older rows that still have a blank status.
              </p>
            </div>
            <button className="text-sm text-slate-600 underline" onClick={load} disabled={loading}>
              Refresh
            </button>
          </div>

          {loading ? (
            <div className="text-sm text-slate-600">Loading…</div>
          ) : pendingApplications.length === 0 ? (
            <div className="text-sm text-slate-600">No pending applications.</div>
          ) : (
            <div className="space-y-3">
              {pendingApplications.map((app) => {
                const requestedRole = normalizeRole(app.request_role || "staff");
                return (
                  <div key={app.id} className="rounded-2xl border border-slate-200 bg-white p-4">
                    <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                      <div>
                        <div className="text-base font-semibold text-slate-900">
                          {fullName(app.first_name, app.last_name)}
                        </div>
                        <div className="text-sm text-slate-600">{app.email}</div>
                        <div className="text-xs text-slate-500 mt-1">
                          Requested role: <span className="font-medium">{requestedRole}</span>
                        </div>
                      </div>

                      <div className="flex flex-wrap gap-2">
                        <button
                          className="lc-button px-4 py-2 rounded-full disabled:opacity-70"
                          disabled={busyApplicationId === app.id}
                          onClick={() => decideApplication(app.id, "approve", requestedRole)}
                        >
                          {busyApplicationId === app.id ? "Working…" : "Approve"}
                        </button>
                        <button
                          className="px-4 py-2 rounded-full border border-slate-300 text-slate-800 hover:bg-slate-50 disabled:opacity-70"
                          disabled={busyApplicationId === app.id}
                          onClick={() => startFromApplication(app)}
                        >
                          Edit first
                        </button>
                        <button
                          className="px-4 py-2 rounded-full border border-slate-300 text-slate-800 hover:bg-slate-50 disabled:opacity-70"
                          disabled={busyApplicationId === app.id}
                          onClick={() => decideApplication(app.id, "reject")}
                        >
                          Reject
                        </button>
                      </div>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-3 gap-3 mt-4">
                      <Info label="Why joining" value={app.why_joining} />
                      <Info label="Experience" value={app.experience} />
                      <Info label="Values alignment" value={app.values_alignment} />
                    </div>

                    <div className="text-[11px] text-slate-400 mt-3">
                      Submitted: {app.created_at ? new Date(app.created_at).toLocaleString() : "—"}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </Panel>

        <Panel>
          <div className="mb-4">
            <h2 className="text-lg font-semibold text-slate-900">Active staff</h2>
            <p className="text-sm text-slate-500">This is the portal access source of truth.</p>
          </div>

          {loading ? (
            <div className="text-sm text-slate-600">Loading…</div>
          ) : activeStaff.length === 0 ? (
            <div className="text-sm text-slate-600">No active staff yet.</div>
          ) : (
            <StaffTable rows={activeStaff} onEdit={startEdit} />
          )}
        </Panel>

        {inactiveStaff.length > 0 && (
          <Panel>
            <div className="mb-4">
              <h2 className="text-lg font-semibold text-slate-900">Inactive staff</h2>
              <p className="text-sm text-slate-500">People who are saved but cannot access the portal.</p>
            </div>
            <StaffTable rows={inactiveStaff} onEdit={startEdit} />
          </Panel>
        )}
      </div>
    </PageShell>
  );
}

function StaffTable({ rows, onEdit }: { rows: StaffRow[]; onEdit: (row: StaffRow) => void }) {
  return (
    <div className="overflow-x-auto rounded-2xl border border-slate-200">
      <table className="min-w-full divide-y divide-slate-200 text-sm">
        <thead className="bg-slate-50 text-left text-xs uppercase tracking-wide text-slate-500">
          <tr>
            <th className="px-4 py-3">Name</th>
            <th className="px-4 py-3">Email</th>
            <th className="px-4 py-3">Role</th>
            <th className="px-4 py-3">Work permissions</th>
            <th className="px-4 py-3">Login linked</th>
            <th className="px-4 py-3 text-right">Action</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-100 bg-white">
          {rows.map((row) => (
            <tr key={row.id}>
              <td className="px-4 py-3 font-medium text-slate-900">
                {fullName(row.first_name, row.last_name)}
              </td>
              <td className="px-4 py-3 text-slate-600">{row.email || "—"}</td>
              <td className="px-4 py-3 text-slate-700 capitalize">{row.role || "staff"}</td>
              <td className="px-4 py-3 text-slate-600">
                <PermissionChips permissions={row.permissions || {}} />
              </td>
              <td className="px-4 py-3 text-slate-600">{row.auth_user_id ? "Yes" : "Not yet"}</td>
              <td className="px-4 py-3 text-right">
                <button className="text-sm text-blue-700 underline" onClick={() => onEdit(row)}>
                  Edit
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function PermissionChips({ permissions }: { permissions: StaffPermissions }) {
  const enabled = permissionOptions.filter((p) => permissions?.[p.key]).map((p) => p.label);
  if (enabled.length === 0) return <span className="text-slate-400">—</span>;
  return (
    <div className="flex flex-wrap gap-1">
      {enabled.map((label) => (
        <span key={label} className="rounded-full bg-slate-100 px-2 py-1 text-xs text-slate-700">
          {label}
        </span>
      ))}
    </div>
  );
}

function Field({ label, required, children }: { label: string; required?: boolean; children: ReactNode }) {
  return (
    <label className="block">
      <div className="text-xs uppercase tracking-wide text-slate-500 mb-1">
        {label} {required && <span className="text-rose-500">*</span>}
      </div>
      {children}
    </label>
  );
}

function Info({ label, value }: { label: string; value: string | null }) {
  return (
    <div className="rounded-xl bg-slate-50 border border-slate-200 p-3">
      <div className="text-[11px] uppercase tracking-wide text-slate-500">{label}</div>
      <div className="text-sm text-slate-800 mt-1 whitespace-pre-wrap">
        {value?.trim() ? value : <span className="text-slate-400">—</span>}
      </div>
    </div>
  );
}

function fullName(first?: string | null, last?: string | null) {
  const name = `${first || ""} ${last || ""}`.trim();
  return name || "Unnamed staff";
}

function normalizeRole(role?: string | null): StaffRole {
  const value = (role || "staff").toLowerCase();
  if (value === "admin" || value === "csr" || value === "henry" || value === "staff") return value;
  return "staff";
}

function normalizeStatus(status?: string | null): StaffStatus {
  return (status || "active").toLowerCase() === "inactive" ? "inactive" : "active";
}
