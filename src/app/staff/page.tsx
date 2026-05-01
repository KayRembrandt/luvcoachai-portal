"use client";

import * as React from "react";
import { supabaseBrowser as supabase } from "@/lib/supabaseBrowser";

type StaffRole = "staff" | "henry" | "admin" | null;

type StaffRow = {
  id: string;
  first_name: string | null;
  last_name: string | null;
  display_name: string | null;
  role: "staff" | "henry" | "admin";
  is_active: boolean;
  created_at?: string | null;
};

type StaffListResponse = {
  rows?: StaffRow[];
  meRole?: StaffRole;
  error?: string;
};

function roleLabel(role: StaffRow["role"]) {
  if (role === "admin") return "Admin (can revoke access)";
  if (role === "henry") return "Henry";
  return "Staff";
}

export default function StaffPage() {
  const [meRole, setMeRole] = React.useState<StaffRole>(null);
  const [rows, setRows] = React.useState<StaffRow[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState<string | null>(null);
  const [busyId, setBusyId] = React.useState<string | null>(null);

  const isAdmin = meRole === "admin";

async function load() {
  setLoading(true);
  setError(null);

  try {
    const {
      data: { session },
    } = await supabase.auth.getSession();

    const token = session?.access_token ?? null;

    const res = await fetch("/api/staff/list", {
      method: "GET",
      headers: token
        ? {
            Authorization: `Bearer ${token}`,
          }
        : {},
      cache: "no-store",
    });

    const json = await res.json().catch(() => ({}));

    if (!res.ok) {
      setError(json?.error ?? "Failed to load staff");
      setRows([]);
      setMeRole(null);
      setLoading(false);
      return;
    }

    setRows(json.rows ?? []);
    setMeRole(json.meRole ?? null);
    setLoading(false);
  } catch (err: any) {
    setError(err?.message ?? "Failed to load staff");
    setRows([]);
    setMeRole(null);
    setLoading(false);
  }
}

  React.useEffect(() => {
    void load();
  }, []);

  async function toggleActive(staffId: string, nextActive: boolean) {
    if (!isAdmin) return;

    setBusyId(staffId);
    setError(null);

    const { error: updErr } = await supabase
      .from("staff")
      .update({ is_active: nextActive })
      .eq("id", staffId);

    if (updErr) {
      setError(updErr.message);
      setBusyId(null);
      return;
    }

    setRows((prev) =>
      prev.map((r) => (r.id === staffId ? { ...r, is_active: nextActive } : r))
    );
    setBusyId(null);
  }

  return (
    <div className="max-w-5xl mx-auto px-4 py-8">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold">Staff Members</h1>
          <p className="text-sm text-slate-600 mt-1">
            Active staff can log in. Admins can revoke or restore access.
          </p>
        </div>

        <button
          onClick={load}
          className="text-sm px-4 py-2 rounded-full border border-slate-200 hover:bg-slate-50"
          disabled={loading}
        >
          {loading ? "Loading…" : "Refresh"}
        </button>
      </div>

      {error && (
        <div className="mt-4 rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-rose-900">
          {error}
        </div>
      )}

      <div className="mt-6 rounded-3xl border border-slate-200 bg-white shadow-sm overflow-hidden">
        <div className="px-5 py-4 border-b border-slate-100 text-sm text-slate-600">
          {loading ? "Loading…" : `${rows.length} staff member(s)`}
        </div>

        <div className="overflow-x-auto">
          <table className="min-w-full text-sm">
            <thead className="bg-slate-50 text-slate-700">
              <tr>
                <th className="text-left font-medium px-5 py-3">Name</th>
                <th className="text-left font-medium px-5 py-3">Role</th>
                <th className="text-left font-medium px-5 py-3">Status</th>
                <th className="text-right font-medium px-5 py-3">Access</th>
              </tr>
            </thead>

            <tbody className="divide-y divide-slate-100">
              {!loading &&
                rows.map((r) => {
                  const name =
                    r.display_name ||
                    [r.first_name, r.last_name].filter(Boolean).join(" ") ||
                    "(No name)";

                  return (
                    <tr key={r.id} className="hover:bg-slate-50/50">
                      <td className="px-5 py-4">
                        <div className="font-medium text-slate-900">{name}</div>
                        <div className="text-xs text-slate-400">{r.id}</div>
                      </td>

                      <td className="px-5 py-4 text-slate-700">
                        {roleLabel(r.role)}
                      </td>

                      <td className="px-5 py-4">
                        <span
                          className={[
                            "inline-flex items-center px-2.5 py-1 rounded-full text-xs border",
                            r.is_active
                              ? "bg-emerald-50 border-emerald-200 text-emerald-900"
                              : "bg-slate-100 border-slate-200 text-slate-700",
                          ].join(" ")}
                        >
                          {r.is_active ? "Active" : "Revoked"}
                        </span>
                      </td>

                      <td className="px-5 py-4 text-right">
                        {isAdmin ? (
                          r.role === "admin" ? (
                            <span className="text-xs text-slate-500">(Admin)</span>
                          ) : (
                            <button
                              className={[
                                "px-3 py-1.5 rounded-full text-sm border",
                                r.is_active
                                  ? "border-rose-200 text-rose-700 hover:bg-rose-50"
                                  : "border-emerald-200 text-emerald-700 hover:bg-emerald-50",
                              ].join(" ")}
                              onClick={() => toggleActive(r.id, !r.is_active)}
                              disabled={busyId === r.id}
                            >
                              {busyId === r.id
                                ? "Working…"
                                : r.is_active
                                ? "Revoke"
                                : "Restore"}
                            </button>
                          )
                        ) : (
                          <span className="text-xs text-slate-400">Admin only</span>
                        )}
                      </td>
                    </tr>
                  );
                })}

              {!loading && rows.length === 0 && (
                <tr>
                  <td className="px-5 py-6 text-slate-500" colSpan={4}>
                    No staff rows found.
                  </td>
                </tr>
              )}
            </tbody>
          </table>

          {loading && (
            <div className="px-5 py-6 text-sm text-slate-500">Loading staff…</div>
          )}
        </div>
      </div>
    </div>
  );
}