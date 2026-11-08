import { browserApi } from "@/lib/api/browser";
import { readCsrfToken } from "@/lib/api/csrf";
import { isProblemDetails } from "@/lib/api/problem-details";
import type { EventFile } from "../lib/file-types";

import { FilesRequestError } from "./files-gateway";

/**
 * Files attached to a campaign (EVE-231). They use the same upload, scan and
 * private download pipeline as event files, mounted under the campaign. Reading
 * needs campaign.read (so the overseeing Marketing Manager can open them);
 * changing needs campaign.update, which the server checks against the campaign's
 * own department.
 */
const headers = () => {
  const token = readCsrfToken();
  return token ? { "x-csrf-token": token } : {};
};

const fail = (error: unknown, status: number): never => {
  throw new FilesRequestError(
    status,
    isProblemDetails(error) ? error.detail : undefined,
  );
};

export async function listCampaignFiles(
  campaignId: string,
  page = 1,
  signal?: AbortSignal,
) {
  const { data, error, response } = await browserApi.GET(
    "/api/v1/campaigns/{campaignId}/files",
    {
      params: { path: { campaignId }, query: { page, pageSize: 20 } as never },
      ...(signal ? { signal } : {}),
      cache: "no-store",
    },
  );
  if (!data) fail(error, response.status);
  return data;
}

export async function uploadCampaignFile(
  campaignId: string,
  file: File,
): Promise<EventFile> {
  const {
    data: intent,
    error,
    response,
  } = await browserApi.POST(
    "/api/v1/campaigns/{campaignId}/files/upload-intents",
    {
      params: { path: { campaignId } },
      body: {
        filename: file.name,
        mediaType: file.type,
        sizeBytes: file.size,
      } as never,
      headers: headers(),
    },
  );
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
    "/api/v1/campaigns/{campaignId}/files/{fileId}/finalize",
    { params: { path: { campaignId, fileId: intent.id } }, headers: headers() },
  );
  if (!finalized.data) return fail(finalized.error, finalized.response.status);
  return finalized.data as unknown as EventFile;
}

export async function removeCampaignFile(campaignId: string, fileId: string) {
  const { error, response } = await browserApi.DELETE(
    "/api/v1/campaigns/{campaignId}/files/{fileId}",
    { params: { path: { campaignId, fileId } }, headers: headers() },
  );
  if (!response.ok) fail(error, response.status);
}

export async function downloadCampaignFile(campaignId: string, fileId: string) {
  const { data, error, response } = await browserApi.GET(
    "/api/v1/campaigns/{campaignId}/files/{fileId}/download",
    { params: { path: { campaignId, fileId } }, cache: "no-store" },
  );
  if (!data) return fail(error, response.status);
  window.location.assign(data.url);
}
