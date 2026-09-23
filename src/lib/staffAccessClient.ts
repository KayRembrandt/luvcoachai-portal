"use client";
import { supabaseBrowser } from "@/lib/supabaseBrowser";
/** Existing browser login, verified again by each protected server endpoint. */
export async function staffRequest<T>(path: string, body?: unknown, method = "POST"): Promise<T> {
    const { data, error } = await supabaseBrowser.auth.getSession();
    if (error || !data.session?.access_token) {
        throw new Error("Please sign in to the staff portal again.");
    }
    const response = await fetch(path, {
        method: body === undefined ? "GET" : method,
        cache: "no-store",
        credentials: "same-origin",
        headers: {
            Authorization: `Bearer ${data.session.access_token}`,
            ...(body === undefined ? {} : { "Content-Type": "application/json" }),
        },
        ...(body === undefined ? {} : { body: JSON.stringify(body) }),
        signal: AbortSignal.timeout(60000),
    });
    const value = await response.json().catch(() => null);
    if (!response.ok)
        throw new Error(value?.error || `Request failed (${response.status}).`);
    if (value === null)
        throw new Error("The server returned an unreadable response. Your unsaved changes have been kept.");
    return value as T;
}
export function errorMessage(error: unknown): string {
    if (error instanceof Error && (error.name === "TimeoutError" || error.name === "AbortError")) {
        return "The request timed out. Check the saved record before retrying a change.";
    }
    return error instanceof Error ? error.message : "The request could not be completed.";
}

