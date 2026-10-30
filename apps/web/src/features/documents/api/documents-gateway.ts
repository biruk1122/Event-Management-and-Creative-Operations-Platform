import type { operations } from "@event-platform/api-client";

import { browserApi } from "@/lib/api/browser";
import { readCsrfToken } from "@/lib/api/csrf";
import {
  isProblemDetails,
  type ProblemDetails,
} from "@/lib/api/problem-details";

import type {
  CreateDocument,
  CreateDocumentValues,
  DeleteDocument,
  GetDocument,
  SaveDocumentOutcome,
  UpdateDocument,
  UpdateDocumentValues,
} from "../lib/documents-outcome";
import type {
  DocumentOptions,
  DocumentRecord,
  DocumentType,
  PaginatedDocuments,
} from "../lib/documents-types";

export class DocumentsRequestError extends Error {
  constructor(readonly status: number) {
    super(
      status === 401
        ? "Your session expired. Sign in again."
        : status === 403
          ? "You do not have access to this area."
          : status === 404
            ? "This document no longer exists. Refresh the list."
            : "We could not load the data. Try again.",
    );
    this.name = "DocumentsRequestError";
  }
}

function headers() {
  const token = readCsrfToken();
  return token ? { "x-csrf-token": token } : {};
}

function fieldErrorsFrom(problem: ProblemDetails): Record<string, string> {
  const raw = (problem as { errors?: unknown }).errors;
  const flattened: Record<string, string> = {};
  if (!Array.isArray(raw)) return flattened;
  for (const entry of raw) {
    if (typeof entry !== "object" || entry === null) continue;
    const candidate = entry as { field?: unknown; messages?: unknown };
    if (typeof candidate.field !== "string") continue;
    const message =
      Array.isArray(candidate.messages) &&
      typeof candidate.messages[0] === "string"
        ? candidate.messages[0]
        : undefined;
    if (message) flattened[candidate.field] = message;
  }
  return flattened;
}

function saveFailure(error: unknown, status: number): SaveDocumentOutcome {
  if (isProblemDetails(error)) {
    if (error.code === "DOCUMENT_NOT_FOUND") return { status: "not_found" };
    if (error.code === "DOCUMENT_ASSIGNMENT_INVALID") {
      return { status: "assignment_invalid", detail: error.detail };
    }
    if (error.code === "VALIDATION_ERROR") {
      const fields = fieldErrorsFrom(error);
      const keys: (keyof CreateDocumentValues)[] = [
        "displayName",
        "documentType",
        "projectId",
        "description",
      ];
      const fieldErrors: Partial<Record<keyof CreateDocumentValues, string>> =
        {};
      for (const key of keys) {
        if (fields[key]) fieldErrors[key] = fields[key];
      }
      if (Object.keys(fieldErrors).length > 0) {
        return { status: "field_errors", fieldErrors };
      }
    }
  }
  if (status === 401 || status === 403) return { status: "permission_denied" };
  return { status: "unexpected" };
}

export interface ListDocumentsParams {
  documentType?: DocumentType | null;
  projectId?: string | null;
  search?: string;
  sort?: "uploadedAt" | "displayName" | "createdAt";
  order?: "asc" | "desc";
  page?: number;
  pageSize?: number;
}

type ListQuery = NonNullable<
  operations["Documents_list_v1"]["parameters"]["query"]
>;

export async function listDocuments(
  params: ListDocumentsParams,
  signal?: AbortSignal,
): Promise<PaginatedDocuments> {
  const query: Record<string, string | number> = {
    page: params.page ?? 1,
    pageSize: params.pageSize ?? 20,
    sort: params.sort ?? "createdAt",
    order: params.order ?? "desc",
  };
  if (params.documentType) query.documentType = params.documentType;
  if (params.projectId) query.projectId = params.projectId;
  if (params.search?.trim()) query.search = params.search.trim();

  const { data, response } = await browserApi.GET("/api/v1/documents", {
    params: { query: query as unknown as ListQuery },
    ...(signal ? { signal } : {}),
    cache: "no-store",
  });
  if (!data) throw new DocumentsRequestError(response.status);
  return data;
}

export const getDocument: GetDocument = async (id, signal?: AbortSignal) => {
  const { data } = await browserApi.GET("/api/v1/documents/{id}", {
    params: { path: { id } },
    ...(signal ? { signal } : {}),
    cache: "no-store",
  });
  return data ?? null;
};

export async function getDocumentOptions(
  signal?: AbortSignal,
): Promise<DocumentOptions> {
  const { data, response } = await browserApi.GET("/api/v1/documents/options", {
    ...(signal ? { signal } : {}),
    cache: "no-store",
  });
  if (!data) throw new DocumentsRequestError(response.status);
  return data;
}

function toCreateBody(values: CreateDocumentValues) {
  return {
    displayName: values.displayName.trim(),
    documentType: values.documentType,
    ...(values.projectId ? { projectId: values.projectId } : {}),
    ...(values.description.trim()
      ? { description: values.description.trim() }
      : {}),
  };
}

function toUpdateBody(values: Partial<UpdateDocumentValues>) {
  const body: Record<string, unknown> = {};
  if (values.displayName !== undefined)
    body.displayName = values.displayName.trim();
  if (values.documentType !== undefined)
    body.documentType = values.documentType;
  if (values.projectId !== undefined) body.projectId = values.projectId;
  if (values.description !== undefined)
    body.description = values.description.trim() || null;
  return body;
}

export const createDocument: CreateDocument = async (values) => {
  try {
    const { data, error, response } = await browserApi.POST(
      "/api/v1/documents",
      { body: toCreateBody(values), headers: headers() },
    );
    return data
      ? { status: "success", document: data }
      : saveFailure(error, response.status);
  } catch {
    return { status: "unexpected" };
  }
};

export const updateDocument: UpdateDocument = async (id, values) => {
  try {
    const { data, error, response } = await browserApi.PATCH(
      "/api/v1/documents/{id}",
      {
        params: { path: { id } },
        body: toUpdateBody(values),
        headers: headers(),
      },
    );
    return data
      ? { status: "success", document: data }
      : saveFailure(error, response.status);
  } catch {
    return { status: "unexpected" };
  }
};

export const deleteDocument: DeleteDocument = async (id) => {
  try {
    const { error, response } = await browserApi.DELETE(
      "/api/v1/documents/{id}",
      { params: { path: { id } }, headers: headers() },
    );
    if (response.status === 204 || response.ok) return { status: "success" };
    if (isProblemDetails(error) && error.code === "DOCUMENT_NOT_FOUND") {
      return { status: "not_found" };
    }
    if (response.status === 401 || response.status === 403) {
      return { status: "permission_denied" };
    }
    return { status: "unexpected" };
  } catch {
    return { status: "unexpected" };
  }
};

export async function uploadDocumentFile(
  documentId: string,
  file: File,
): Promise<DocumentRecord> {
  const { data: intent, response } = await browserApi.POST(
    "/api/v1/documents/{documentId}/files/upload-intents",
    {
      params: { path: { documentId } },
      body: {
        filename: file.name,
        mediaType: file.type,
        sizeBytes: file.size,
      } as never,
      headers: headers(),
    },
  );
  if (!intent) throw new DocumentsRequestError(response.status);
  const form = new FormData();
  Object.entries(intent.upload.fields).forEach(([key, value]) =>
    form.append(key, value),
  );
  form.append("file", file);
  const uploaded = await fetch(intent.upload.url, {
    method: "POST",
    body: form,
  });
  if (!uploaded.ok) {
    throw new Error(
      "The file could not be uploaded. Your selection is still available to retry.",
    );
  }
  const finalized = await browserApi.POST(
    "/api/v1/documents/{documentId}/files/{fileId}/finalize",
    {
      params: { path: { documentId, fileId: intent.id } },
      headers: headers(),
    },
  );
  if (!finalized.data)
    throw new DocumentsRequestError(finalized.response.status);
  // The document itself (not just the file) now carries availability/size/
  // filename, so the caller re-fetches it rather than reading this response.
  const refreshed = await getDocument(documentId);
  if (!refreshed) throw new DocumentsRequestError(404);
  return refreshed;
}

export async function downloadDocumentFile(documentId: string): Promise<void> {
  const document = await getDocument(documentId);
  if (!document?.fileAvailable || !document.fileId) {
    throw new DocumentsRequestError(404);
  }
  const { data, response } = await browserApi.GET(
    "/api/v1/documents/{documentId}/files/{fileId}/download",
    {
      params: { path: { documentId, fileId: document.fileId } },
      cache: "no-store",
    },
  );
  if (!data) throw new DocumentsRequestError(response.status);
  window.location.assign(data.url);
}
