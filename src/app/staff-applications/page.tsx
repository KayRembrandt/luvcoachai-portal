"use client";

import { useEffect, useMemo, useState } from "react";
import { Panel } from "@/components/Panel";
import { PageShell } from "@/components/ui/PageShell";
import { supabaseBrowser } from "@/lib/supabaseBrowser";

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

export default function StaffApplicationsPage() {
  const [apps, setApps] = useState<StaffApplication[]>([]);
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function load() {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/staff/applications", { cache: "no-store" });
      const json = await res.json();
      if (!res.ok) throw new Error(json?.error || "Failed to load applications");
      setApps(json.applications || []);
    } catch (e: any) {
      setError(e?.message || "Failed to load");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
  }, []);

async function act(id: string, action: "approve" | "reject") {
  setBusyId(id);
  setError(null);
const { data } = await supabaseBrowser.auth.getSession();
const token = data.session?.access_token;

console.log("CLIENT session:", data.session);
console.log("CLIENT token exists?", !!token);
console.log("CLIENT token length:", token?.length);

  try {
    const { data } = await supabaseBrowser.auth.getSession();
    const token = data.session?.access_token;

    if (!token) throw new Error("Not logged in.");

    const res = await fetch("/api/staff/activate", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({ application_id: id, action }),
    });

    const json = await res.json();
    if (!res.ok) throw new Error(json?.error || "Action failed");

    await load();
  } catch (e: any) {
    setError(e?.message || "Action failed");
  } finally {
    setBusyId(null);
  }
}


  const submitted = useMemo(
    () => apps.filter((a) => (a.status || "").toLowerCase() === "submitted"),
    [apps]
  );

  return (
    <PageShell
      label="Admin"
      emoji="🛡️"
      title="Staff Applications"
      subtitle="Review and approve staff access without touching Supabase."
      wide
    >
      <Panel className="max-w-[960px] mx-auto">
        {error && (
          <div className="rounded-xl bg-[#FEE2E2] text-[#9B2C2C] text-sm px-3 py-2 mb-4">
            {error}
          </div>
        )}

        {loading ? (
          <div className="text-sm text-slate-600">Loading applications…</div>
        ) : submitted.length === 0 ? (
          <div className="text-sm text-slate-600">No submitted applications.</div>
        ) : (
          <div className="space-y-3">
            {submitted.map((a) => (
              <div key={a.id} className="rounded-2xl border border-slate-200 bg-white p-4">
                <div className="flex flex-col gap-1 sm:flex-row sm:items-start sm:justify-between">
                  <div>
                    <div className="text-base font-semibold text-slate-900">
                      {(a.first_name || "") + " " + (a.last_name || "")}
                    </div>
                    <div className="text-sm text-slate-600">{a.email}</div>
                    {a.request_role && (
                      <div className="text-xs text-slate-500 mt-1">
                        Requested role: <span className="font-medium">{a.request_role}</span>
                      </div>
                    )}
                  </div>

                  <div className="flex gap-2 mt-3 sm:mt-0">
                    <button
                      className="lc-button px-4 py-2 rounded-full disabled:opacity-70"
                      disabled={busyId === a.id}
                      onClick={() => act(a.id, "approve")}
                    >
                      {busyId === a.id ? "Working…" : "Approve"}
                    </button>

                    <button
                      className="px-4 py-2 rounded-full border border-slate-300 text-slate-800 hover:bg-slate-50 disabled:opacity-70"
                      disabled={busyId === a.id}
                      onClick={() => act(a.id, "reject")}
                    >
                      Reject
                    </button>
                  </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-3 gap-3 mt-4">
                  <Info label="Why joining" value={a.why_joining} />
                  <Info label="Experience" value={a.experience} />
                  <Info label="Values alignment" value={a.values_alignment} />
                </div>

                <div className="text-[11px] text-slate-400 mt-3">
                  Submitted: {new Date(a.created_at).toLocaleString()}
                </div>
              </div>
            ))}
          </div>
        )}
      </Panel>
    </PageShell>
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
