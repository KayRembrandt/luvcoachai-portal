"use client";
import { supabaseBrowser } from "@/lib/supabaseBrowser";
import { FILE_TYPES, MAX_FILE_BYTES } from "./types";

export class CoachingRequestError extends Error {
  constructor(message: string, public status: number) {
    super(message);
  }
}

export async function coachingRequest<T>(query: Record<string, string> = {}, body?: unknown): Promise<T> {
  const { data, error } = await supabaseBrowser.auth.getSession();
  if (error || !data.session?.access_token) throw new CoachingRequestError("Please sign in to the staff portal again.", 401);
  const res = await fetch(
    "/api/coaching?" + new URLSearchParams(query),
    {
      method: body === undefined ? "GET" : "POST",
      cache: "no-store",
      credentials: "same-origin",
      signal: AbortSignal.timeout(60000),
      headers: {
        Authorization: `Bearer ${data.session.access_token}`,
        ...(body === undefined ? {} : { "Content-Type": "application/json" })
      },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    }
  );
  const json = await res.json().catch(() => null);
  if (!res.ok) throw new CoachingRequestError(json?.error ?? `Request failed (${res.status}). Your unsaved edits remain on this screen.`, res.status);
  if (json === null) throw new CoachingRequestError("The server returned an unreadable response. Keep your changes and refresh only after copying them.", 502);
  return json as T;
}

export async function uploadResource(file: File, fileKind: "audio" | "document", kind: string, versionId: string) {
  const ext = file.name.split(".").pop()?.toLowerCase() ?? "";
  if (!FILE_TYPES[ext] || FILE_TYPES[ext].kind !== fileKind) throw new Error("Choose a supported audio file, or a PDF, DOCX or TXT worksheet.");
  if (!file.size || file.size > MAX_FILE_BYTES) throw new Error("Each file must be between 1 byte and 40 MiB. Compress or split larger recordings.");
  const start = await coachingRequest<{
    id: string;
    path: string;
    token: string;
    bucket: string;
    mime: string
  }>(
    {},
    {
      action: "upload_init",
      filename: file.name,
      size: file.size,
      file_kind: fileKind,
      kind,
      version_id: versionId,
    }
  );
  const { error } = await supabaseBrowser.storage.from(start.bucket).uploadToSignedUrl(
    start.path,
    start.token,
    new Blob([file], { type: start.mime }),
    { contentType: start.mime, upsert: false }
  );
  if (error) throw new Error("Upload failed: " + error.message + ". Your existing draft was not changed.");
  return coachingRequest<{
    id: string;
    file_name: string
  }>({}, { action: "upload_complete", id: start.id });
}
