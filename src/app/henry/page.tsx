import { createSupabaseServiceClient } from "@/lib/supabaseService";
import { PageShell } from "@/components/ui/PageShell";
import { Panel } from "@/components/Panel";
import Link from "next/link";

export default async function HenryPage() {
  const supabase = createSupabaseServiceClient();

  const [{ count: pendingFlags }, { count: openJobs }, { data: recentFlags }, { data: recentJobs }] =
    await Promise.all([
      supabase
        .from("henry_chat_flags")
        .select("*", { count: "exact", head: true })
        .eq("review_status", "pending"),

      supabase
        .from("henry_jobs")
        .select("*", { count: "exact", head: true })
        .in("status", ["open", "in_progress"]),

      supabase
        .from("henry_chat_flags")
        .select("id, created_at, flag_type, severity, summary, conversation_id, user_id")
        .eq("review_status", "pending")
        .order("created_at", { ascending: false })
        .limit(12),

      supabase
        .from("henry_jobs")
        .select("id, created_at, title, priority, status, summary, conversation_id, user_id")
        .in("status", ["open", "in_progress"])
        .order("created_at", { ascending: false })
        .limit(12),
    ]);

  return (
    <PageShell
      title="Henry Desk"
      subtitle="Conversation safety, authenticity watch, and staff awareness."
    >
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <Panel>
         {recentFlags?.length ? (
  recentFlags.map((flag) => (
    <Link key={flag.id} href={`/henry/flags/${flag.id}`} className="block">
      <div className="rounded-xl border p-3 transition hover:shadow-sm">
        <div className="flex items-center justify-between gap-3">
          <div className="font-medium">{flag.flag_type.replaceAll("_", " ")}</div>

          <div
            className={`rounded-full px-2 py-1 text-xs font-semibold uppercase ${
              flag.severity === "high"
                ? "bg-red-100 text-red-600"
                : flag.severity === "medium"
                ? "bg-yellow-100 text-yellow-700"
                : "bg-gray-100 text-gray-600"
            }`}
          >
            {flag.severity}
          </div>
        </div>

        <p className="mt-2 text-sm opacity-80">{flag.summary}</p>
      </div>
    </Link>
  ))
) : (
  <div className="opacity-70">No pending chat flags.</div>
)}
        </Panel>

        <Panel>
          <div className="text-sm opacity-70">Open jobs</div>
          <div className="mt-2 text-3xl font-semibold">{openJobs ?? 0}</div>
        </Panel>

        <Panel>
          <div className="text-sm opacity-70">High-risk review</div>
          <div className="mt-2 text-base">Urgent items should appear here first.</div>
        </Panel>

        <Panel>
          <div className="text-sm opacity-70">Authenticity watch</div>
          <div className="mt-2 text-base">Cross-conversation catfishing signals come next.</div>
        </Panel>
      </div>

      <div className="mt-6 grid gap-6 xl:grid-cols-2">
        <Panel>
          <h2 className="text-lg font-semibold">Recent chat flags</h2>
          <div className="mt-4 space-y-3">
            {recentFlags?.length ? (
              recentFlags.map((flag) => (
                <div key={flag.id} className="rounded-xl border p-3">
                  <div className="flex items-center justify-between gap-3">
                    <div className="font-medium">{flag.flag_type.replaceAll("_", " ")}</div>
                   <div
  className={`text-xs font-semibold px-2 py-1 rounded-full ${
    flag.severity === "high"
      ? "bg-red-100 text-red-600"
      : flag.severity === "medium"
      ? "bg-yellow-100 text-yellow-700"
      : "bg-gray-100 text-gray-600"
  }`}
>
  {flag.severity}
</div>
                  </div>
                  <p className="mt-2 text-sm opacity-80">{flag.summary}</p>
                </div>
              ))
            ) : (
              <div className="opacity-70">No pending chat flags.</div>
            )}
          </div>
          
        </Panel>

        <Panel>
          <h2 className="text-lg font-semibold">Open Henry jobs</h2>
          <div className="mt-4 space-y-3">
            {recentJobs?.length ? (
              recentJobs.map((job) => (
                <div key={job.id} className="rounded-xl border p-3">
                  <div className="flex items-center justify-between gap-3">
                    <div className="font-medium">{job.title}</div>
                    <div className="text-sm uppercase opacity-70">{job.priority}</div>
                  </div>
                  <p className="mt-2 text-sm opacity-80">{job.summary}</p>
                </div>
              ))
            ) : (
              <div className="opacity-70">No open Henry jobs.</div>
            )}
          </div>
        </Panel>
      </div>
    </PageShell>
  );
}