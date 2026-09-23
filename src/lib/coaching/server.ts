import "server-only";
import { NextRequest, NextResponse } from "next/server";
import { createSupabaseServiceServerClient } from "@/lib/supabaseServiceServer";
import { BUCKET, FILE_TYPES, MAX_FILE_BYTES } from "./types";
import {
  CoachingError,
  obj,
  uuid,
  kind,
  integer,
  text,
  bool,
  savePayload,
  fileSpec,
  headerMatches
} from "./validate";

type Db = ReturnType<typeof createSupabaseServiceServerClient>;

type Staff = {
  id: string;
  auth_user_id: string | null;
  first_name: string | null;
  role: string;
  status: string | null;
  is_active: boolean;
  permissions: Record<string, unknown> | null
};

type Auth = {
  db: Db;
  userId: string;
  staff: Staff;
  admin: boolean;
  author: boolean
};
const STAFF_FIELDS = "id,auth_user_id,first_name,role,status,is_active,permissions";
const HEADERS = {
  "Cache-Control": "private, no-store, max-age=0",
  Vary: "Authorization",
  "Referrer-Policy": "no-referrer"
};

export function ok(data: unknown) {
  return NextResponse.json(data, { headers: HEADERS });
}

export function failure(e: unknown) {
  if (e instanceof CoachingError) return NextResponse.json({ error: e.message }, { status: e.status, headers: HEADERS });
  const code = (e && typeof e === "object" && "code" in e) ? String(e.code) : "unknown";
  // Do not log request bodies, bearer tokens, authored material or signed URLs.
  console.error("[coaching] request failed", { code });
  return NextResponse.json(
    { error: "The coaching request could not be completed. Please try again. If it continues, share the action and error code: " + code },
    { status: 500, headers: HEADERS }
  );
}

async function authenticate(req: NextRequest): Promise<Auth> {
  const token = req.headers.get("authorization")?.match(/^Bearer\s+(\S+)$/i)?.[1];
  if (!token || token.length > 16384) throw new CoachingError("Please sign in to the staff portal again.", 401);
  const db = createSupabaseServiceServerClient();
  const { data, error } = await db.auth.getUser(token);
  if (error || !data.user) throw new CoachingError("Your login has expired. Please sign in again.", 401);
  const userId = data.user.id;
  // No email fallback and no mutation of staff identity during a read.
  const byAuth = await db.from("staff").select(STAFF_FIELDS).eq("auth_user_id", userId).maybeSingle();
  if (byAuth.error) throw byAuth.error;
  let staff = byAuth.data as Staff | null;
  if (!staff) {
    const byId = await db.from("staff").select(STAFF_FIELDS).eq("id", userId).is("auth_user_id", null).maybeSingle();
    if (byId.error) throw byId.error;
    staff = byId.data as Staff | null;
  }
  if (!staff || staff.is_active !== true || !["", "active", "approved"].includes(String(staff.status ?? "").trim().toLowerCase())) {
    throw new CoachingError("Active staff access is required.", 403);
  }
  const admin = ["admin", "super_admin"].includes(staff.role.trim().toLowerCase());
  return {
    db,
    userId,
    staff,
    admin,
    author: admin || staff.permissions?.coaching_author === true
  };
}

function requireAuthor(a: Auth) {
  if (!a.author) throw new CoachingError("Ask Ami to enable Coaching author access for your staff account.", 403);
}

function requireAdmin(a: Auth) {
  if (!a.admin) throw new CoachingError("Administrator access is required.", 403);
}

function rpcError(e: {
  code?: string;
  message?: string
}): never {
  if (e.code === "42501") throw new CoachingError("Your coaching access is not enabled or is no longer active.", 403);
  if (["40001", "40P01", "55P03"].includes(e.code ?? "")) throw new CoachingError(e.code === "40001"
    ? (e.message ?? "The draft changed. Reload before saving.")
    : "Another edit is in progress. Keep your changes and try again.", 409);
  if (e.code === "P0002") throw new CoachingError("The selected content was not found.", 404);
  if (e.code === "22023") throw new CoachingError(e.message ?? "Please check the content fields.", 422);
  if (e.code === "23514") throw new CoachingError((e.message ?? "").includes("violates check constraint")
    ? "A field does not meet the workbook rules. Check the question choices, resources and required fields."
    : (e.message ?? "Please check the content fields."), 422);
  if (e.code === "23503") throw new CoachingError("A linked workbook page, file or staff record is missing. Refresh the available material and try again.", 422);
  if (e.code === "23505") throw new CoachingError("A draft or linked item already exists. Reload the item instead of creating a duplicate.", 409);
  if (e.code === "PGRST202" || e.code === "42883") throw new CoachingError("The protected authoring commands are not installed yet. Apply SQL file 03 in the same Supabase project first.", 503);
  throw e;
}

async function rpc(
  a: Auth,
  action: string,
  k = "module",
  id: string | null = null,
  expected: number | null = null,
  payload: unknown = {}) {
  const { data, error } = await a.db.rpc(
    "coaching_authoring_v1",
    {
      p_actor: a.userId,
      p_action: action,
      p_kind: k,
      p_id: id,
      p_expected: expected,
      p_payload: payload
    }
  );
  if (error) rpcError(error);
  return data;
}

async function body(req: NextRequest) {
  if (!req.headers.get("content-type")?.toLowerCase().startsWith("application/json")) throw new CoachingError("Use JSON for authoring requests.", 415);
  const origin = req.headers.get("origin");
  const allowed = new Set([req.nextUrl.origin]);
  if (process.env.NEXT_PUBLIC_SITE_URL) {
    try {
      allowed.add(new URL(process.env.NEXT_PUBLIC_SITE_URL).origin);
    } catch { /* invalid config is not trusted */ }
  }
  if (origin && !allowed.has(origin)) throw new CoachingError("This request must originate from the staff portal.", 403);
  const reader = req.body?.getReader();
  if (!reader) throw new CoachingError("Request body is missing.");
  const chunks: Uint8Array[] = [];
  let total = 0;
  try {
    while (true) {
      const part = await reader.read();
      if (part.done) break;
      total += part.value.byteLength;
      if (total > 2 * 1024 * 1024) {
        await reader.cancel();
        throw new CoachingError("This draft is too large. Split long material into modules.", 413);
      }
      chunks.push(part.value);
    }
  } finally {
    reader.releaseLock();
  }
  const bytes = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.length;
  }
  try {
    return obj(JSON.parse(new TextDecoder().decode(bytes)));
  }
  catch (e) {
    if (e instanceof CoachingError) throw e;
    throw new CoachingError("Invalid JSON request.");
  }
}

function storageNotFound(error: unknown) {
  const e = error as {
    status?: number | string;
    statusCode?: number | string;
    message?: string
  };
  return String(e.status ?? e.statusCode) === "404" || /not found/i.test(e.message ?? "");
}

function bucketGood(b: {
  public: boolean;
  file_size_limit?: number | string | null;
  allowed_mime_types?: string[] | null
}) {
  const allowed = new Set(Object.values(FILE_TYPES).map(t => t.mime));
  return b.public === false && Number(b.file_size_limit) > 0 && Number(b.file_size_limit) <= MAX_FILE_BYTES
    && !!b.allowed_mime_types?.length && b.allowed_mime_types.every(t => allowed.has(t));
}

async function checkBucket(db: Db) {
  const { data, error } = await db.storage.getBucket(BUCKET);
  if (error) {
    if (storageNotFound(error)) return false;
    throw new CoachingError("Could not inspect the coaching storage bucket. Check the server Storage access.", 503);
  }
  return !!data && bucketGood(data);
}

async function setupBucket(a: Auth) {
  requireAdmin(a);
  const current = await a.db.storage.getBucket(BUCKET);
  if (!current.error && current.data) {
    if (!bucketGood(current.data)) throw new CoachingError("A coaching-materials bucket exists but its privacy/limits differ. No settings were changed. Share its settings before proceeding.", 409);
    return { ok: true };
  }
  if (!current.error || !storageNotFound(current.error)) {
    throw new CoachingError("Could not confirm whether the storage bucket exists. No bucket was changed.", 503);
  }
  const { error } = await a.db.storage.createBucket(
    BUCKET,
    {
      public: false,
      fileSizeLimit: MAX_FILE_BYTES,
      allowedMimeTypes: [...new Set(Object.values(FILE_TYPES).map(t => t.mime))]
    }
  );
  if (error) throw new CoachingError("Could not create private coaching storage: " + error.message, 503);
  return { ok: true };
}

async function initiateUpload(a: Auth, b: Record<string, unknown>) {
  const k = kind(b.kind);
  if (k === "workbook") throw new CoachingError("Add resources to a module or workbook page.");
  const versionId = uuid(b.version_id);
  const content = await rpc(a, "get", k, versionId);
  if (content.version.publication_state !== "draft") throw new CoachingError("Create a draft before uploading material.", 409);
  const spec = fileSpec(b.filename, b.size, b.file_kind);
  if (!await checkBucket(a.db)) throw new CoachingError("Ami must enable private coaching storage from the Coaching access tab first.", 409);
  // An accidental retry should not create an unbounded pile of pending uploads.
  const recent = await a.db.from("coaching_files").select("id", { count: "exact", head: true }).eq("created_by_staff_id", a.staff.id)
    .gte(
      "created_at",
      new Date(Date.now() - 600000).toISOString()
    );
  if (recent.error) throw recent.error;
  if ((recent.count ?? 0) >= 60) throw new CoachingError("Upload limit reached. Wait a few minutes before adding more files.", 429);
  const id = crypto.randomUUID();
  const path = `files/${id}/original.${spec.extension}`;
  const inserted = await a.db.from("coaching_files").insert(
    {
      id,
      object_path: path,
      original_filename: spec.filename,
      file_kind: spec.kind,
      mime_type: spec.mime,
      size_bytes: spec.size,
      created_by_staff_id: a.staff.id
    }
  );
  if (inserted.error) throw inserted.error;
  const signed = await a.db.storage.from(BUCKET).createSignedUploadUrl(path, { upsert: false });
  if (signed.error) throw new CoachingError("Could not begin the private upload. Try again.", 503);
  return {
    id,
    path,
    token: signed.data.token,
    bucket: BUCKET,
    mime: spec.mime
  };
}

async function findFile(a: Auth, id: string) {
  const { data, error } = await a.db.from("coaching_files").select(
    "id,bucket_id,object_path,original_filename,file_kind,mime_type,size_bytes,upload_state,created_by_staff_id"
  )
    .eq(
      "id",
      id
    )
    .maybeSingle();
  if (error) throw error;
  if (!data) throw new CoachingError("File not found.", 404);
  return data;
}

async function signedDownload(a: Auth, file: {
  object_path: string;
  original_filename: string;
  file_kind: string
}) {
  const opts = file.file_kind === "audio" ? undefined : { download: file.original_filename };
  const { data, error } = await a.db.storage.from(BUCKET).createSignedUrl(file.object_path, file.file_kind === "audio" ? 3600 : 300, opts);
  if (error) throw new CoachingError("Could not open the private file.", 503);
  return data.signedUrl;
}

async function finishUpload(a: Auth, id: string) {
  const file = await findFile(a, id);
  if (file.created_by_staff_id !== a.staff.id) throw new CoachingError("Complete uploads using the staff account that started them.", 403);
  if (file.upload_state === "ready") return { id, file_name: file.original_filename };
  if (file.upload_state !== "pending") throw new CoachingError("This upload was rejected. Choose the file again.", 422);
  const base = file.object_path.split("/").pop()!;
  const folder = file.object_path.slice(0, -(base.length + 1));
  const listed = await a.db.storage.from(BUCKET).list(folder, { limit: 10, search: base });
  if (listed.error) throw new CoachingError("Could not verify the upload. Try the upload again.", 503);
  const object = listed.data.find(f => f.name === base);
  if (!object) throw new CoachingError("The upload has not finished yet. Try again.", 409);
  const reportedSize = Number(object.metadata?.size);
  const mime = String(object.metadata?.mimetype ?? "").split(";")[0].trim();
  let valid = reportedSize === Number(file.size_bytes) && reportedSize > 0 && reportedSize <= MAX_FILE_BYTES && mime === file.mime_type;
  if (valid) {
    const signed = await a.db.storage.from(BUCKET).createSignedUrl(file.object_path, 60);
    if (signed.error) throw new CoachingError("Unable to validate uploaded content.", 503);
    const url = new URL(signed.data.signedUrl);
    const project = new URL(process.env.NEXT_PUBLIC_SUPABASE_URL!);
    if (url.origin !== project.origin) throw new CoachingError("Unexpected storage origin. Stop and check the configuration.", 503);
    const res = await fetch(
      url,
      {
        headers: { Range: "bytes=0-4095" },
        cache: "no-store",
        redirect: "error",
        signal: AbortSignal.timeout(15000)
      }
    );
    if (!res.ok) throw new CoachingError("Unable to read the uploaded file header. Please retry.", 503);
    const reader = res.body?.getReader();
    if (!reader) throw new CoachingError("Uploaded file appears to be empty.", 422);
    const bytes = new Uint8Array(4096);
    let used = 0;
    try {
      while (used < bytes.length) {
        const part = await reader.read();
        if (part.done) break;
        const n = Math.min(part.value.length, bytes.length - used);
        bytes.set(part.value.subarray(0, n), used);
        used += n;
      }
    }
    finally {
      await reader.cancel();
      reader.releaseLock();
    }
    valid = headerMatches(base.split(".").pop() ?? "", bytes.subarray(0, used));
  }
  const changed = await a.db.from("coaching_files").update({ upload_state: valid ? "ready" : "rejected" }).eq("id", id).eq(
    "upload_state",
    "pending"
  );
  if (changed.error) throw changed.error;
  if (!valid) throw new CoachingError("The file's size or format did not match the selected type. It was not approved for use. Export a fresh copy and try again.", 422);
  return { id, file_name: file.original_filename };
}

export async function coachingGET(req: NextRequest) {
  const a = await authenticate(req);
  const action = req.nextUrl.searchParams.get("action") ?? "capabilities";
  if (action === "capabilities") return ok(
    {
      admin: a.admin,
      author: a.author,
      name: a.staff.first_name ?? "",
      storage_ready: a.author ? await checkBucket(a.db) : false
    }
  );
  if (action === "staff_list") {
    requireAdmin(a);
    return ok(await rpc(a, "staff_list"));
  }
  requireAuthor(a);
  if (action === "list") return ok(await rpc(a, "list"));
  if (action === "get") return ok(await rpc(a, "get", kind(req.nextUrl.searchParams.get("kind")), uuid(req.nextUrl.searchParams.get("id"))));
  throw new CoachingError("Unknown coaching request.", 404);
}

export async function coachingPOST(req: NextRequest) {
  const a = await authenticate(req);
  requireAuthor(a);
  const b = await body(req);
  const action = text(b.action, "Action", 50, true);
  if (action === "storage_setup") return ok(await setupBucket(a));
  if (action === "upload_init") return ok(await initiateUpload(a, b));
  if (action === "upload_complete") return ok(await finishUpload(a, uuid(b.id)));
  if (action === "file_url") {
    const file = await findFile(a, uuid(b.id));
    if (file.upload_state !== "ready") throw new CoachingError("This file is not ready for use.", 409);
    return ok({ url: await signedDownload(a, file) });
  }
  if (action === "set_author") {
    requireAdmin(a);
    return ok(
      await rpc(
        a,
        "set_author",
        "module",
        uuid(b.id),
        null,
        { author: bool(b.author), expected_author: bool(b.expected_author) }
      )
    );
  }
  const k = kind(b.kind);
  const id = uuid(b.id);
  if (action === "create") {
    const p = obj(b.payload);
    const payload = {
      title: text(p.title, "Title", 250, true),
      ...(k === "page" ? { workbook_id: uuid(p.workbook_id) } : {})
    };
    return ok(await rpc(a, action, k, id, null, payload));
  }
  if (action === "revise") return ok(await rpc(a, action, k, id));
  if (action === "publish") return ok(await rpc(a, action, k, id, integer(b.expected, "Saved version")));
  if (action === "save") return ok(await rpc(a, action, k, id, integer(b.expected, "Saved version"), savePayload(k, b.payload)));
  throw new CoachingError("Unknown coaching request.", 404);
}
