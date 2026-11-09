import { browserApi } from "@/lib/api/browser";
import { readCsrfToken } from "@/lib/api/csrf";
import { isProblemDetails } from "@/lib/api/problem-details";

import type {
  CreativeAssetType,
  CreativeRequest,
  CreativeRequestDirection,
  CreativeRequestFeedback,
  CreativeRequestFile,
  CreativeRequestFileKind,
  CreativeRequestStatus,
  PaginatedCreativeRequestFeedback,
  PaginatedCreativeRequestFiles,
  PaginatedCreativeRequests,
} from "../lib/creative-requests-types";

/** A failed creative request call, with the API's own explanation if any. */
export class CreativeRequestsError extends Error {
  constructor(
    readonly status: number,
    detail?: string,
  ) {
    super(
      detail ??
        (status === 401
          ? "Your session expired. Sign in again."
          : status === 403
            ? "You do not have access to this creative request."
            : status === 404
              ? "This creative request no longer exists. Refresh the list."
              : "We could not complete that. Try again."),
    );
    this.name = "CreativeRequestsError";
  }
}

const headers = () => {
  const token = readCsrfToken();
  return token ? { "x-csrf-token": token } : {};
};

function fail(error: unknown, status: number): never {
  throw new CreativeRequestsError(
    status,
    isProblemDetails(error) ? error.detail : undefined,
  );
}

export interface ListCreativeRequestsParams {
  direction?: CreativeRequestDirection | null;
  status?: CreativeRequestStatus | null;
  search?: string;
  page: number;
  pageSize?: number;
}

export async function listCreativeRequests(
  params: ListCreativeRequestsParams,
  signal?: AbortSignal,
): Promise<PaginatedCreativeRequests> {
  const query: Record<string, string | number> = {
    page: params.page,
    pageSize: params.pageSize ?? 25,
  };
  if (params.direction) query.direction = params.direction;
  if (params.status) query.status = params.status;
  if (params.search?.trim()) query.search = params.search.trim();
  const { data, error, response } = await browserApi.GET(
    "/api/v1/creative-requests",
    {
      params: { query: query as never },
      ...(signal ? { signal } : {}),
      cache: "no-store",
    },
  );
  if (!data) fail(error, response.status);
  return data;
}

export async function getCreativeRequest(
  id: string,
  signal?: AbortSignal,
): Promise<CreativeRequest> {
  const { data, error, response } = await browserApi.GET(
    "/api/v1/creative-requests/{id}",
    {
      params: { path: { id } },
      ...(signal ? { signal } : {}),
      cache: "no-store",
    },
  );
  if (!data) fail(error, response.status);
  return data;
}

export interface CreateCreativeRequestInput {
  title: string;
  assetType: CreativeAssetType;
  requirements: string;
  dueAt?: string;
  campaignId?: string;
}

export async function createCreativeRequest(
  input: CreateCreativeRequestInput,
): Promise<CreativeRequest> {
  const { data, error, response } = await browserApi.POST(
    "/api/v1/creative-requests",
    { body: input, headers: headers() },
  );
  if (!data) fail(error, response.status);
  return data;
}

/** Moves a request to `to`, through the endpoint that makes that move. */
export async function moveCreativeRequest(
  id: string,
  to: CreativeRequestStatus,
  details: { reason?: string; note?: string } = {},
): Promise<CreativeRequest> {
  const params = { params: { path: { id } }, headers: headers() };
  const result =
    to === "ACCEPTED"
      ? await browserApi.POST("/api/v1/creative-requests/{id}/accept", params)
      : to === "DECLINED"
        ? await browserApi.POST("/api/v1/creative-requests/{id}/decline", {
            ...params,
            body: { reason: details.reason ?? "" },
          })
        : to === "IN_PROGRESS"
          ? await browserApi.POST(
              "/api/v1/creative-requests/{id}/start",
              params,
            )
          : to === "DELIVERED"
            ? await browserApi.POST(
                "/api/v1/creative-requests/{id}/deliver",
                params,
              )
            : to === "CANCELLED"
              ? await browserApi.POST(
                  "/api/v1/creative-requests/{id}/cancel",
                  params,
                )
              : await browserApi.POST("/api/v1/creative-requests/{id}/review", {
                  ...params,
                  body: {
                    outcome:
                      to === "APPROVED" ? "APPROVED" : "CHANGES_REQUESTED",
                    ...(details.note ? { note: details.note } : {}),
                  },
                });
  if (!result.data) fail(result.error, result.response.status);
  return result.data;
}

export async function listCreativeRequestFeedback(
  id: string,
  signal?: AbortSignal,
): Promise<PaginatedCreativeRequestFeedback> {
  const { data, error, response } = await browserApi.GET(
    "/api/v1/creative-requests/{id}/feedback",
    {
      params: { path: { id }, query: { page: 1, pageSize: 100 } as never },
      ...(signal ? { signal } : {}),
      cache: "no-store",
    },
  );
  if (!data) fail(error, response.status);
  return data;
}

export async function addCreativeRequestFeedback(
  id: string,
  note: string,
): Promise<CreativeRequestFeedback> {
  const { data, error, response } = await browserApi.POST(
    "/api/v1/creative-requests/{id}/feedback",
    { params: { path: { id } }, body: { note }, headers: headers() },
  );
  if (!data) fail(error, response.status);
  return data;
}

export async function listCreativeRequestFiles(
  id: string,
  signal?: AbortSignal,
): Promise<PaginatedCreativeRequestFiles> {
  const { data, error, response } = await browserApi.GET(
    "/api/v1/creative-requests/{creativeRequestId}/files",
    {
      params: {
        path: { creativeRequestId: id },
        query: { page: 1, pageSize: 100 } as never,
      },
      ...(signal ? { signal } : {}),
      cache: "no-store",
    },
  );
  if (!data) fail(error, response.status);
  return data;
}

/** Declares, uploads straight to storage, then finalizes one file. */
export async function uploadCreativeRequestFile(
  id: string,
  kind: CreativeRequestFileKind,
  file: File,
): Promise<CreativeRequestFile> {
  const intent = await browserApi.POST(
    "/api/v1/creative-requests/{creativeRequestId}/files/upload-intents",
    {
      params: { path: { creativeRequestId: id } },
      body: {
        filename: file.name,
        mediaType: file.type as never,
        sizeBytes: file.size,
        kind,
      },
      headers: headers(),
    },
  );
  if (!intent.data) fail(intent.error, intent.response.status);
  const form = new FormData();
  Object.entries(intent.data.upload.fields).forEach(([key, value]) =>
    form.append(key, value),
  );
  form.append("file", file);
  const uploaded = await fetch(intent.data.upload.url, {
    method: "POST",
    body: form,
  });
  if (!uploaded.ok)
    throw new CreativeRequestsError(
      uploaded.status,
      "The file could not be uploaded. Choose it again to retry.",
    );
  const finalized = await browserApi.POST(
    "/api/v1/creative-requests/{creativeRequestId}/files/{fileId}/finalize",
    {
      params: { path: { creativeRequestId: id, fileId: intent.data.id } },
      body: { kind },
      headers: headers(),
    },
  );
  if (!finalized.data) fail(finalized.error, finalized.response.status);
  return finalized.data;
}

export async function downloadCreativeRequestFile(
  id: string,
  fileId: string,
): Promise<void> {
  const { data, error, response } = await browserApi.GET(
    "/api/v1/creative-requests/{creativeRequestId}/files/{fileId}/download",
    {
      params: { path: { creativeRequestId: id, fileId } },
      cache: "no-store",
    },
  );
  if (!data) fail(error, response.status);
  window.location.assign(data.url);
}
