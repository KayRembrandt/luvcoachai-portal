"use client";

import { useCallback, useEffect, useState, type ReactNode } from "react";
import { coachingRequest, uploadResource } from "@/lib/coaching/client";
import {
  EMPTY_CATALOG,
  type Activity,
  type Block,
  type Bundle,
  type Capabilities,
  type Catalog,
  type EditionPage,
  type Kind,
  type Question,
  type Resource,
  type StaffAccess
} from "@/lib/coaching/types";
import styles from "./workspace.module.css";

// Small helpers shared by the editors.
const uid = () => crypto.randomUUID();
const label = (s: string) => s.trim() || "Untitled draft";
const message = (e: unknown) => e instanceof Error ? e.message : "The action could not be completed.";

function move<T>(items: T[], index: number, direction: number) {
  const result = [...items];
  const next = index + direction;
  if (next >= 0 && next < result.length) [result[index], result[next]] = [result[next], result[index]];
  return result;
}

// Reusable controls within this coaching workspace.
function Button({ children, onClick, disabled, primary = false }: {
  children: ReactNode;
  onClick: () => void;
  disabled?: boolean;
  primary?: boolean
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={primary ? styles.primary : styles.button}
    >
      {children}
    </button>
  );
}

function Field({ title, children }: {
  title: string;
  children: ReactNode
}) {
  return (
    <label className={styles.field}>
      <span>
        {title}
      </span>
      {children}
    </label>
  );
}

function Reorder({ index, length, onMove, onRemove }: {
  index: number;
  length: number;
  onMove: (n: number) => void;
  onRemove: () => void
}) {
  return (
    <div className={styles.actions}>
      <Button
        onClick={() => onMove(-1)}
        disabled={index === 0}
      >
        Move up
      </Button>
      <Button
        onClick={() => onMove(1)}
        disabled={index === length - 1}
      >
        Move down
      </Button>
      <Button onClick={onRemove}>Remove</Button>
    </div>
  );
}

// Written content: paragraphs, headings, and lists.
function DocumentEditor({ blocks, onChange }: {
  blocks: Block[];
  onChange: (b: Block[]) => void
}) {
  return (
    <section className={styles.section}>
      <h3>Written material</h3>
      <p className={styles.muted}>Add paragraphs, headings and lists. Text is stored as reusable content blocks; HTML is not executed.</p>
      {blocks.map(
        (block, index) => (
          <div
            className={styles.subcard}
            key={block.id}
          >
            <div className={styles.split}>
              <Field title={`Block ${index + 1}`}>
                <select
                  value={block.type}
                  onChange={e =>
                    onChange(blocks.map(b => b.id === block.id ? { ...b, type: e.target.value as Block["type"] } : b))}
                >
                  <option value="paragraph">Paragraph</option>
                  <option value="heading">Heading</option>
                  <option value="bullets">Bulleted list</option>
                </select>
              </Field>
              <Reorder
                index={index}
                length={blocks.length}
                onMove={n => onChange(move(blocks, index, n))}
                onRemove={() => onChange(blocks.filter(b => b.id !== block.id))}
              />
            </div>
            <Field title={block.type === "bullets" ? "One list item per line" : "Text"}>
              <textarea
                rows={block.type === "heading" ? 2 : 6}
                maxLength={30000}
                value={block.text}
                onChange={e => onChange(blocks.map(b => b.id === block.id ? { ...b, text: e.target.value } : b))}
              />
            </Field>
          </div>
        ))}
      <Button
        onClick={() => onChange([...blocks, { id: uid(), type: "paragraph", text: "" }])}
        disabled={blocks.length >= 200}
      >
        + Add content block
      </Button>
    </section>
  );
}

// Workbook question definitions. No member answers or Journal entries.
function QuestionEditor({ questions, onChange }: {
  questions: Question[];
  onChange: (q: Question[]) => void
}) {
  const patch = (key: string, change: Partial<Question>) => onChange(questions.map(q => q.question_key === key ? { ...q, ...change } : q));
  return (
    <section className={styles.section}>
      <h3>Workbook questions</h3>
      <p className={styles.muted}>
        These are question definitions, not Journal entries or member answers. Stable question
        identifiers carry into the next published revision.
      </p>
      {questions.map(
        (q, i) => (
          <div
            className={styles.subcard}
            key={q.question_key}
          >
            <div className={styles.split}>
              <strong>Question {i + 1}</strong>
              <Reorder
                index={i}
                length={questions.length}
                onMove={n => onChange(move(questions, i, n))}
                onRemove={() => onChange(questions.filter(x => x.question_key !== q.question_key))}
              />
            </div>
            <Field title="Answer format">
              <select
                value={q.response_type}
                onChange={e => {
                  const response_type = e.target.value as Question["response_type"];
                  const hasChoices = response_type === "single_choice" || response_type === "multiple_choice";
                  patch(
                    q.question_key,
                    {
                      response_type,
                      options: hasChoices
                        ? (q.options.length >= 2
                          ? q.options
                          : [{ option_key: uid(), label: "" }, { option_key: uid(), label: "" }])
                        : []
                    }
                  );
                }}
              >
                <option value="long_text">Long written answer</option>
                <option value="short_text">Short written answer</option>
                <option value="checkbox">Single acknowledgment checkbox</option>
                <option value="single_choice">Choose one</option>
                <option value="multiple_choice">Choose several</option>
              </select>
            </Field>
            <Field title="Question / prompt">
              <textarea
                rows={3}
                maxLength={12000}
                value={q.prompt}
                onChange={e => patch(q.question_key, { prompt: e.target.value })}
              />
            </Field>
            <Field title="Additional instructions (optional)">
              <textarea
                rows={2}
                maxLength={12000}
                value={q.help_text}
                onChange={e => patch(q.question_key, { help_text: e.target.value })}
              />
            </Field>
            {q.options.map(
              (option, j) => (
                <div
                  className={styles.split}
                  key={option.option_key}
                >
                  <Field title={`Choice ${j + 1}`}>
                    <input
                      value={option.label}
                      maxLength={1000}
                      onChange={e =>
                        patch(
                          q.question_key,
                          { options: q.options.map(o => o.option_key === option.option_key ? { ...o, label: e.target.value } : o) }
                        )}
                    />
                  </Field>
                  <Button
                    disabled={q.options.length <= 2}
                    onClick={() =>
                      patch(q.question_key, { options: q.options.filter(o => o.option_key !== option.option_key) })}
                  >
                    Remove choice
                  </Button>
                </div>
              ))}
            {(q.response_type === "single_choice" || q.response_type === "multiple_choice") && <Button
              disabled={q.options.length >= 100}
              onClick={() => patch(q.question_key, { options: [...q.options, { option_key: uid(), label: "" }] })}
            >
              + Add choice
            </Button>}
            <label className={styles.check}><input
              type="checkbox"
              checked={q.is_required}
              onChange={e => patch(q.question_key, { is_required: e.target.checked })}
            /> Required for this workbook activity</label>
          </div>
        ))}
      <Button
        disabled={questions.length >= 100}
        onClick={() =>
          onChange(
            [...questions, {
              question_key: uid(),
              sort_order: questions.length,
              response_type: "long_text",
              prompt: "",
              help_text: "",
              is_required: false,
              options: []
            }]
          )}
      >
        + Add question
      </Button>
    </section>
  );
}

// Audio, attachments, external links, and workbook references.
function ResourceEditor({ resources, onChange, onUpload, storageReady }: {
  resources: Resource[];
  onChange: (r: Resource[]) => void;
  onUpload: (key: string, file: File, type: "audio" | "document") => void;
  storageReady: boolean
}) {
  const patch = (key: string, change: Partial<Resource>) => onChange(resources.map(r => r.resource_key === key ? { ...r, ...change } : r));
  const add = (resource_type: Resource["resource_type"]) =>
    onChange(
      [...resources, {
        resource_key: uid(),
        sort_order: resources.length,
        resource_type,
        label: "",
        file_id: null,
        file_name: null,
        external_url: null,
        edition_label: null,
        page_reference: null,
        transcript: "",
        is_required: false
      }]
    );
  return (
    <section className={styles.section}>
      <h3>Recordings & additional resources</h3>
      <p className={styles.muted}>
        Add as many separate resources as needed, up to 100 per version. Files are private; each
        file can be up to 40 MiB. Save the draft after an upload to attach it.
      </p>
      {!storageReady && <p className={styles.notice}>
        Private storage is not enabled yet. Text, questions and links still work. Ami can enable
        uploads in the Access & storage tab.
      </p>}
      {resources.map(
        (r, i) => (
          <div
            className={styles.subcard}
            key={r.resource_key}
          >
            <div className={styles.split}>
              <strong>{r.resource_type === "workbook_reference"
                ? "Workbook reference"
                : r.resource_type === "audio"
                  ? "Audio recording"
                  : r.resource_type === "attachment" ? "Worksheet attachment" : "External link"} {i + 1}</strong>
              <Reorder
                index={i}
                length={resources.length}
                onMove={n => onChange(move(resources, i, n))}
                onRemove={() => onChange(resources.filter(x => x.resource_key !== r.resource_key))}
              />
            </div>
            <Field title="Resource title">
              <input
                maxLength={500}
                value={r.label}
                onChange={e => patch(r.resource_key, { label: e.target.value })}
              />
            </Field>
            {(r.resource_type === "audio" || r.resource_type === "attachment") && <>
              {r.file_id && <p className={styles.saved}>Uploaded: {r.file_name || "File ready"}. Replacing it creates a new file; it does not overwrite older publications.</p>}
              <Field title={r.file_id ? "Replace file (optional)" : "Choose file"}>
                <input
                  type="file"
                  disabled={!storageReady}
                  accept={r.resource_type === "audio" ? ".mp3,.m4a,.wav,.ogg,.webm" : ".pdf,.docx,.txt"}
                  onChange={e => {
                    const file = e.target.files?.[0];
                    e.target.value = "";
                    if (file) onUpload(r.resource_key, file, r.resource_type === "audio" ? "audio" : "document");
                  }}
                />
              </Field>
            </>}
            {(r.resource_type === "link" || r.resource_type === "workbook_reference") && <Field title={r.resource_type === "link" ? "HTTPS link" : "HTTPS link to the workbook (optional)"}>
              <input
                type="url"
                maxLength={2048}
                value={r.external_url ?? ""}
                placeholder="https://…"
                onChange={e => patch(r.resource_key, { external_url: e.target.value || null })}
              />
            </Field>}
            {r.resource_type === "workbook_reference" && <div className={styles.twoCol}>
              <Field title="Workbook title / edition">
                <input
                  maxLength={200}
                  value={r.edition_label ?? ""}
                  onChange={e => patch(r.resource_key, { edition_label: e.target.value })}
                />
              </Field>
              <Field title="Page reference">
                <input
                  maxLength={150}
                  placeholder="Pages 12–14"
                  value={r.page_reference ?? ""}
                  onChange={e => patch(r.resource_key, { page_reference: e.target.value })}
                />
              </Field>
            </div>}
            {r.resource_type === "audio" && <Field title="Transcript / written equivalent (optional)">
              <textarea
                rows={5}
                maxLength={500000}
                value={r.transcript}
                onChange={e => patch(r.resource_key, { transcript: e.target.value })}
              />
            </Field>}
            <label className={styles.check}><input
              type="checkbox"
              checked={r.is_required}
              onChange={e => patch(r.resource_key, { is_required: e.target.checked })}
            /> Required activity</label>
          </div>
        ))}
      <div className={styles.actions}>
        <Button
          disabled={resources.length >= 100 || !storageReady}
          onClick={() => add("audio")}
        >
          + Recording
        </Button>
        <Button
          disabled={resources.length >= 100 || !storageReady}
          onClick={() => add("attachment")}
        >
          + Worksheet file
        </Button>
        <Button
          disabled={resources.length >= 100}
          onClick={() => add("link")}
        >
          + Link
        </Button>
        <Button
          disabled={resources.length >= 100}
          onClick={() => add("workbook_reference")}
        >
          + Workbook page reference
        </Button>
      </div>
    </section>
  );
}

function LinkedPages({ bundle, catalog, onActivities, onEditionPages }: {
  bundle: Bundle;
  catalog: Catalog;
  onActivities: (a: Activity[]) => void;
  onEditionPages: (e: EditionPage[]) => void
}) {
  const [selected, setSelected] = useState("");
  const isBook = bundle.kind === "workbook";
  const current = isBook ? bundle.edition_pages : bundle.activities;
  const possible = catalog.published_pages.filter(p => !isBook || p.workbook_id === bundle.version.workbook_id);
  const chosenRootIds = new Set(current.map(p => catalog.published_pages.find(v => v.version_id === p.page_version_id)?.id));
  const options = possible.filter(p => !chosenRootIds.has(p.id));
  const title = (id: string) => {
    const page = catalog.published_pages.find(p => p.version_id === id);
    return page
      ? `${label(page.title)} · version ${page.version_number}`
      : `Saved page version ${id.slice(0, 8)}`;
  };
  function add() {
    if (!selected || !options.some(p => p.version_id === selected)) return;
    if (isBook) onEditionPages(
      [...bundle.edition_pages, {
        page_version_id: selected,
        sort_order: current.length,
        page_reference: ""
      }]
    );
    else onActivities(
      [...bundle.activities, {
        activity_key: uid(),
        page_version_id: selected,
        workbook_version_id: null,
        sort_order: current.length,
        is_required: true
      }]
    );
    setSelected("");
  }
  return (
    <section className={styles.section}>
      <h3>
        {isBook ? "Pages in this workbook edition" : "Linked workbook activities"}
      </h3>
      <p className={styles.muted}>
        Publish a workbook page before linking it here. Links keep that exact page version, even
        when a newer draft is created.
      </p>
      {isBook
        ? bundle.edition_pages.map(
          (p, i) => (
            <div
              className={styles.subcard}
              key={p.page_version_id}
            >
              <div className={styles.split}>
                <strong>{i + 1}. {title(p.page_version_id)}</strong>
                <Reorder
                  index={i}
                  length={current.length}
                  onMove={n => onEditionPages(move(bundle.edition_pages, i, n))}
                  onRemove={() =>
                    onEditionPages(bundle.edition_pages.filter(x => x.page_version_id !== p.page_version_id))}
                />
              </div>
              <Field title="Printed page reference (optional)">
                <input
                  maxLength={150}
                  placeholder="12–13"
                  value={p.page_reference}
                  onChange={e =>
                    onEditionPages(
                      bundle.edition_pages.map(
                        x =>
                          x.page_version_id === p.page_version_id ? { ...x, page_reference: e.target.value } : x
                      )
                    )}
                />
              </Field>
            </div>
          ))
        : bundle.activities.map(
          (a, i) => (
            <div
              className={styles.subcard}
              key={a.activity_key}
            >
              <div className={styles.split}>
                <strong>{i + 1}. {title(a.page_version_id)}</strong>
                <Reorder
                  index={i}
                  length={current.length}
                  onMove={n => onActivities(move(bundle.activities, i, n))}
                  onRemove={() => onActivities(bundle.activities.filter(x => x.activity_key !== a.activity_key))}
                />
              </div>
              <Field title="Printed workbook edition (optional)">
                <select
                  value={a.workbook_version_id ?? ""}
                  onChange={e =>
                    onActivities(
                      bundle.activities.map(
                        x =>
                          x.activity_key === a.activity_key ? { ...x, workbook_version_id: e.target.value || null } : x
                      )
                    )}
                >
                  <option value="">Digital activity only</option>
                  {catalog.editions.filter(e => e.pages.some(p => p.page_version_id === a.page_version_id)).map(
                    e => (
                      <option
                        key={e.version_id}
                        value={e.version_id}
                      >{e.title} · {e.edition_label || `version ${e.version_number}`} · page {e.pages.find(p => p.page_version_id === a.page_version_id)?.page_reference || "not numbered"}</option>
                    ))}
                </select>
              </Field>
              <label className={styles.check}><input
                type="checkbox"
                checked={a.is_required}
                onChange={e =>
                  onActivities(
                    bundle.activities.map(x => x.activity_key === a.activity_key ? { ...x, is_required: e.target.checked } : x)
                  )}
              /> Required workbook activity</label>
            </div>
          ))}
      <div className={styles.split}>
        <Field title="Choose a published workbook page">
          <select
            value={selected}
            onChange={e => setSelected(e.target.value)}
          >
            <option value="">Choose a page…</option>
            {options.map(
              p => (
                <option
                  key={p.version_id}
                  value={p.version_id}
                >{catalog.workbooks.find(b => b.id === p.workbook_id)?.title} / {label(p.title)} · version {p.version_number}</option>
              ))}
          </select>
        </Field>
        <Button
          disabled={!selected || current.length >= 300}
          onClick={add}
        >
          Add page
        </Button>
      </div>
      {!possible.length && <p className={styles.muted}>No published pages are available yet. Save and publish a page in the Workbook tab first.</p>}
    </section>
  );
}

function Preview({ bundle, catalog }: {
  bundle: Bundle;
  catalog: Catalog
}) {
  const [audio, setAudio] = useState<Record<string, string>>({});
  const [error, setError] = useState("");
  const [opening, setOpening] = useState("");
  async function openFile(r: Resource) {
    if (!r.file_id) return;
    setError("");
    setOpening(r.resource_key);
    const windowRef = r.resource_type === "attachment" ? window.open("about:blank", "_blank") : null;
    if (windowRef) windowRef.opener = null;
    try {
      const { url } = await coachingRequest<{
        url: string
      }>({}, { action: "file_url", id: r.file_id });
      if (r.resource_type === "audio") setAudio(a => ({ ...a, [r.resource_key]: url }));
      else if (windowRef) windowRef.location.replace(url);
      else throw new Error("Allow a new tab for the worksheet, then press Open file again.");
    } catch (e) {
      windowRef?.close();
      setError(message(e));
    } finally {
      setOpening("");
    }
  }
  const safe = (u: string | null) => {
    try {
      const x = new URL(u || "");
      return x.protocol === "https:" && !x.username && !x.password ? x.href : null;
    } catch {
      return null;
    }
  };
  return (
    <article className={styles.preview}>
      <p className={styles.eyebrow}>Staff preview · no member responses are collected</p>
      <h2>
        {label(bundle.version.title)}
      </h2>
      <p className={styles.muted}>
        {bundle.version.subject || bundle.version.edition_label}
      </p>
      {bundle.version.description && <p className={styles.prose}>
        {bundle.version.description}
      </p>}
      {(bundle.version.content_document?.blocks ?? []).map(
        b =>
          b.type === "heading"
            ? <h3 key={b.id}>
              {b.text}
            </h3>
            : b.type === "bullets"
              ? <ul key={b.id}>
                {b.text.split("\n").filter(Boolean).map((line, i) => (
                  <li key={i}>
                    {line}
                  </li>
                ))}
              </ul>
              : <p
                key={b.id}
                className={styles.prose}
              >
                {b.text}
              </p>
      )}
      {error && <p
        role="alert"
        className={styles.error}
      >
        {error}
      </p>}
      {bundle.resources.map(
        r => (
          <section
            key={r.resource_key}
            className={styles.subcard}
          >
            <h3>
              {r.label || "Untitled resource"}
              {r.is_required ? " · required" : ""}
            </h3>
            {r.page_reference && <p>{r.edition_label} · {r.page_reference}</p>}
            {safe(r.external_url) && <a
              href={safe(r.external_url)!}
              target="_blank"
              rel="noopener noreferrer"
            >
              Open resource link
            </a>}
            {r.file_id && <Button
              disabled={!!opening}
              onClick={() => {
                void openFile(r);
              }}
            >
              {opening === r.resource_key
                ? "Opening…"
                : r.resource_type === "audio" ? "Load / refresh recording" : "Open file"}
            </Button>}
            {audio[r.resource_key] && <audio
              controls
              preload="metadata"
              src={audio[r.resource_key]}
              className={styles.audio}
            />}
            {r.transcript && <details>
              <summary>Transcript</summary>
              <p className={styles.prose}>
                {r.transcript}
              </p>
            </details>}
          </section>
        ))}
      {bundle.questions.map(
        (q, i) => (
          <section
            key={q.question_key}
            className={styles.subcard}
          >
            <h3>{i + 1}. {q.prompt || "Question not yet written"}{q.is_required ? " *" : ""}</h3>
            <p className={styles.prose}>
              {q.help_text}
            </p>
            <p className={styles.muted}>Answer format: {q.response_type.replaceAll("_", " ")}</p>
            {q.options.length
              ? q.options.map(
                o => (
                  <label
                    className={styles.check}
                    key={o.option_key}
                  >
                    <input
                      type={q.response_type === "single_choice" ? "radio" : "checkbox"}
                      disabled
                    />
                    {o.label || "Unwritten choice"}
                  </label>
                ))
              : q.response_type === "checkbox"
                ? <input
                  type="checkbox"
                  disabled
                  aria-label="Acknowledgment preview"
                />
                : <textarea
                  rows={3}
                  disabled
                  placeholder="Member answer area (preview only)"
                  aria-label="Member answer area preview"
                />}
          </section>
        ))}
      {[...bundle.activities, ...bundle.edition_pages].map(
        (a, i) => (
          <p key={a.page_version_id}>{i + 1}. {catalog.published_pages.find(p => p.version_id === a.page_version_id)?.title || "Linked workbook page"}{"page_reference" in a && a.page_reference ? ` · page ${a.page_reference}` : ""}</p>
        ))}
    </article>
  );
}

function AccessPanel({ caps, onRefresh }: {
  caps: Capabilities;
  onRefresh: () => Promise<void>
}) {
  const [staff, setStaff] = useState<StaffAccess[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const load = useCallback(
    async () => {
      const data = await coachingRequest<{
        staff: StaffAccess[]
      }>({ action: "staff_list" });
      setStaff(data.staff);
    },
    []
  );
  useEffect(() => {
    void load().catch(e => setError(message(e)));
  }, [load]);
  async function change(s: StaffAccess) {
    if (!window.confirm(
      `${s.author ? "Remove" : "Enable"} coaching author access for ${s.name || s.email}? This does not change their other permissions or grant access to member writing.`
    )) return;
    setBusy(true);
    setError("");
    setNotice("");
    try {
      await coachingRequest({}, {
        action: "set_author",
        id: s.id,
        author: !s.author,
        expected_author: s.author
      });
      await load();
      setNotice("Coaching author access updated. Other permission settings were left unchanged.");
    }
    catch (e) {
      setError(message(e));
    } finally {
      setBusy(false);
    }
  }
  async function storage() {
    setBusy(true);
    setError("");
    setNotice("");
    try {
      await coachingRequest({}, { action: "storage_setup" });
      await onRefresh();
      setNotice("Private coaching storage is ready. Existing photo buckets were not changed.");
    }
    catch (e) {
      setError(message(e));
    } finally {
      setBusy(false);
    }
  }
  return (
    <section className={styles.card}>
      <h2>Author access & private storage</h2>
      <p className={styles.muted}>
        Administrators can assign authoring access to existing staff. Authors share the
        teaching-material library. This does not grant access to members’ workbook answers,
        Journals or Mira conversations.
      </p>
      {error && <p
        role="alert"
        className={styles.error}
      >
        {error}
      </p>}
      {notice && <p
        role="status"
        className={styles.saved}
      >
        {notice}
      </p>}
      <div className={styles.section}>
        <h3>Recordings & worksheet uploads</h3>
        <p>
          {caps.storage_ready
            ? "Private coaching-materials bucket is ready."
            : "The private coaching-materials bucket is not ready yet."}
        </p>
        <Button
          disabled={busy || caps.storage_ready}
          onClick={() => {
            void storage();
          }}
          primary
        >
          Enable private uploads
        </Button>
        <p className={styles.muted}>
          New uploads use unique paths. File type, header and size checks are included; malware
          scanning is not. Only upload trusted teaching material. No public file URLs are stored.
        </p>
      </div>
      <div className={styles.tableWrap}>
        <table>
          <thead>
            <tr>
              <th>Staff member</th>
              <th>Role / status</th>
              <th>Coaching author</th>
            </tr>
          </thead>
          <tbody>
            {staff.map(
              s => (
                <tr key={s.id}>
                  <td>
                    {s.name || s.email}
                    <br />
                    <small>
                      {s.email}
                    </small>
                  </td>
                  <td>{s.role} · {s.is_active ? s.status || "active" : "inactive"}</td>
                  <td>
                    {["admin", "super_admin"].includes(s.role)
                      ? "Included with administrator role"
                      : <Button
                        disabled={busy}
                        onClick={() => {
                          void change(s);
                        }}
                      >
                        {s.author ? "Remove author access" : "Enable author access"}
                      </Button>}
                  </td>
                </tr>
              ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}

export default function Workspace() {
  const [caps, setCaps] = useState<Capabilities | null>(null);
  const [catalog, setCatalog] = useState<Catalog>(EMPTY_CATALOG);
  const [tab, setTab] = useState<"module" | "workbook" | "access">("module");
  const [bookId, setBookId] = useState("");
  const [bundle, setBundle] = useState<Bundle | null>(null);
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [dirty, setDirty] = useState(false);
  const [preview, setPreview] = useState(false);
  const [newKind, setNewKind] = useState<Kind | null>(null);
  const [newTitle, setNewTitle] = useState("");
  const [newId, setNewId] = useState("");
  const refreshCaps = useCallback(async () => {
    const data = await coachingRequest<Capabilities>();
    setCaps(data);
  }, []);
  const refreshCatalog = useCallback(
    async () => {
      const data = await coachingRequest<Catalog>({ action: "list" });
      setCatalog(data);
    },
    []
  );
  useEffect(
    () => {
      let live = true;
      async function init() {
        try {
          const access = await coachingRequest<Capabilities>();
          if (!live) return;
          setCaps(access);
          if (access.author) {
            const list = await coachingRequest<Catalog>({ action: "list" });
            if (live) setCatalog(list);
          }
        } catch (e) {
          if (live) setError(message(e));
        } finally {
          if (live) setLoading(false);
        }
      }
      void init();
      return () => {
        live = false;
      };
    },
    []
  );
  useEffect(
    () => {
      if (!dirty && !busy) return;
      const warn = (e: BeforeUnloadEvent) => {
        e.preventDefault();
        e.returnValue = "";
      };
      window.addEventListener("beforeunload", warn);
      return () => window.removeEventListener("beforeunload", warn);
    },
    [dirty, busy]
  );
  // Also intercept the portal's own navigation links while an edit is unsaved.
  useEffect(
    () => {
      const guard = (e: MouseEvent) => {
        const a = (e.target as Element | null)?.closest?.("a[href]");
        if (!a || a.getAttribute("target") === "_blank") return;
        const href = a.getAttribute("href");
        if (!href || href.startsWith("#")) return;
        if (busy || (dirty && !window.confirm("Leave this page and discard unsaved changes?"))) {
          e.preventDefault();
          e.stopPropagation();
        }
      };
      document.addEventListener("click", guard, true);
      return () => document.removeEventListener("click", guard, true);
    },
    [dirty, busy]
  );
  const canLeave = () => !busy && (!dirty || window.confirm("Discard the unsaved changes before switching?"));
  const accept = (b: Bundle) => {
    setBundle(b);
    setDirty(false);
    setPreview(b.version.publication_state === "published");
  };
  const patch = (change: Partial<Bundle>) => {
    setBundle(b => b ? { ...b, ...change } : b);
    setDirty(true);
    setNotice("");
  };
  const patchVersion = (change: Partial<Bundle["version"]>) => {
    if (bundle) patch({ version: { ...bundle.version, ...change } });
  };
  async function open(k: Kind, id: string) {
    if (!canLeave()) return;
    setBusy(true);
    setError("");
    setNotice("");
    setNewKind(null);
    try {
      accept(await coachingRequest<Bundle>({ action: "get", kind: k, id }));
    } catch (e) {
      setError(message(e));
    } finally {
      setBusy(false);
    }
  }
  function switchTab(t: typeof tab) {
    if (!canLeave()) return;
    setTab(t);
    setBundle(null);
    setDirty(false);
    setNewKind(null);
    setError("");
    setNotice("");
  }
  function startCreate(k: Kind) {
    if (!canLeave()) return;
    setNewKind(k);
    setNewId(uid());
    setNewTitle("");
    setBundle(null);
    setDirty(false);
    setError("");
    setNotice("");
  }
  async function create() {
    if (!newKind || !newTitle.trim()) {
      setError("Enter a title to begin.");
      return;
    }
    setBusy(true);
    setError("");
    try {
      const b = await coachingRequest<Bundle>(
        {},
        {
          action: "create",
          kind: newKind,
          id: newId,
          payload: {
            title: newTitle.trim(),
            ...(newKind === "page" ? { workbook_id: bookId } : {})
          }
        }
      );
      accept(b);
      if (newKind === "workbook") setBookId(b.version.workbook_id!);
      setNewKind(null);
      setNotice("Draft created. Add your material, then save.");
      await refreshCatalog();
    } catch (e) {
      setError(message(e));
    } finally {
      setBusy(false);
    }
  }
  async function action(name: "save" | "publish" | "revise") {
    if (!bundle) return;
    if (name === "publish" && !window.confirm(
      "Publish this saved version? It will be locked for editing; later changes use a new draft. This does not enroll members or change their access."
    )) return;
    setBusy(true);
    setError("");
    setNotice("");
    try {
      const payload = {
        ...bundle.version,
        resources: bundle.resources,
        questions: bundle.questions,
        activities: bundle.activities,
        edition_pages: bundle.edition_pages
      };
      const b = await coachingRequest<Bundle>(
        {},
        {
          action: name,
          kind: bundle.kind,
          id: bundle.version.id,
          expected: bundle.version.edit_version,
          payload
        }
      );
      accept(b);
      setNotice(
        name === "save"
          ? "Draft saved."
          : name === "publish"
            ? "Version published and locked. No member access was changed."
            : "New draft opened. The published version is unchanged."
      );
      try {
        await refreshCatalog();
      } catch {
        setError(
          "Your action succeeded, but the library list could not refresh. Reload the library when the connection returns."
        );
      }
    } catch (e) {
      setError(message(e));
    } finally {
      setBusy(false);
    }
  }
  async function upload(key: string, file: File, type: "audio" | "document") {
    if (!bundle) return;
    setBusy(true);
    setError("");
    setNotice("Uploading and checking the file…");
    try {
      const result = await uploadResource(file, type, bundle.kind, bundle.version.id);
      setBundle(
        b =>
          b
            ? {
              ...b,
              resources: b.resources.map(
                r =>
                  r.resource_key === key
                    ? {
                      ...r,
                      file_id: result.id,
                      file_name: result.file_name,
                      label: r.label || file.name
                    }
                    : r
              )
            }
            : b
      );
      setDirty(true);
      setNotice("Upload verified. Save the draft to attach this file.");
    }
    catch (e) {
      setError(message(e));
      setNotice("");
    } finally {
      setBusy(false);
    }
  }
  function exportDraft() {
    if (!bundle) return;
    const blob = new Blob([JSON.stringify(bundle, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "coaching-unsaved-draft.json";
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
  const readOnly = bundle?.version.publication_state === "published";
  return (
    <main className={styles.workspace}>
      <header className={styles.header}>
        <div>
          <p className={styles.eyebrow}>LuvCoachAI · Staff authoring</p>
          <h1>Coaching workspace</h1>
          <p className={styles.muted}>Create reusable modules and workbook pages. Member Journals remain private and are not loaded here.</p>
        </div>
      </header>
      {loading && <p
        role="status"
        className={styles.card}
      >
        Checking author access and loading the library…
      </p>}
      {error && <div
        role="alert"
        className={styles.error}
      >
        {error}
        {bundle && <div className={styles.actions}>
          <Button onClick={exportDraft}>Save a local copy of this draft</Button>
          <Button
            disabled={busy}
            onClick={() => {
              void open(bundle.kind, bundle.version.id);
            }}
          >
            Reload saved version
          </Button>
        </div>}
      </div>}
      {notice && <p
        role="status"
        className={styles.saved}
      >
        {notice}
      </p>}
      {!loading && caps && !caps.author && <section className={styles.card}>
        <h2>Author access has not been enabled</h2>
        <p>
          Ami can enable Coaching author access for your existing staff account. No member
          information is available on this page.
        </p>
      </section>}
      {!loading && caps?.author && <>
        <nav
          className={styles.tabs}
          aria-label="Coaching workspace sections"
        >
          <button
            className={tab === "module" ? styles.activeTab : styles.tab}
            onClick={() => switchTab("module")}
            disabled={busy}
          >
            Modules
          </button>
          <button
            className={tab === "workbook" ? styles.activeTab : styles.tab}
            onClick={() => switchTab("workbook")}
            disabled={busy}
          >
            Workbook
          </button>
          {caps.admin && <button
            className={tab === "access" ? styles.activeTab : styles.tab}
            onClick={() => switchTab("access")}
            disabled={busy}
          >
            Access & storage
          </button>}
        </nav>
        {catalog.at_display_limit && <p className={styles.notice}>
          The library reached this version’s display limit. Some records may not be listed. Add
          pagination before expanding the library further.
        </p>}
        {tab === "access"
          ? <AccessPanel
            caps={caps}
            onRefresh={refreshCaps}
          />
          : <div className={styles.layout}>
            <aside className={styles.sidebar}>
              <h2>
                {tab === "module" ? "Module library" : "Workbook library"}
              </h2>
              <div className={styles.actions}>
                <Button
                  disabled={busy}
                  primary
                  onClick={() => startCreate(tab)}
                >+ New {tab}</Button>
                <Button
                  disabled={busy}
                  onClick={() => {
                    void refreshCatalog().catch(e => setError(message(e)));
                  }}
                >
                  Refresh list
                </Button>
              </div>
              {tab === "module"
                ? <div className={styles.list}>
                  {catalog.modules.map(
                    m => (
                      <button
                        key={m.id}
                        disabled={busy}
                        className={bundle?.version.module_id === m.id ? styles.selectedItem : styles.listItem}
                        onClick={() => {
                          void open("module", m.version_id);
                        }}
                      >
                        <strong>
                          {label(m.title)}
                        </strong>
                        <small>Version {m.version_number} · {m.publication_state}</small>
                      </button>
                    ))}
                  {!catalog.modules.length && <p className={styles.muted}>No modules yet. Create the first draft.</p>}
                </div>
                : <>
                  <Field title="Select workbook">
                    <select
                      value={bookId}
                      disabled={busy}
                      onChange={e => {
                        if (!canLeave()) return;
                        setBookId(e.target.value);
                        setBundle(null);
                        setDirty(false);
                        setNewKind(null);
                      }}
                    >
                      <option value="">Choose workbook…</option>
                      {catalog.workbooks.map(b => (
                        <option
                          key={b.id}
                          value={b.id}
                        >
                          {label(b.title)}
                        </option>
                      ))}
                    </select>
                  </Field>
                  {bookId && <>
                    <div className={styles.actions}>
                      <Button
                        disabled={busy}
                        onClick={() => {
                          const b = catalog.workbooks.find(x => x.id === bookId);
                          if (b) void open("workbook", b.version_id);
                        }}
                      >
                        Edit workbook / edition
                      </Button>
                      <Button
                        disabled={busy}
                        onClick={() => startCreate("page")}
                      >
                        + New page
                      </Button>
                    </div>
                    <div className={styles.list}>
                      {catalog.pages.filter(p => p.workbook_id === bookId).map(
                        p => (
                          <button
                            key={p.id}
                            disabled={busy}
                            className={bundle?.version.page_id === p.id ? styles.selectedItem : styles.listItem}
                            onClick={() => {
                              void open("page", p.version_id);
                            }}
                          >
                            <strong>
                              {label(p.title)}
                            </strong>
                            <small>Version {p.version_number} · {p.publication_state}</small>
                          </button>
                        ))}
                    </div>
                  </>}
                  {!catalog.workbooks.length && <p className={styles.muted}>Create a workbook, then add its editable pages.</p>}
                </>}
              <p className={styles.footnote}>
                This release is for teaching material only. Enrollment, member submissions, progress
                review and personal books are not connected yet.
              </p>
            </aside>
            <section className={styles.editor}>
              {newKind && <div className={styles.card}>
                <h2>New {newKind === "page" ? "workbook page" : newKind}</h2>
                <Field title="Title">
                  <input
                    autoFocus
                    maxLength={250}
                    disabled={busy}
                    value={newTitle}
                    onChange={e => setNewTitle(e.target.value)}
                  />
                </Field>
                <div className={styles.actions}>
                  <Button
                    disabled={busy || !newTitle.trim()}
                    primary
                    onClick={() => {
                      void create();
                    }}
                  >
                    {busy ? "Creating…" : "Create draft"}
                  </Button>
                  <Button
                    disabled={busy}
                    onClick={() => setNewKind(null)}
                  >
                    Cancel
                  </Button>
                </div>
              </div>}
              {bundle && <>
                <div className={styles.toolbar}>
                  <div>
                    <strong>
                      {label(bundle.version.title)}
                    </strong>
                    <p className={styles.muted}>Version {bundle.version.version_number} · {readOnly
                      ? "Published — read only"
                      : dirty ? "Unsaved changes" : `Saved ${new Date(bundle.version.updated_at).toLocaleString()}`}</p>
                  </div>
                  <div className={styles.actions}>
                    {!readOnly && <Button
                      disabled={busy}
                      primary
                      onClick={() => {
                        void action("save");
                      }}
                    >
                      {busy ? "Working…" : "Save draft"}
                    </Button>}
                    {!readOnly && <Button
                      disabled={busy}
                      onClick={() => setPreview(!preview)}
                    >
                      {preview ? "Back to editor" : "Preview"}
                    </Button>}
                    {readOnly
                      ? <Button
                        disabled={busy}
                        primary
                        onClick={() => {
                          void action("revise");
                        }}
                      >
                        Create next draft
                      </Button>
                      : <Button
                        disabled={busy || dirty}
                        onClick={() => {
                          void action("publish");
                        }}
                      >
                        Publish saved version
                      </Button>}
                  </div>
                </div>
                {dirty && !readOnly && <p className={styles.muted}>Save your changes before publishing. Preview includes changes that have not yet been saved.</p>}
                {preview || readOnly
                  ? <Preview
                    key={bundle.version.id}
                    bundle={bundle}
                    catalog={catalog}
                  />
                  : <fieldset
                    disabled={busy}
                    className={styles.form}
                  >
                    <div className={styles.twoCol}>
                      <Field title="Title">
                        <input
                          maxLength={250}
                          value={bundle.version.title}
                          onChange={e => patchVersion({ title: e.target.value })}
                        />
                      </Field>
                      {bundle.kind !== "workbook"
                        ? <Field title="Subject">
                          <input
                            maxLength={300}
                            value={bundle.version.subject ?? ""}
                            onChange={e => patchVersion({ subject: e.target.value })}
                          />
                        </Field>
                        : <Field title="Edition label">
                          <input
                            maxLength={150}
                            placeholder="First edition"
                            value={bundle.version.edition_label ?? ""}
                            onChange={e => patchVersion({ edition_label: e.target.value })}
                          />
                        </Field>}
                    </div>
                    {bundle.kind === "workbook"
                      ? <Field title="Workbook description">
                        <textarea
                          rows={5}
                          maxLength={20000}
                          value={bundle.version.description ?? ""}
                          onChange={e => patchVersion({ description: e.target.value })}
                        />
                      </Field>
                      : <DocumentEditor
                        blocks={bundle.version.content_document?.blocks ?? []}
                        onChange={blocks => patchVersion({ content_document: { schema_version: 1, blocks } })}
                      />}
                    {bundle.kind === "page" && <QuestionEditor
                      questions={bundle.questions}
                      onChange={questions => patch({ questions })}
                    />}
                    {bundle.kind !== "workbook" && <ResourceEditor
                      resources={bundle.resources}
                      storageReady={caps.storage_ready}
                      onChange={resources => patch({ resources })}
                      onUpload={(key, file, type) => {
                        void upload(key, file, type);
                      }}
                    />}
                    {(bundle.kind === "module" || bundle.kind === "workbook") && <LinkedPages
                      key={bundle.version.id}
                      bundle={bundle}
                      catalog={catalog}
                      onActivities={activities => patch({ activities })}
                      onEditionPages={edition_pages => patch({ edition_pages })}
                    />}
                    <Field title="Revision note (staff only, optional)">
                      <textarea
                        rows={2}
                        maxLength={4000}
                        value={bundle.version.change_note}
                        onChange={e => patchVersion({ change_note: e.target.value })}
                      />
                    </Field>
                  </fieldset>}
              </>}
              {!bundle && !newKind && <div className={styles.empty}>
                <h2>
                  {tab === "module" ? "A clear place to build the program" : "Create the workbook once"}
                </h2>
                <p>
                  {tab === "module"
                    ? "Choose a module or create a draft. Add its title, subject, written material, recordings and workbook activities."
                    : "Select or create a workbook. Create editable pages with instructions and questions, publish the pages, then arrange them into an edition."}
                </p>
                <p>Save drafts as you work. Published versions are preserved; later changes use a new draft.</p>
              </div>}
            </section>
          </div>}
      </>}
    </main>
  );
}
