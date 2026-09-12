import { browserApi } from "@/lib/api/browser";
import { readCsrfToken } from "@/lib/api/csrf";
import { isProblemDetails } from "@/lib/api/problem-details";
import type { EventFile } from "../lib/file-types";

const headers = () => {
  const token = readCsrfToken();
  return token ? { "x-csrf-token": token } : {};
};
export class FilesRequestError extends Error {
  constructor(
    readonly status: number,
    detail?: string,
  ) {
    super(
      detail ??
        (status === 401
          ? "Your session expired. Sign in again."
          : status === 403
            ? "You do not have permission to manage event files."
            : status === 404
              ? "This event or file is no longer available."
              : "We could not complete that file action. Try again."),
    );
  }
}
const fail = (error: unknown, status: number): never => {
  throw new FilesRequestError(
    status,
    isProblemDetails(error) ? error.detail : undefined,
  );
};
export async function listEventFiles(
  eventId: string,
  page = 1,
  signal?: AbortSignal,
) {
  const { data, error, response } = await browserApi.GET(
    "/api/v1/events/{eventId}/files",
    {
      params: { path: { eventId }, query: { page, pageSize: 20 } as never },
      ...(signal ? { signal } : {}),
      cache: "no-store",
    },
  );
  if (!data) fail(error, response.status);
  return data;
}
export async function uploadEventFile(
  eventId: string,
  file: File,
): Promise<EventFile> {
  const {
    data: intent,
    error,
    response,
  } = await browserApi.POST("/api/v1/events/{eventId}/files/upload-intents", {
    params: { path: { eventId } },
    body: {
      filename: file.name,
      mediaType: file.type,
      sizeBytes: file.size,
    } as never,
    headers: headers(),
  });
  if (!intent) return fail(error, response.status);
  const form = new FormData();
  Object.entries(intent.upload.fields).forEach(([key, value]) =>
    form.append(key, value),
  );
  form.append("file", file);
  const uploaded = await fetch(intent.upload.url, {
    method: "POST",
    body: form,
  });
  if (!uploaded.ok)
    throw new FilesRequestError(
      uploaded.status,
      "The file could not be uploaded. Your selection is still available to retry.",
    );
  const finalized = await browserApi.POST(
    "/api/v1/events/{eventId}/files/{fileId}/finalize",
    { params: { path: { eventId, fileId: intent.id } }, headers: headers() },
  );
  if (!finalized.data) return fail(finalized.error, finalized.response.status);
  return finalized.data as unknown as EventFile;
}
export async function removeEventFile(eventId: string, fileId: string) {
  const { error, response } = await browserApi.DELETE(
    "/api/v1/events/{eventId}/files/{fileId}",
    { params: { path: { eventId, fileId } }, headers: headers() },
  );
  if (!response.ok) fail(error, response.status);
}
export async function downloadEventFile(eventId: string, fileId: string) {
  const { data, error, response } = await browserApi.GET(
    "/api/v1/events/{eventId}/files/{fileId}/download",
    { params: { path: { eventId, fileId } }, cache: "no-store" },
  );
  if (!data) return fail(error, response.status);
  window.location.assign(data.url);
}
