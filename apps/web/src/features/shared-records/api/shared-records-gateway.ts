import type { operations } from "@event-platform/api-client";

import { browserApi } from "@/lib/api/browser";
import type { EventFile } from "@/features/files/lib/file-types";

import type {
  PaginatedSharedDocuments,
  PaginatedSharedLetters,
  SharedDocument,
  SharedLetter,
} from "../lib/shared-records-types";

export class SharedRecordsRequestError extends Error {
  constructor(readonly status: number) {
    super(
      status === 401
        ? "Your session expired. Sign in again."
        : status === 404
          ? "This is no longer shared with you. Refresh the list."
          : "We could not load the data. Try again.",
    );
    this.name = "SharedRecordsRequestError";
  }
}

export interface ListSharedLettersParams {
  search?: string;
  page?: number;
  pageSize?: number;
}

type LettersListQuery = NonNullable<
  operations["SharedRecords_listLetters_v1"]["parameters"]["query"]
>;

export async function listSharedLetters(
  params: ListSharedLettersParams,
  signal?: AbortSignal,
): Promise<PaginatedSharedLetters> {
  const query: Record<string, string | number> = {
    page: params.page ?? 1,
    pageSize: params.pageSize ?? 20,
  };
  if (params.search?.trim()) query.search = params.search.trim();
  const { data, response } = await browserApi.GET(
    "/api/v1/shared-with-me/letters",
    {
      params: { query: query as unknown as LettersListQuery },
      ...(signal ? { signal } : {}),
      cache: "no-store",
    },
  );
  if (!data) throw new SharedRecordsRequestError(response.status);
  return data;
}

export async function getSharedLetter(
  id: string,
  signal?: AbortSignal,
): Promise<SharedLetter | null> {
  const { data } = await browserApi.GET("/api/v1/shared-with-me/letters/{id}", {
    params: { path: { id } },
    ...(signal ? { signal } : {}),
    cache: "no-store",
  });
  return data ?? null;
}

export interface ListSharedDocumentsParams {
  search?: string;
  page?: number;
  pageSize?: number;
}

type DocumentsListQuery = NonNullable<
  operations["SharedRecords_listDocuments_v1"]["parameters"]["query"]
>;

export async function listSharedDocuments(
  params: ListSharedDocumentsParams,
  signal?: AbortSignal,
): Promise<PaginatedSharedDocuments> {
  const query: Record<string, string | number> = {
    page: params.page ?? 1,
    pageSize: params.pageSize ?? 20,
  };
  if (params.search?.trim()) query.search = params.search.trim();
  const { data, response } = await browserApi.GET(
    "/api/v1/shared-with-me/documents",
    {
      params: { query: query as unknown as DocumentsListQuery },
      ...(signal ? { signal } : {}),
      cache: "no-store",
    },
  );
  if (!data) throw new SharedRecordsRequestError(response.status);
  return data;
}

export async function getSharedDocument(
  id: string,
  signal?: AbortSignal,
): Promise<SharedDocument | null> {
  const { data } = await browserApi.GET(
    "/api/v1/shared-with-me/documents/{id}",
    {
      params: { path: { id } },
      ...(signal ? { signal } : {}),
      cache: "no-store",
    },
  );
  return data ?? null;
}

export async function listSharedLetterFiles(
  letterId: string,
  signal?: AbortSignal,
): Promise<EventFile[]> {
  const { data } = await browserApi.GET(
    "/api/v1/shared-with-me/letters/{letterId}/files",
    {
      params: { path: { letterId }, query: { page: 1, pageSize: 20 } as never },
      ...(signal ? { signal } : {}),
      cache: "no-store",
    },
  );
  return (data?.items as unknown as EventFile[]) ?? [];
}

export async function downloadSharedLetterFile(
  letterId: string,
  fileId: string,
): Promise<void> {
  const { data, response } = await browserApi.GET(
    "/api/v1/shared-with-me/letters/{letterId}/files/{fileId}/download",
    { params: { path: { letterId, fileId } }, cache: "no-store" },
  );
  if (!data) throw new SharedRecordsRequestError(response.status);
  window.location.assign(data.url);
}

export async function downloadSharedDocumentFile(
  documentId: string,
): Promise<void> {
  const { data, response } = await browserApi.GET(
    "/api/v1/shared-with-me/documents/{documentId}/download",
    { params: { path: { documentId } }, cache: "no-store" },
  );
  if (!data) throw new SharedRecordsRequestError(response.status);
  window.location.assign(data.url);
}
