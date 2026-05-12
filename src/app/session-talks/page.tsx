"use client";

import { useEffect, useMemo, useState } from "react";
import { supabaseBrowser } from "@/lib/supabaseBrowser";
import { Panel } from "@/components/Panel";
import PortalButton from "@/components/ui/PortalButton";

type TalkType = {
  id?: string;
  slug: string;
  title?: string | null;
  name?: string | null;
  label?: string | null;
  description?: string | null;
  display_order?: number | null;
  sort_order?: number | null;
  status?: string | null;
  source?: "table" | "session_talks";
  [key: string]: any;
};

type SessionTalk = {
  id: string;
  slug: string;
  title: string;
  talk_type_slug: string;
  topic_area: string | null;
  member_summary: string | null;
  coach_notes: string | null;
  default_capacity: number | null;
  default_duration_minutes: number | null;
  status: string | null;
  sort_order: number | null;
  created_at?: string | null;
  updated_at?: string | null;
};

const slugify = (value: string) =>
  value
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");

const titleizeSlug = (value: string) =>
  value
    .split(/[-_]/g)
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");

const talkTypeLabel = (talkType: TalkType) => {
  const label = talkType.title || talkType.name || talkType.label;
  return label?.trim() || titleizeSlug(talkType.slug || "untitled");
};

const talkTypeOrder = (talkType: TalkType) =>
  Number(talkType.display_order ?? talkType.sort_order ?? 9999);

const numberOrNull = (value: string) => {
  if (value.trim() === "") return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
};

export default function SessionTalksPage() {
  const supabase = supabaseBrowser;

  const [talkTypes, setTalkTypes] = useState<TalkType[]>([]);
  const [talks, setTalks] = useState<SessionTalk[]>([]);
  const [selectedTalkTypeSlug, setSelectedTalkTypeSlug] = useState<string | null>(
    null
  );
  const [selectedTalk, setSelectedTalk] = useState<SessionTalk | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);

  const refreshTalkTypes = async () => {
    const { data, error } = await supabase.from("session_talk_types").select("*");

    if (error) {
      console.error("Error loading session_talk_types:", error);
      setLoadError(
        `Could not load session_talk_types: ${error.message}. Session talks can still load from session_talks.`
      );
      setTalkTypes([]);
      return;
    }

    const mapped = ((data ?? []) as TalkType[])
      .filter((type) => !!type.slug)
      .map((type) => ({ ...type, source: "table" as const }))
      .sort((a, b) => {
        const orderCompare = talkTypeOrder(a) - talkTypeOrder(b);
        if (orderCompare !== 0) return orderCompare;
        return talkTypeLabel(a).localeCompare(talkTypeLabel(b));
      });

    setTalkTypes(mapped);
  };

  const refreshTalks = async () => {
    const { data, error } = await supabase
      .from("session_talks")
      .select(
        `id,
         slug,
         title,
         talk_type_slug,
         topic_area,
         member_summary,
         coach_notes,
         default_capacity,
         default_duration_minutes,
         status,
         sort_order,
         created_at,
         updated_at`
      )
      .order("sort_order", { ascending: true, nullsFirst: false })
      .order("title", { ascending: true });

    if (error) {
      console.error("Error loading session_talks:", error);
      setLoadError(`Could not load session_talks: ${error.message}`);
      setTalks([]);
      return;
    }

    setTalks((data ?? []) as SessionTalk[]);
  };

  const refreshAll = async () => {
    setIsLoading(true);
    setLoadError(null);

    await refreshTalkTypes();
    await refreshTalks();

    setIsLoading(false);
  };

  useEffect(() => {
    refreshAll();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const displayTalkTypes = useMemo(() => {
    const bySlug = new Map<string, TalkType>();

    talkTypes.forEach((type) => {
      if (type.slug) bySlug.set(type.slug, type);
    });

    talks.forEach((talk) => {
      if (!talk.talk_type_slug) return;
      if (!bySlug.has(talk.talk_type_slug)) {
        bySlug.set(talk.talk_type_slug, {
          slug: talk.talk_type_slug,
          title: titleizeSlug(talk.talk_type_slug),
          source: "session_talks",
        });
      }
    });

    return Array.from(bySlug.values()).sort((a, b) => {
      const orderCompare = talkTypeOrder(a) - talkTypeOrder(b);
      if (orderCompare !== 0) return orderCompare;
      return talkTypeLabel(a).localeCompare(talkTypeLabel(b));
    });
  }, [talkTypes, talks]);

  const filteredTalks = useMemo(() => {
    if (!selectedTalkTypeSlug) return talks;
    return talks.filter((talk) => talk.talk_type_slug === selectedTalkTypeSlug);
  }, [talks, selectedTalkTypeSlug]);

  useEffect(() => {
    if (selectedTalk) return;
    if (filteredTalks.length === 0) return;
    setSelectedTalk(filteredTalks[0]);
  }, [filteredTalks, selectedTalk]);

  useEffect(() => {
    if (!selectedTalk?.id) return;

    const freshSelectedTalk = talks.find((talk) => talk.id === selectedTalk.id);
    if (freshSelectedTalk) {
      setSelectedTalk(freshSelectedTalk);
    }
    // This should only run after a fresh table load, not after every local edit.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [talks]);

  const updateSelectedTalk = (patch: Partial<SessionTalk>) => {
    setSelectedTalk((prev) => (prev ? { ...prev, ...patch } : prev));
  };

  const handleSelectTalkType = (slug: string | null) => {
    setSelectedTalkTypeSlug(slug);
    setSelectedTalk(null);
  };

  const handleNewTalk = () => {
    const fallbackTypeSlug =
      selectedTalkTypeSlug || displayTalkTypes[0]?.slug || talks[0]?.talk_type_slug || "";

    const title = "New Session Talk";

    setSelectedTalk({
      id: "",
      title,
      slug: `${slugify(title)}-${Date.now().toString().slice(-5)}`,
      talk_type_slug: fallbackTypeSlug,
      topic_area: "",
      member_summary: "",
      coach_notes: "",
      default_capacity: 25,
      default_duration_minutes: 60,
      status: "draft",
      sort_order: filteredTalks.length + 1,
    });
  };

  const buildTalkPayload = (talk: SessionTalk) => ({
    title: talk.title.trim(),
    slug: talk.slug.trim(),
    talk_type_slug: talk.talk_type_slug.trim(),
    topic_area: talk.topic_area?.trim() || "",
    member_summary: talk.member_summary ?? "",
    coach_notes: talk.coach_notes ?? "",
    default_capacity: talk.default_capacity ?? null,
    default_duration_minutes: talk.default_duration_minutes ?? null,
    status: talk.status || "draft",
    sort_order: talk.sort_order ?? null,
    updated_at: new Date().toISOString(),
  });

  const handleSaveTalk = async () => {
    if (!selectedTalk) return;

    if (!selectedTalk.title?.trim()) {
      alert("Session talk title is required.");
      return;
    }

    if (!selectedTalk.slug?.trim()) {
      alert("Session talk slug is required.");
      return;
    }

    if (!selectedTalk.talk_type_slug?.trim()) {
      alert("Talk type is required.");
      return;
    }

    const payload = buildTalkPayload(selectedTalk);
    setIsSaving(true);

    if (!selectedTalk.id) {
      const { data, error } = await supabase
        .from("session_talks")
        .insert(payload)
        .select(
          `id,
           slug,
           title,
           talk_type_slug,
           topic_area,
           member_summary,
           coach_notes,
           default_capacity,
           default_duration_minutes,
           status,
           sort_order,
           created_at,
           updated_at`
        )
        .single();

      setIsSaving(false);

      if (error) {
        console.error("Error creating session talk:", error);
        alert(`Error creating session talk: ${error.message}`);
        return;
      }

      await refreshTalks();
      setSelectedTalk(data as SessionTalk);
      setSelectedTalkTypeSlug((data as SessionTalk).talk_type_slug || null);
      alert("Session talk created.");
      return;
    }

    const { data, error } = await supabase
      .from("session_talks")
      .update(payload)
      .eq("id", selectedTalk.id)
      .select(
        `id,
         slug,
         title,
         talk_type_slug,
         topic_area,
         member_summary,
         coach_notes,
         default_capacity,
         default_duration_minutes,
         status,
         sort_order,
         created_at,
         updated_at`
      )
      .single();

    setIsSaving(false);

    if (error) {
      console.error("Error saving session talk:", error);
      alert(`Error saving session talk: ${error.message}`);
      return;
    }

    await refreshTalks();
    setSelectedTalk(data as SessionTalk);
    setSelectedTalkTypeSlug((data as SessionTalk).talk_type_slug || null);
    alert("Session talk saved.");
  };

  const handleArchiveTalk = async () => {
    if (!selectedTalk?.id) return;

    const { error } = await supabase
      .from("session_talks")
      .update({ status: "archived", updated_at: new Date().toISOString() })
      .eq("id", selectedTalk.id);

    if (error) {
      console.error("Error archiving session talk:", error);
      alert(`Error archiving session talk: ${error.message}`);
      return;
    }

    await refreshTalks();
    setSelectedTalk(null);
    alert("Session talk archived.");
  };

  const selectedTypeLabel = selectedTalkTypeSlug
    ? talkTypeLabel(
        displayTalkTypes.find((type) => type.slug === selectedTalkTypeSlug) || {
          slug: selectedTalkTypeSlug,
        }
      )
    : "All Talk Types";

  return (
    <div className="w-full px-4 py-4 md:px-6">
      <div className="mx-auto w-full max-w-[1600px]">
        <Panel>
          <div className="mb-4 flex items-start justify-between gap-4">
            <div>
              <h1 className="text-xl font-semibold">Session Talks</h1>
              <p className="text-sm opacity-70">
                Staff access page for session_talks. Edit talk cards, member
                summaries, coach notes, capacity, duration, status, and sort order.
              </p>
            </div>

            <PortalButton onClick={refreshAll}>
              {isLoading ? "Refreshing..." : "Refresh"}
            </PortalButton>
          </div>

          {loadError && (
            <div className="mb-4 rounded-xl border border-red-300 bg-red-50 p-3 text-sm text-red-800">
              {loadError}
            </div>
          )}

          <div className="grid min-h-[70vh] grid-cols-12 gap-4">
            <div className="col-span-12 rounded-xl border p-4 lg:col-span-2">
              <h2 className="mb-2 text-sm font-semibold uppercase opacity-70">
                Talk Types
              </h2>

              <div className="space-y-2">
                <PortalButton
                  onClick={() => handleSelectTalkType(null)}
                  active={!selectedTalkTypeSlug}
                  className="block w-full text-left"
                >
                  All ({talks.length})
                </PortalButton>

                {displayTalkTypes.map((type) => {
                  const count = talks.filter(
                    (talk) => talk.talk_type_slug === type.slug
                  ).length;

                  return (
                    <PortalButton
                      key={type.id ?? type.slug}
                      onClick={() => handleSelectTalkType(type.slug)}
                      active={selectedTalkTypeSlug === type.slug}
                      className="block w-full text-left"
                    >
                      {talkTypeLabel(type)} ({count})
                    </PortalButton>
                  );
                })}
              </div>
            </div>

            <div className="col-span-12 rounded-xl border p-4 lg:col-span-3">
              <div className="mb-3 flex items-center justify-between gap-3">
                <div>
                  <h2 className="text-sm font-semibold uppercase opacity-70">
                    Session Talks
                  </h2>
                  <p className="text-xs opacity-60">{selectedTypeLabel}</p>
                </div>
              </div>

              <PortalButton onClick={handleNewTalk}>+ New Session Talk</PortalButton>

              <div className="mt-4 space-y-2">
                {filteredTalks.map((talk) => (
                  <PortalButton
                    key={talk.id}
                    onClick={() => setSelectedTalk(talk)}
                    active={selectedTalk?.id === talk.id}
                    className="block w-full text-left"
                  >
                    <div className="font-medium">{talk.title}</div>
                    <div className="text-xs opacity-70">
                      {talk.topic_area || "No topic area"} · {talk.talk_type_slug}
                    </div>
                    <div className="text-xs opacity-60">
                      {talk.status || "No status"} · Sort {talk.sort_order ?? "—"}
                    </div>
                  </PortalButton>
                ))}

                {!isLoading && filteredTalks.length === 0 && (
                  <div className="rounded-lg border p-3 text-sm opacity-60">
                    No rows found in session_talks for this talk type.
                  </div>
                )}
              </div>
            </div>

            <div className="col-span-12 rounded-xl border p-4 lg:col-span-7">
              {selectedTalk ? (
                <>
                  <div className="mb-3 flex items-center justify-between gap-3">
                    <h2 className="text-sm font-semibold uppercase opacity-70">
                      Edit session_talks row
                    </h2>

                    {selectedTalk.id && (
                      <PortalButton onClick={handleArchiveTalk}>Archive</PortalButton>
                    )}
                  </div>

                  <div className="mb-3 grid grid-cols-1 gap-3 md:grid-cols-2">
                    <label className="text-sm">
                      <span className="mb-1 block font-medium">Title</span>
                      <input
                        className="h-[44px] w-full rounded-lg border px-3 py-2"
                        value={selectedTalk.title ?? ""}
                        onChange={(event) => {
                          const title = event.target.value;
                          updateSelectedTalk({
                            title,
                            slug: selectedTalk.id ? selectedTalk.slug : slugify(title),
                          });
                        }}
                        placeholder="Session talk title"
                      />
                    </label>

                    <label className="text-sm">
                      <span className="mb-1 block font-medium">Slug</span>
                      <input
                        className="h-[44px] w-full rounded-lg border px-3 py-2"
                        value={selectedTalk.slug ?? ""}
                        onChange={(event) =>
                          updateSelectedTalk({ slug: slugify(event.target.value) })
                        }
                        placeholder="slug"
                      />
                    </label>
                  </div>

                  <div className="mb-3 grid grid-cols-1 gap-3 md:grid-cols-2">
                    <label className="text-sm">
                      <span className="mb-1 block font-medium">Talk Type</span>
                      <select
                        className="h-[44px] w-full rounded-lg border px-3 py-2"
                        value={selectedTalk.talk_type_slug ?? ""}
                        onChange={(event) =>
                          updateSelectedTalk({ talk_type_slug: event.target.value })
                        }
                      >
                        <option value="">Select talk type</option>
                        {displayTalkTypes.map((type) => (
                          <option key={type.id ?? type.slug} value={type.slug}>
                            {talkTypeLabel(type)}
                          </option>
                        ))}
                      </select>
                    </label>

                    <label className="text-sm">
                      <span className="mb-1 block font-medium">Topic Area</span>
                      <input
                        className="h-[44px] w-full rounded-lg border px-3 py-2"
                        value={selectedTalk.topic_area ?? ""}
                        onChange={(event) =>
                          updateSelectedTalk({ topic_area: event.target.value })
                        }
                        placeholder="Topic area"
                      />
                    </label>
                  </div>

                  <div className="mb-3 grid grid-cols-1 gap-3 md:grid-cols-4">
                    <label className="text-sm">
                      <span className="mb-1 block font-medium">Status</span>
                      <select
                        className="h-[44px] w-full rounded-lg border px-3 py-2"
                        value={selectedTalk.status ?? "draft"}
                        onChange={(event) =>
                          updateSelectedTalk({ status: event.target.value })
                        }
                      >
                        <option value="draft">Draft</option>
                        <option value="active">Active</option>
                        <option value="published">Published</option>
                        <option value="hidden">Hidden</option>
                        <option value="archived">Archived</option>
                      </select>
                    </label>

                    <label className="text-sm">
                      <span className="mb-1 block font-medium">Sort Order</span>
                      <input
                        className="h-[44px] w-full rounded-lg border px-3 py-2"
                        type="number"
                        value={selectedTalk.sort_order ?? ""}
                        onChange={(event) =>
                          updateSelectedTalk({
                            sort_order: numberOrNull(event.target.value),
                          })
                        }
                        placeholder="Sort"
                      />
                    </label>

                    <label className="text-sm">
                      <span className="mb-1 block font-medium">Capacity</span>
                      <input
                        className="h-[44px] w-full rounded-lg border px-3 py-2"
                        type="number"
                        value={selectedTalk.default_capacity ?? ""}
                        onChange={(event) =>
                          updateSelectedTalk({
                            default_capacity: numberOrNull(event.target.value),
                          })
                        }
                        placeholder="Capacity"
                      />
                    </label>

                    <label className="text-sm">
                      <span className="mb-1 block font-medium">Duration</span>
                      <input
                        className="h-[44px] w-full rounded-lg border px-3 py-2"
                        type="number"
                        value={selectedTalk.default_duration_minutes ?? ""}
                        onChange={(event) =>
                          updateSelectedTalk({
                            default_duration_minutes: numberOrNull(
                              event.target.value
                            ),
                          })
                        }
                        placeholder="Minutes"
                      />
                    </label>
                  </div>

                  <label className="mb-3 block text-sm">
                    <span className="mb-1 block font-medium">Member Summary</span>
                    <textarea
                      className="w-full rounded-lg border px-3 py-2"
                      rows={6}
                      value={selectedTalk.member_summary ?? ""}
                      onChange={(event) =>
                        updateSelectedTalk({ member_summary: event.target.value })
                      }
                      placeholder="This is the summary members see for this session talk."
                    />
                  </label>

                  <label className="mb-4 block text-sm">
                    <span className="mb-1 block font-medium">Coach Notes</span>
                    <textarea
                      className="w-full rounded-lg border px-3 py-2"
                      rows={5}
                      value={selectedTalk.coach_notes ?? ""}
                      onChange={(event) =>
                        updateSelectedTalk({ coach_notes: event.target.value })
                      }
                      placeholder="Internal staff notes for this talk."
                    />
                  </label>

                  <div className="mb-4 rounded-xl border p-4">
                    <h3 className="mb-2 text-sm font-semibold uppercase opacity-70">
                      User Card Preview
                    </h3>
                    <div className="rounded-lg border p-4">
                      <div className="text-lg font-semibold">
                        {selectedTalk.title || "Session talk title"}
                      </div>
                      <div className="mt-1 text-sm opacity-70">
                        {selectedTalk.topic_area || "Topic area"} ·{" "}
                        {selectedTalk.talk_type_slug || "talk type"}
                      </div>
                      <p className="mt-3 text-sm">
                        {selectedTalk.member_summary ||
                          "The member summary will appear here."}
                      </p>
                      <div className="mt-3 text-xs opacity-60">
                        {selectedTalk.default_duration_minutes ?? "—"} minutes ·{" "}
                        {selectedTalk.default_capacity ?? "—"} seats ·{" "}
                        {selectedTalk.status || "No status"}
                      </div>
                    </div>
                  </div>

                  <PortalButton onClick={handleSaveTalk}>
                    {isSaving ? "Saving..." : "Save Session Talk"}
                  </PortalButton>
                </>
              ) : (
                <div className="opacity-60">
                  {isLoading
                    ? "Loading session_talks..."
                    : "Select a session talk to edit."}
                </div>
              )}
            </div>
          </div>
        </Panel>
      </div>
    </div>
  );
}
