import { FILE_TYPES, MAX_FILE_BYTES, type Kind } from "./types";

export class CoachingError extends Error {
  constructor(message: string, public status = 400) {
    super(message);
    this.name = "CoachingError";
  }
}

export function obj(v: unknown, label = "Request"): Record<string, unknown> {
  if (!v || typeof v !== "object" || Array.isArray(v)) throw new CoachingError(`${label} must be an object.`);
  return v as Record<string, unknown>;
}

export function text(v: unknown, label: string, max: number, required = false): string {
  if (typeof v !== "string" || v.length > max || v.includes("\0")) throw new CoachingError(`${label} is missing or too long (maximum ${max} characters).`);
  if (required && !v.trim()) throw new CoachingError(`${label} is required.`);
  return v;
}

export function uuid(v: unknown): string {
  if (typeof v !== "string" || !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(v)) throw new CoachingError("Invalid content identifier.");
  return v.toLowerCase();
}

function optionalUuid(v: unknown) {
  return v === null || v === "" || v === undefined ? null : uuid(v);
}

export function integer(v: unknown, label: string, max = Number.MAX_SAFE_INTEGER): number {
  if (typeof v !== "number" || !Number.isSafeInteger(v) || v < 1 || v > max) throw new CoachingError(`${label} must be a positive whole number.`);
  return v;
}

export function bool(v: unknown): boolean {
  if (typeof v !== "boolean") throw new CoachingError("Expected a true/false setting.");
  return v;
}

function array(v: unknown, label: string, max = 100): unknown[] {
  if (!Array.isArray(v) || v.length > max) throw new CoachingError(`${label} must be a list with at most ${max} items.`);
  return v;
}

function choice<T extends string>(v: unknown, values: readonly T[]): T {
  if (typeof v !== "string" || !values.includes(v as T)) throw new CoachingError("Unrecognized content option.");
  return v as T;
}

export function kind(v: unknown): Kind {
  return choice(v, ["module", "workbook", "page"] as const);
}

function distinct(values: string[], label: string) {
  if (new Set(values).size !== values.length) throw new CoachingError(`Duplicate ${label}. Remove the repeated item.`);
}

export function httpsUrl(v: unknown): string | null {
  if (v === null || v === "" || v === undefined) return null;
  const value = text(v, "Link", 2048, true).trim();
  try {
    const u = new URL(value);
    if (u.protocol !== "https:" || !u.hostname || u.username || u.password || /\s/.test(value)) throw new Error();
    return u.toString();
  } catch {
    throw new CoachingError("Use a complete HTTPS link without a username or password.");
  }
}

export function document(v: unknown) {
  const d = obj(v, "Written content");
  if (d.schema_version !== 1) throw new CoachingError("Unsupported document format.");
  const blocks = array(d.blocks, "Content blocks", 200).map(
    b => {
      const x = obj(b);
      return {
        id: uuid(x.id),
        type: choice(x.type, ["paragraph", "heading", "bullets"] as const),
        text: text(x.text, "Block text", 30000)
      };
    }
  );
  distinct(blocks.map(b => b.id), "block identifiers");
  const result = { schema_version: 1, blocks };
  if (new TextEncoder().encode(JSON.stringify(result)).length > 500000) throw new CoachingError("Written material exceeds the 500 KB draft limit.");
  return result;
}

export function savePayload(k: Kind, value: unknown) {
  const p = obj(value, "Draft");
  const base = {
    title: text(p.title, "Title", 250),
    change_note: text(p.change_note, "Revision note", 4000)
  };
  if (k === "workbook") {
    const pages = array(p.edition_pages, "Edition pages", 300).map(
      (v, i) => {
        const x = obj(v);
        return {
          page_version_id: uuid(x.page_version_id),
          sort_order: i,
          page_reference: text(x.page_reference, "Page reference", 150)
        };
      }
    );
    distinct(pages.map(x => x.page_version_id), "edition pages");
    return {
      ...base,
      edition_label: text(p.edition_label, "Edition label", 150),
      description: text(p.description, "Description", 20000),
      edition_pages: pages
    };
  }
  const resources = array(p.resources, "Resources").map(
    (v, i) => {
      const x = obj(v);
      const type = choice(x.resource_type, ["audio", "attachment", "link", "workbook_reference"] as const);
      const file = optionalUuid(x.file_id);
      const url = httpsUrl(x.external_url);
      const reference = x.page_reference === null ? null : text(x.page_reference ?? "", "Workbook page reference", 150);
      if (["audio", "attachment"].includes(type) && !file) throw new CoachingError("Finish uploading each recording/attachment before saving, or remove its unfinished resource card.");
      if (type === "link" && !url) throw new CoachingError("Add the resource link before saving.");
      if (type === "workbook_reference" && !reference?.trim()) throw new CoachingError("Add a workbook page reference before saving.");
      return {
        resource_key: uuid(x.resource_key),
        sort_order: i,
        resource_type: type,
        label: text(x.label, "Resource title", 500),
        file_id: ["audio", "attachment"].includes(type) ? file : null,
        external_url: ["audio", "attachment"].includes(type) ? null : url,
        edition_label: x.edition_label === null ? null : text(x.edition_label ?? "", "Workbook edition", 200),
        page_reference: reference,
        transcript: text(x.transcript, "Transcript", 500000),
        is_required: bool(x.is_required)
      };
    }
  );
  distinct(resources.map(r => r.resource_key), "resource identifiers");
  const common = {
    ...base,
    subject: text(p.subject, "Subject", 300),
    content_document: document(p.content_document),
    resources
  };
  if (k === "page") {
    const questions = array(p.questions, "Questions").map(
      (v, i) => {
        const x = obj(v);
        const type = choice(x.response_type, ["short_text", "long_text", "checkbox", "single_choice", "multiple_choice"] as const);
        const options = array(x.options, "Answer choices", 100).map(
          o => {
            const y = obj(o);
            return {
              option_key: uuid(y.option_key),
              label: text(y.label, "Answer choice", 1000, true)
            };
          }
        );
        distinct(options.map(o => o.option_key), "choice identifiers");
        const hasChoices = ["single_choice", "multiple_choice"].includes(type);
        if (hasChoices ? options.length < 2 : options.length !== 0) throw new CoachingError("Choice questions need at least two choices; other question types must have none.");
        return {
          question_key: uuid(x.question_key),
          sort_order: i,
          response_type: type,
          prompt: text(x.prompt, "Question", 12000),
          help_text: text(x.help_text, "Question help text", 12000),
          is_required: bool(x.is_required),
          options
        };
      }
    );
    distinct(questions.map(q => q.question_key), "question identifiers");
    return { ...common, questions };
  }
  const activities = array(p.activities, "Workbook activities", 300).map(
    (v, i) => {
      const x = obj(v);
      return {
        activity_key: uuid(x.activity_key),
        page_version_id: uuid(x.page_version_id),
        workbook_version_id: optionalUuid(x.workbook_version_id),
        sort_order: i,
        is_required: bool(x.is_required)
      };
    }
  );
  distinct(activities.map(a => a.activity_key), "activity identifiers");
  distinct(activities.map(a => a.page_version_id), "workbook activities");
  return { ...common, activities };
}

export function fileSpec(filename: unknown, size: unknown, expectedKind: unknown) {
  const name = text(filename, "Filename", 500, true);
  if (/[\x00-\x1f\x7f/\\]/.test(name)) throw new CoachingError("Remove slashes or control characters from the filename.");
  const extension = name.split(".").pop()?.toLowerCase() ?? "";
  const spec = Object.prototype.hasOwnProperty.call(FILE_TYPES, extension) ? FILE_TYPES[extension] : undefined;
  if (!spec || spec.kind !== expectedKind) throw new CoachingError("Choose a supported audio file, or a PDF, DOCX or TXT worksheet.");
  return {
    filename: name,
    extension,
    size: integer(size, "File size", MAX_FILE_BYTES),
    ...spec
  };
}

// Header screening catches simple mislabeled uploads. It is NOT antivirus,
// a full document parser, or a guarantee about a file's safety/content.
export function headerMatches(extension: string, bytes: Uint8Array): boolean {
  const starts = (...n: number[]) => n.every((v, i) => bytes[i] === v);
  const ascii = (start: number, end: number) => String.fromCharCode(...bytes.slice(start, end));
  switch (extension) {
    case "mp3":
      return ascii(0, 3) === "ID3" || (bytes[0] === 255 && (bytes[1] & 0xe0) === 0xe0)
        ;
    case "m4a":
      return ascii(4, 8) === "ftyp"
        ;
    case "wav":
      return ascii(0, 4) === "RIFF" && ascii(8, 12) === "WAVE"
        ;
    case "ogg":
      return ascii(0, 4) === "OggS"
        ;
    case "webm":
      return starts(0x1a, 0x45, 0xdf, 0xa3)
        ;
    case "pdf":
      return ascii(0, Math.min(bytes.length, 1024)).includes("%PDF-")
        ;
    case "docx":
      return starts(0x50, 0x4b, 0x03, 0x04)
        ;
    case "txt":
      return !bytes.includes(0)
        ;
    default:
      return false
        ;
  }
}
