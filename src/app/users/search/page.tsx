"use client";

import Link from "next/link";
import { useState } from "react";

import { PageShell } from "@/components/ui/PageShell";
import { Panel } from "@/components/Panel";
import { Input } from "@/components/ui/Input";
import { Button } from "@/components/ui/Button";
import { Field } from "@/components/ui/Field";
import { FormRow } from "@/components/ui/FormRow";
import { FormActions } from "@/components/ui/FormActions";

type ResultRow = {
  id: string;
  email: string | null;
  first_name: string | null;
  last_name: string | null;
  screen_name: string | null;
  updated_at?: string | null;
};

export default function UserSearchPage() {
  const [email, setEmail] = useState("");
  const [first, setFirst] = useState("");
  const [last, setLast] = useState("");

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [results, setResults] = useState<ResultRow[]>([]);

  const canSearch = email.trim().length > 3 || last.trim().length >= 2; // staff rule

  async function onSearch(e: React.FormEvent) {
    e.preventDefault();
    if (!canSearch) return;

    setLoading(true);
    setError(null);
    setResults([]);

    try {
      const res = await fetch("/api/user-search", {
        
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email: email.trim(),
          first_name: first.trim(),
          last_name: last.trim(),
        }),
      });

      const json = await res.json();

console.log("user-search JSON:", json);
      if (!res.ok) {
        throw new Error(json?.error || "Search failed");
      }

      const nextResults = json.results ?? json.users ?? json.data ?? [];
      setResults(nextResults);

    } catch (err: any) {
      setError(err.message ?? "Search failed");
    } finally {
      setLoading(false);
    }
  }

  function onClear() {
    setEmail("");
    setFirst("");
    setLast("");
    setResults([]);
    setError(null);
  }

  return (
    <PageShell
      title="User Search"
      subtitle="Search by email or by real first/last name. Screen name is visible in User 360 but not searchable."
    >
      <div className="space-y-6">
        <Panel>
          <form onSubmit={onSearch} className="space-y-4">
            <Field label="Email" hint="Best match when available.">
              <Input
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                type="email"
                placeholder="name@example.com"
              />
            </Field>

            <div className="flex items-center gap-3 text-xs opacity-70">
              <div className="h-px flex-1 bg-[var(--panel-border)]" />
              <span>or</span>
              <div className="h-px flex-1 bg-[var(--panel-border)]" />
            </div>

            <FormRow className="md:grid-cols-2">
              <Field label="First name (optional)">
                <Input
                  value={first}
                  onChange={(e) => setFirst(e.target.value)}
                  type="text"
                  placeholder="First name"
                />
              </Field>

              <Field
                label="Last name *"
                hint="Required if email is not provided."
              >
                <Input
                  value={last}
                  onChange={(e) => setLast(e.target.value)}
                  type="text"
                  placeholder="Last name"
                />
              </Field>
            </FormRow>

            <FormActions className="items-center">
              <Button type="submit" disabled={!canSearch || loading}>
                {loading ? "Searching…" : "Search"}
              </Button>

              <Button type="button" variant="ghost" onClick={onClear}>
                Clear
              </Button>

              <p className="ml-auto text-xs opacity-70">
                Results limited to protect privacy.
              </p>
            </FormActions>

            {error && (
              <div className="rounded-lg border border-rose-300/50 bg-rose-500/10 px-3 py-2 text-sm text-rose-300">
                {error}
              </div>
            )}
          </form>
        </Panel>

        <Panel>
          <div className="flex items-center justify-between">
            <div className="text-sm font-semibold">Results</div>
            <div className="text-xs opacity-70">{results.length} found</div>
          </div>

          {results.length === 0 ? (
            <div className="mt-3 text-sm opacity-80">
              No results yet. Run a search above.
            </div>
          ) : (
            <div className="mt-4 overflow-hidden rounded-lg border border-[var(--panel-border)]">
              <table className="w-full text-left text-sm">
                <thead className="border-b border-[var(--panel-border)] bg-black/5 dark:bg-white/5">
                  <tr>
                    <th className="px-3 py-2 font-semibold">Name</th>
                    <th className="px-3 py-2 font-semibold">Email</th>
                    <th className="px-3 py-2 font-semibold">Screen name</th>
                    <th className="px-3 py-2 font-semibold">Updated</th>
                  </tr>
                </thead>
                <tbody>
                  {results.map((r) => (
                    <tr key={r.id} className="border-t border-[var(--panel-border)]">
                      <td className="px-3 py-2">
                        <Link
                          href={`/users/${r.id}`}
                          className="font-semibold hover:underline"
                        >
                          {((r.first_name ?? "") + " " + (r.last_name ?? "")).trim() || "—"}
                        </Link>
                      </td>
                      <td className="px-3 py-2 opacity-90">{r.email ?? "—"}</td>
                      <td className="px-3 py-2 opacity-90">{r.screen_name ?? "—"}</td>
                      <td className="px-3 py-2 opacity-70">
                        {r.updated_at ? new Date(r.updated_at).toLocaleString() : "—"}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Panel>
      </div>
    </PageShell>
  );
}
