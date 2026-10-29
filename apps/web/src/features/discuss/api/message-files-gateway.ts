import type { components } from "@event-platform/api-client";
import { browserApi } from "@/lib/api/browser";
import { readCsrfToken } from "@/lib/api/csrf";
import { isProblemDetails } from "@/lib/api/problem-details";

export type MessageFile = components["schemas"]["ManagedFileResponse"];
const headers = () => ({ "x-csrf-token": readCsrfToken() ?? "" });
function fail(error: unknown): never {
  throw new Error(
    isProblemDetails(error)
      ? error.detail
      : "We could not complete the file action. Please retry.",
  );
}
export async function listMessageFiles(
  conversationId: string,
  messageId: string,
  signal?: AbortSignal,
) {
  const { data, error } = await browserApi.GET(
    "/api/v1/conversations/{conversationId}/messages/{messageId}/files",
    {
      params: {
        path: { conversationId, messageId },
        query: { page: 1, pageSize: 100 } as never,
      },
      ...(signal ? { signal } : {}),
      cache: "no-store",
    },
  );
  if (!data) fail(error);
  return data.items;
}
export async function uploadMessageFile(
  conversationId: string,
  messageId: string,
  file: File,
) {
  const { data: intent, error } = await browserApi.POST(
    "/api/v1/conversations/{conversationId}/files/upload-intents",
    {
      params: { path: { conversationId } },
      headers: headers(),
      body: {
        filename: file.name,
        mediaType: file.type,
        sizeBytes: file.size,
      } as never,
    },
  );
  if (!intent) fail(error);
  const form = new FormData();
  Object.entries(intent.upload.fields).forEach(([key, value]) =>
    form.append(key, value),
  );
  form.append("file", file);
  const response = await fetch(intent.upload.url, {
    method: "POST",
    body: form,
  });
  if (!response.ok)
    throw new Error("The upload failed. Check your connection and retry.");
  const result = await browserApi.POST(
    "/api/v1/conversations/{conversationId}/messages/{messageId}/files/{fileId}/finalize",
    {
      params: { path: { conversationId, messageId, fileId: intent.id } },
      headers: headers(),
    },
  );
  if (!result.data) fail(result.error);
  return result.data;
}
export async function messageFileGrant(
  conversationId: string,
  messageId: string,
  fileId: string,
) {
  const { data, error } = await browserApi.GET(
    "/api/v1/conversations/{conversationId}/messages/{messageId}/files/{fileId}/download",
    {
      params: { path: { conversationId, messageId, fileId } },
      cache: "no-store",
    },
  );
  if (!data) fail(error);
  return data;
}
