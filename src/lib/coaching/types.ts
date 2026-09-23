export type Kind = "module" | "workbook" | "page";

export type Block = {
  id: string;
  type: "paragraph" | "heading" | "bullets";
  text: string
};

export type ContentDocument = {
  schema_version: 1;
  blocks: Block[]
};

export type Question = {
  question_key: string;
  sort_order: number;
  response_type: "short_text" | "long_text" | "checkbox" | "single_choice" | "multiple_choice";
  prompt: string;
  help_text: string;
  is_required: boolean;
  options: {
    option_key: string;
    label: string
  }[];
};

export type Resource = {
  resource_key: string;
  sort_order: number;
  resource_type: "audio" | "attachment" | "link" | "workbook_reference";
  label: string;
  file_id: string | null;
  file_name?: string | null;
  external_url: string | null;
  edition_label: string | null;
  page_reference: string | null;
  transcript: string;
  is_required: boolean;
};

export type Activity = {
  activity_key: string;
  page_version_id: string;
  workbook_version_id: string | null;
  sort_order: number;
  is_required: boolean
};

export type EditionPage = {
  page_version_id: string;
  sort_order: number;
  page_reference: string
};

export type Version = {
  id: string;
  module_id?: string;
  page_id?: string;
  workbook_id?: string;
  version_number: number;
  publication_state: "draft" | "published";
  title: string;
  subject?: string;
  content_document?: ContentDocument;
  edition_label?: string;
  description?: string;
  change_note: string;
  edit_version: number;
  updated_at: string;
  published_at: string | null;
};

export type Bundle = {
  kind: Kind;
  version: Version;
  resources: Resource[];
  questions: Question[];
  activities: Activity[];
  edition_pages: EditionPage[]
};

export type Summary = {
  id: string;
  workbook_id?: string;
  version_id: string;
  title: string;
  version_number: number;
  publication_state: "draft" | "published"
};

export type Edition = Summary & {
  edition_label: string;
  pages: {
    page_version_id: string;
    page_reference: string
  }[]
};

export type Catalog = {
  modules: Summary[];
  workbooks: Summary[];
  pages: Summary[];
  published_pages: Summary[];
  editions: Edition[];
  at_display_limit: boolean
};

export type Capabilities = {
  author: boolean;
  admin: boolean;
  name: string;
  storage_ready: boolean
};

export type StaffAccess = {
  id: string;
  name: string;
  email: string | null;
  role: string;
  status: string | null;
  is_active: boolean;
  author: boolean
};
export const EMPTY_CATALOG: Catalog = {
  modules: [],
  workbooks: [],
  pages: [],
  published_pages: [],
  editions: [],
  at_display_limit: false
};
export const MAX_FILE_BYTES = 40 * 1024 * 1024;
export const BUCKET = "coaching-materials";
export const FILE_TYPES: Record<string, {
  mime: string;
  kind: "audio" | "document"
}> = {
  mp3: { mime: "audio/mpeg", kind: "audio" },
  m4a: { mime: "audio/mp4", kind: "audio" },
  wav: { mime: "audio/wav", kind: "audio" },
  ogg: { mime: "audio/ogg", kind: "audio" },
  webm: { mime: "audio/webm", kind: "audio" },
  pdf: { mime: "application/pdf", kind: "document" },
  txt: { mime: "text/plain", kind: "document" },
  docx: {
    mime: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    kind: "document"
  },
};
