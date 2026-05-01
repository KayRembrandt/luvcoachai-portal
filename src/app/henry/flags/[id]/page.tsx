import { notFound } from "next/navigation";
import Link from "next/link";
import {PageShell} from "@/components/ui/PageShell";
import {Panel} from "@/components/Panel";
import { createSupabaseServiceClient } from "@/lib/supabaseService";

type FlagRow = {
  id: string;
  conversation_id: string;
  message_id: string | null;
  user_id: string;
  target_user_id: string | null;
  flag_type: string;
  severity: string;
  confidence: number | null;
  summary: string;
  evidence_json: { snippet?: string } | null;
  review_status: string;
  created_at: string;
  reviewed_at: string | null;
  reviewed_by: string | null;
};

type MessageRow = {
  id: string;
  sender_id: string;
  recipient_id: string;
  content: string;
  created_at: string;
  read_at: string | null;
};

type ParticipantProfile = {
  id: string;
  screen_name: string | null;
  display_name: string | null;
  real_name: string | null;
};

export default async function HenryFlagDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const supabase = createSupabaseServiceClient();


  const { data: flag, error: flagErr } = await supabase
    .from("henry_chat_flags")
    .select(
      "id, conversation_id, message_id, user_id, target_user_id, flag_type, severity, confidence, summary, evidence_json, review_status, created_at, reviewed_at, reviewed_by"
    )
    .eq("id", id)
    .single();

  if (flagErr || !flag) notFound();

  const typedFlag = flag as FlagRow;

  const participantIds = [
  typedFlag.user_id,
  typedFlag.target_user_id,
].filter(Boolean) as string[];

const { data: participantProfiles, error: participantProfilesErr } = await supabase
  .from("profiles")
  .select("id, screen_name, display_name, real_name")
  .in("id", participantIds);

if (participantProfilesErr) {
  console.error("participant profile lookup error:", participantProfilesErr);
}

const profilesById = new Map(
  ((participantProfiles ?? []) as ParticipantProfile[]).map((profile) => [
    profile.id,
    profile,
  ])
);

const flaggedUserProfile = profilesById.get(typedFlag.user_id) ?? null;
const otherUserProfile = typedFlag.target_user_id
  ? profilesById.get(typedFlag.target_user_id) ?? null
  : null;

function getBestName(profile: ParticipantProfile | null, fallback: string) {
  if (!profile) return fallback;
  return (
    profile.screen_name ||
    profile.display_name ||
    profile.real_name ||
    fallback
  );
}

  const { count: recentFlagCount } = await supabase
  .from("henry_chat_flags")
  .select("*", { count: "exact", head: true })
  .eq("user_id", typedFlag.user_id)
  .gte(
    "created_at",
    new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString()
  );
  const isRepeatConcern = (recentFlagCount ?? 0) >= 3;
  const { data: messages, error: messagesErr } = await supabase
    .from("connection_conversation")
    .select("id, sender_id, recipient_id, content, created_at, read_at")
    .eq("conversation_id", typedFlag.conversation_id)
    .order("created_at", { ascending: false })
    .limit(25);

  if (messagesErr) {
    console.error("flag detail messages error:", messagesErr);
  }

  const orderedMessages = ((messages ?? []) as MessageRow[]).reverse();

  return (
    <PageShell
      title="Henry Flag Review"
      subtitle="Review the flagged conversation in context before taking action."
    >
      <div className="mb-4">
        <Link href="/henry" className="text-lg opacity-70 hover:opacity-100">
          ← Back to Henry Desk
        </Link>
      </div>

      <div className="grid gap-6 xl:grid-cols-[1.1fr_0.9fr]">
        <Panel>
          <div className="flex items-start justify-between gap-4">
            <div>
              <div className="text-sm uppercase tracking-wide opacity-60">
                Flag
              </div>
              <h2 className="mt-1 text-2xl font-semibold">
                {typedFlag.flag_type.replaceAll("_", " ")}
              </h2>
              <p className="mt-2 text-sm opacity-80">{typedFlag.summary}</p>
            </div>

            <div
              className={`rounded-full px-3 py-1 text-xs font-semibold uppercase ${
                typedFlag.severity === "high"
                  ? "bg-red-100 text-red-600"
                  : typedFlag.severity === "medium"
                  ? "bg-yellow-100 text-yellow-700"
                  : "bg-gray-100 text-gray-600"
              }`}
            >
              {typedFlag.severity}
            </div>
          </div>
<div className="mt-6">
  <Panel>
    <h3 className="text-lg font-semibold">Participants</h3>

    <div className="mt-4 grid gap-4 md:grid-cols-2">
      <div className="rounded-xl border p-4">
        <div className="text-xs uppercase opacity-60">Flagged user</div>
        <div className="mt-2 text-lg font-semibold">
          {getBestName(flaggedUserProfile, "Unknown user")}
        </div>
        <div className="mt-2 break-all text-sm opacity-70">
          {typedFlag.user_id}
        </div>

        <div className="mt-4">
          <Link
            href={`/users/${typedFlag.target_user_id}`}
            className="text-sm font-medium opacity-80 hover:opacity-100"
          >
            Open User 360 →
          </Link>
        </div>
      </div>

      <div className="rounded-xl border p-4">
        <div className="text-xs uppercase opacity-60">Other participant</div>
        <div className="mt-2 text-lg font-semibold">
          {getBestName(otherUserProfile, "Unknown user")}
        </div>
        <div className="mt-2 break-all text-sm opacity-70">
          {typedFlag.target_user_id ?? "—"}
        </div>

        {typedFlag.target_user_id ? (
          <div className="mt-4">
            <Link
              href={`/users/${typedFlag.target_user_id}`}
              className="text-sm font-medium opacity-80 hover:opacity-100"
            >
              Open User 360 →
            </Link>
          </div>
        ) : null}
      </div>
    </div>
  </Panel>
</div>
          <div className="mt-6 grid gap-3 md:grid-cols-2">
            <div className="rounded-xl border p-3">
              <div className="text-xs uppercase opacity-60">Review status</div>
              <div className="mt-1 font-medium">{typedFlag.review_status}</div>
            </div>

            <div className="rounded-xl border p-3">
              <div className="text-xs uppercase opacity-60">Confidence</div>
              <div className="mt-1 font-medium">
                {typedFlag.confidence ?? "—"}
              </div>
            </div>

            <div className="rounded-xl border p-3">
              <div className="text-xs uppercase opacity-60">Created</div>
              <div className="mt-1 font-medium">
                {new Date(typedFlag.created_at).toLocaleString()}
              </div>
            </div>

            <div className="rounded-xl border p-3">
              <div className="text-xs uppercase opacity-60">Conversation ID</div>
              <div className="mt-1 break-all text-sm">
                {typedFlag.conversation_id}
              </div>
            </div>
          </div>

          <div className="mt-6">
            <div className="text-sm uppercase tracking-wide opacity-60">
              Henry evidence
            </div>
            <div className="mt-2 rounded-xl border p-3 text-sm whitespace-pre-wrap opacity-80">
              {typedFlag.evidence_json?.snippet || "No snippet saved."}
            </div>
          </div>
        </Panel>

        <Panel>
          <h3 className="text-lg font-semibold">Actions</h3>

          <div className="mt-4 space-y-3">
            <form action={`/api/henry/flags/${typedFlag.id}/review`} method="post">
              <button
                type="submit"
                className="w-full rounded-xl border px-4 py-3 text-left hover:shadow-sm"
              >
                <div className="font-medium">Mark reviewed</div>
                <div className="mt-1 text-sm opacity-70">
                  Keeps the flag but marks it handled by staff.
                </div>
              </button>
            </form>

            <form action={`/api/henry/flags/${typedFlag.id}/dismiss`} method="post">
              <button
                type="submit"
                className="w-full rounded-xl border px-4 py-3 text-left hover:shadow-sm"
              >
                <div className="font-medium">Dismiss flag</div>
                <div className="mt-1 text-sm opacity-70">
                  Use if the conversation was reviewed and the flag is not actionable.
                </div>
              </button>
            </form>
          </div>
        </Panel>
      </div>

      <div className="mt-6">
        <Panel>
          <h3 className="text-lg font-semibold">Recent conversation context</h3>

          <div className="mt-4 space-y-3">
            {orderedMessages.length ? (
              orderedMessages.map((message) => {
                const isFlaggedUser = message.sender_id === typedFlag.user_id;

                return (
                  <div
                    key={message.id}
                    className={`rounded-xl border p-3 ${
                      isFlaggedUser ? "bg-red-50/40" : ""
                    }`}
                  >
                    <div className="flex items-center justify-between gap-3">
                      <div className="text-sm font-medium">
                        {isFlaggedUser ? "Flagged user" : "Other participant"}
                      </div>
                      <div className="text-xs opacity-60">
                        {new Date(message.created_at).toLocaleString()}
                      </div>
                    </div>

                    <div className="mt-2 whitespace-pre-wrap text-sm">
                      {message.content}
                    </div>
                  </div>
                );
              })
            ) : (
              <div className="opacity-70">No conversation messages found.</div>
            )}
          </div>
        </Panel>
      </div>
    </PageShell>
  );
}