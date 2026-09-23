"use client";

import { useEffect, useMemo, useState, type ReactNode } from "react";
import { supabaseBrowser } from "@/lib/supabaseBrowser";
import { PortalIcon } from "@/components/portal/PortalIcon";
import styles from "./session-talks.module.css";

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

/** Presentation helpers only. Persistence and selection logic below are unchanged. */
function TalkField({
  id,
  label,
  hint,
  children,
}: {
  id: string;
  label: string;
  hint?: string;
  children: ReactNode;
}) {
  return (
    <div className={styles.field}>
      <label htmlFor={id}>{label}</label>
      {children}
      {hint && <p id={`${id}-hint`} className={styles.fieldHint}>{hint}</p>}
    </div>
  );
}

function TalkStatus({ value }: { value: string | null }) {
  return (
    <span className={styles.status} data-status={value?.toLowerCase() || "unknown"}>
      {value ? titleizeSlug(value) : "No status"}
    </span>
  );
}

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

  // Resolve the label for display only; the database still stores talk_type_slug.
  const selectedTalkTypeLabel = selectedTalk
    ? talkTypeLabel(
        displayTalkTypes.find((type) => type.slug === selectedTalk.talk_type_slug) || {
          slug: selectedTalk.talk_type_slug || "",
        }
      )
    : "";

  return (
    <div className={styles.page}>
      {/* Compact heading. The writing area gets the room, not a large banner. */}
      <header className={styles.pageHeader}>
        <div className={styles.headingGroup}>
          <span className={styles.headingIcon} aria-hidden="true">
            <PortalIcon name="chat" />
          </span>
          <div>
            <h1>Session Talks</h1>
            <p>Shape the conversation. Prepare the details and the member summary.</p>
          </div>
        </div>
        <button
          type="button"
          className={styles.secondaryButton}
          onClick={() => void refreshAll()}
          disabled={isLoading || isSaving}
        >
          <PortalIcon name="refresh" />
          {isLoading ? "Refreshing…" : "Refresh"}
        </button>
      </header>

      {loadError && (
        <div className={styles.error} role="alert">
          <PortalIcon name="alert" />
          <p>{loadError}</p>
        </div>
      )}

      <div className={styles.workspace}>
        {/* 1. Talk types — filtering uses the existing table and fallback types. */}
        <section className={styles.listPanel} aria-labelledby="talk-types-heading">
          <div className={styles.panelHeading} data-tone="indigo">
            <span className={styles.stepNumber}>1</span>
            <div>
              <h2 id="talk-types-heading">Talk Types</h2>
              <p>Choose a conversation format.</p>
            </div>
          </div>
          <ul className={styles.typeList} aria-label="Filter session talks">
            <li>
              <button
                type="button"
                className={styles.typeButton}
                data-active={!selectedTalkTypeSlug}
                aria-pressed={!selectedTalkTypeSlug}
                onClick={() => handleSelectTalkType(null)}
                disabled={isSaving || isLoading}
              >
                <PortalIcon name="chat" />
                <span className={styles.typeName}>All Talk Types</span>
                <span className={styles.count}>{talks.length}</span>
              </button>
            </li>
            {displayTalkTypes.map((type) => {
              const count = talks.filter(
                (talk) => talk.talk_type_slug === type.slug
              ).length;
              const active = selectedTalkTypeSlug === type.slug;

              return (
                <li key={type.id ?? type.slug}>
                  <button
                    type="button"
                    className={styles.typeButton}
                    data-active={active}
                    aria-pressed={active}
                    onClick={() => handleSelectTalkType(type.slug)}
                    disabled={isSaving || isLoading}
                  >
                    <PortalIcon name="chat" />
                    <span className={styles.typeName}>{talkTypeLabel(type)}</span>
                    <span className={styles.count}>{count}</span>
                  </button>
                </li>
              );
            })}
          </ul>
          <div className={styles.panelNote}>
            <PortalIcon name="info" />
            <p>Filter by talk type, then choose a session talk to edit.</p>
          </div>
        </section>

        {/* 2. Talks — counts, status and ordering all come from the loaded records. */}
        <section className={styles.listPanel} aria-labelledby="talk-library-heading">
          <div className={styles.panelHeading} data-tone="coral">
            <span className={styles.stepNumber}>2</span>
            <div>
              <h2 id="talk-library-heading">Session Talks</h2>
              <p>{selectedTypeLabel}</p>
            </div>
          </div>
          <div className={styles.listToolbar}>
            <button
              type="button"
              className={styles.primaryButton}
              onClick={handleNewTalk}
              disabled={isSaving || isLoading}
            >
              <span className={styles.plus} aria-hidden="true">+</span>
              New Session Talk
            </button>
            <p className={styles.listCount} role="status">
              {isLoading
                ? "Loading session talks…"
                : `${filteredTalks.length} ${filteredTalks.length === 1 ? "talk" : "talks"} in this view`}
            </p>
          </div>
          <ul className={styles.talkList} aria-label="Session talks">
            {filteredTalks.map((talk) => {
              const active = selectedTalk?.id === talk.id;
              const typeName = talkTypeLabel(
                displayTalkTypes.find((type) => type.slug === talk.talk_type_slug) || {
                  slug: talk.talk_type_slug || "",
                }
              );

              return (
                <li key={talk.id}>
                  <button
                    type="button"
                    className={styles.talkButton}
                    data-active={active}
                    aria-pressed={active}
                    disabled={isSaving || isLoading}
                    onClick={() => setSelectedTalk(talk)}
                  >
                    <span className={styles.talkTopline}>
                      <span className={styles.order}>Sort {talk.sort_order ?? "—"}</span>
                      <TalkStatus value={talk.status} />
                    </span>
                    <span className={styles.talkTitle}>{talk.title}</span>
                    <span className={styles.talkTopic}>{talk.topic_area || "No topic area"}</span>
                    <span className={styles.talkType}>{typeName}</span>
                    <span className={styles.openLabel}>
                      {active ? "Editing this talk" : "Open talk"}
                      <PortalIcon name={active ? "check" : "arrowRight"} />
                    </span>
                  </button>
                </li>
              );
            })}
          </ul>
          {!isLoading && filteredTalks.length === 0 && (
            <div className={styles.smallEmpty}>
              <PortalIcon name="chat" />
              <p>No session talks in this view yet. Create one to begin.</p>
            </div>
          )}
          <div className={styles.panelNote}>
            <PortalIcon name="info" />
            <p>Save your edits before changing talks or refreshing.</p>
          </div>
        </section>

        {/* 3. The editor keeps every original field and save/archive handler. */}
        <section className={styles.editorPanel} aria-labelledby="talk-editor-heading">
          {selectedTalk ? (
            <>
              <div className={styles.editorHeading}>
                <div className={styles.editorTitleGroup}>
                  <PortalIcon name="clipboard" />
                  <div>
                    <p className={styles.eyebrow}>
                      {selectedTalk.id ? "Edit session talk" : "New session talk · Not saved yet"}
                    </p>
                    <h2 id="talk-editor-heading">
                      {selectedTalk.title || "Untitled session talk"}
                    </h2>
                  </div>
                </div>
                <div className={styles.editorActions}>
                  <button
                    type="button"
                    className={styles.primaryButton}
                    onClick={() => void handleSaveTalk()}
                    disabled={isSaving || isLoading}
                  >
                    <PortalIcon name="check" />
                    {isSaving ? "Saving…" : "Save Session Talk"}
                  </button>
                  {selectedTalk.id && (
                    <button
                      type="button"
                      className={styles.archiveButton}
                      onClick={() => void handleArchiveTalk()}
                      disabled={isSaving || isLoading}
                    >
                      Archive
                    </button>
                  )}
                </div>
              </div>

              <fieldset className={styles.editorFields} disabled={isSaving || isLoading}>
                <legend className={styles.visuallyHidden}>Session talk details</legend>

                <div className={styles.sectionHeading}>
                  <span className={styles.sectionIcon} data-tone="indigo"><PortalIcon name="calendar" /></span>
                  <div>
                    <h3>Talk details</h3>
                    <p>Set the title, format and topic.</p>
                  </div>
                </div>

                <TalkField id="talk-title" label="Title">
                  <input
                    id="talk-title"
                    className={styles.control}
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
                </TalkField>

                <TalkField
                  id="talk-slug"
                  label="Slug"
                  hint="The saved identifier for this talk. New titles generate a slug until the talk is first saved."
                >
                  <input
                    id="talk-slug"
                    className={styles.control}
                    value={selectedTalk.slug ?? ""}
                    onChange={(event) => updateSelectedTalk({ slug: slugify(event.target.value) })}
                    placeholder="session-talk-slug"
                    aria-describedby="talk-slug-hint"
                  />
                </TalkField>

                <div className={styles.fieldRow}>
                  <TalkField id="talk-type" label="Talk Type">
                    <select
                      id="talk-type"
                      className={styles.control}
                      value={selectedTalk.talk_type_slug ?? ""}
                      onChange={(event) => updateSelectedTalk({ talk_type_slug: event.target.value })}
                    >
                      <option value="">Select talk type</option>
                      {displayTalkTypes.map((type) => (
                        <option key={type.id ?? type.slug} value={type.slug}>
                          {talkTypeLabel(type)}
                        </option>
                      ))}
                    </select>
                  </TalkField>
                  <TalkField id="talk-topic" label="Topic Area">
                    <input
                      id="talk-topic"
                      className={styles.control}
                      value={selectedTalk.topic_area ?? ""}
                      onChange={(event) => updateSelectedTalk({ topic_area: event.target.value })}
                      placeholder="Topic area"
                    />
                  </TalkField>
                </div>

                <div className={styles.settingsBox}>
                  <h3>Session settings</h3>
                  <div className={styles.settingsGrid}>
                    <TalkField id="talk-status" label="Status">
                      <select
                        id="talk-status"
                        className={styles.control}
                        value={selectedTalk.status ?? "draft"}
                        onChange={(event) => updateSelectedTalk({ status: event.target.value })}
                      >
                        <option value="draft">Draft</option>
                        <option value="active">Active</option>
                        <option value="published">Published</option>
                        <option value="hidden">Hidden</option>
                        <option value="archived">Archived</option>
                      </select>
                    </TalkField>
                    <TalkField id="talk-sort" label="Sort Order">
                      <input
                        id="talk-sort"
                        className={styles.control}
                        type="number"
                        value={selectedTalk.sort_order ?? ""}
                        onChange={(event) => updateSelectedTalk({ sort_order: numberOrNull(event.target.value) })}
                        placeholder="Sort"
                      />
                    </TalkField>
                    <TalkField id="talk-capacity" label="Capacity">
                      <input
                        id="talk-capacity"
                        className={styles.control}
                        type="number"
                        value={selectedTalk.default_capacity ?? ""}
                        onChange={(event) => updateSelectedTalk({ default_capacity: numberOrNull(event.target.value) })}
                        placeholder="Seats"
                      />
                    </TalkField>
                    <TalkField id="talk-duration" label="Duration (minutes)">
                      <input
                        id="talk-duration"
                        className={styles.control}
                        type="number"
                        value={selectedTalk.default_duration_minutes ?? ""}
                        onChange={(event) => updateSelectedTalk({ default_duration_minutes: numberOrNull(event.target.value) })}
                        placeholder="Minutes"
                      />
                    </TalkField>
                  </div>
                </div>

                <div className={styles.writingSection}>
                  <div className={styles.sectionHeading}>
                    <span className={styles.sectionIcon} data-tone="coral"><PortalIcon name="chat" /></span>
                    <div>
                      <h3>Member-facing content</h3>
                      <p>Describe what the conversation will explore.</p>
                    </div>
                  </div>
                  <TalkField
                    id="talk-summary"
                    label="Member Summary"
                    hint="The card preview below updates as you write. Edits are not saved automatically."
                  >
                    <textarea
                      id="talk-summary"
                      className={`${styles.control} ${styles.summaryInput}`}
                      rows={9}
                      value={selectedTalk.member_summary ?? ""}
                      onChange={(event) => updateSelectedTalk({ member_summary: event.target.value })}
                      placeholder="This is the summary members see for this session talk."
                      aria-describedby="talk-summary-hint"
                    />
                  </TalkField>
                </div>

                <div className={styles.notesSection}>
                  <div className={styles.sectionHeading}>
                    <span className={styles.sectionIcon} data-tone="sage"><PortalIcon name="clipboard" /></span>
                    <div>
                      <h3>Coach preparation</h3>
                      <p>Notes for this talk, separate from the member summary.</p>
                    </div>
                  </div>
                  <TalkField
                    id="talk-notes"
                    label="Coach Notes"
                    hint="Coach notes are not included in the card preview below."
                  >
                    <textarea
                      id="talk-notes"
                      className={`${styles.control} ${styles.notesInput}`}
                      rows={6}
                      value={selectedTalk.coach_notes ?? ""}
                      onChange={(event) => updateSelectedTalk({ coach_notes: event.target.value })}
                      placeholder="Internal staff notes for this talk."
                      aria-describedby="talk-notes-hint"
                    />
                  </TalkField>
                </div>

                {/* A content preview, not a promise to reproduce the member app layout. */}
                <section className={styles.previewSection} aria-labelledby="talk-preview-heading">
                  <div className={styles.previewHeading}>
                    <PortalIcon name="people" />
                    <div>
                      <h3 id="talk-preview-heading">User Card Preview</h3>
                      <p>Current editor content. The member app layout may differ.</p>
                    </div>
                  </div>
                  <article className={styles.previewCard}>
                    <span className={styles.previewType}>
                      <PortalIcon name="chat" />
                      {selectedTalk.talk_type_slug ? selectedTalkTypeLabel : "Talk type"}
                    </span>
                    <h4>{selectedTalk.title || "Session talk title"}</h4>
                    <p className={styles.previewTopic}>{selectedTalk.topic_area || "Topic area"}</p>
                    <p className={styles.previewSummary}>
                      {selectedTalk.member_summary || "The member summary will appear here."}
                    </p>
                    <div className={styles.previewMeta}>
                      <span><PortalIcon name="clock" />{selectedTalk.default_duration_minutes ?? "—"} minutes</span>
                      <span><PortalIcon name="people" />{selectedTalk.default_capacity ?? "—"} seats</span>
                      <TalkStatus value={selectedTalk.status} />
                    </div>
                  </article>
                </section>

                <div className={styles.editorFooter}>
                  <p>Save before changing talks or refreshing. This editor does not autosave.</p>
                  <button
                    type="button"
                    className={styles.primaryButton}
                    onClick={() => void handleSaveTalk()}
                    disabled={isSaving || isLoading}
                  >
                    <PortalIcon name="check" />
                    {isSaving ? "Saving…" : "Save Session Talk"}
                  </button>
                </div>
              </fieldset>
            </>
          ) : (
            <div className={styles.emptyEditor}>
              <span className={styles.emptyIllustration} aria-hidden="true">
                <span className={styles.illustrationBack} />
                <span className={styles.illustrationFront}><PortalIcon name="chat" /></span>
                <span className={styles.illustrationBadge}><PortalIcon name="heart" /></span>
              </span>
              <h2 id="talk-editor-heading">
                {isLoading ? "Loading session talks…" : "A place to shape the conversation"}
              </h2>
              <p>
                {isLoading
                  ? "Please wait while your talk library loads."
                  : "Choose a session talk, or create one. Give the member summary and your preparation notes room to grow."}
              </p>
              {!isLoading && (
                <button type="button" className={styles.primaryButton} onClick={handleNewTalk}>
                  <span className={styles.plus} aria-hidden="true">+</span>
                  New Session Talk
                </button>
              )}
            </div>
          )}
        </section>
      </div>
    </div>
  );
}
