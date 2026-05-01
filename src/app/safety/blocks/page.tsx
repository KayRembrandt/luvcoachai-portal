import { PageShell } from "@/components/ui/PageShell";
import { Panel } from "@/components/Panel";
import { createSupabaseServerClient } from "@/lib/supabaseServer";


type BlockRow = {
  id: string;
  blocker_id: string;
  blocked_id: string;
  reason: string;
  note: string | null;
  created_via: string | null;
  created_at: string;
};

export default async function Page() {
  const supabase = await createSupabaseServerClient();

  const { data, error } = await supabase
    .from("user_blocks")
    .select("id, blocker_id, blocked_id, reason, note, created_via, created_at")
    .order("created_at", { ascending: false })
    .limit(200);

  return (
    <PageShell title="Safety • Blocks">
      <Panel>
        <div className="text-sm text-gray-600 mb-4">
          Report & Block actions (read-only). Used for safety review and to exclude blocked users from discovery.
        </div>

        {error && (
          <div className="text-sm text-red-600">
            Failed to load blocks: {error.message}
          </div>
        )}

        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left border-b">
                <th className="py-3 pr-4">When</th>
                <th className="py-3 pr-4">Blocker</th>
                <th className="py-3 pr-4">Blocked</th>
                <th className="py-3 pr-4">Reason</th>
                <th className="py-3 pr-4">Notes</th>
                <th className="py-3 pr-4">Via</th>
              </tr>
            </thead>
            <tbody>
              {(data ?? []).map((row: BlockRow) => (
                <tr key={row.id} className="border-b align-top">
                  <td className="py-3 pr-4 whitespace-nowrap">
                    {new Date(row.created_at).toLocaleString()}
                  </td>
                  <td className="py-3 pr-4 font-mono text-xs">{row.blocker_id}</td>
                  <td className="py-3 pr-4 font-mono text-xs">{row.blocked_id}</td>
                  <td className="py-3 pr-4 whitespace-nowrap">{row.reason}</td>
                  <td className="py-3 pr-4 max-w-[520px]">
                    <div className="whitespace-pre-wrap break-words">
                      {row.note ?? "—"}
                    </div>
                  </td>
                  <td className="py-3 pr-4 whitespace-nowrap">{row.created_via ?? "—"}</td>
                </tr>
              ))}

              {!error && (data?.length ?? 0) === 0 && (
                <tr>
                  <td className="py-6 text-sm text-gray-500" colSpan={6}>
                    No blocks yet.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </Panel>
    </PageShell>
  );
}
