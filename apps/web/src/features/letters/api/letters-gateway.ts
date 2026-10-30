import type { operations } from "@event-platform/api-client";

import { browserApi } from "@/lib/api/browser";
import { readCsrfToken } from "@/lib/api/csrf";
import {
  isProblemDetails,
  type ProblemDetails,
} from "@/lib/api/problem-details";

import type {
  AddRemark,
  CreateLetter,
  CreateLetterValues,
  DeleteLetter,
  GetLetter,
  ListRemarks,
  SaveLetterOutcome,
  UpdateLetter,
  UpdateLetterValues,
} from "../lib/letters-outcome";
import type {
  Letter,
  LetterCategory,
  LetterDirection,
  LetterOptions,
  PaginatedLetters,
} from "../lib/letters-types";
import type { EventFile } from "@/features/files/lib/file-types";

export class LettersRequestError extends Error {
  constructor(readonly status: number) {
    super(
      status === 401
        ? "Your session expired. Sign in again."
        : status === 403
          ? "You do not have access to this area."
          : status === 404
            ? "This letter no longer exists. Refresh the list."
            : "We could not load the data. Try again.",
    );
    this.name = "LettersRequestError";
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

function saveFailure(error: unknown, status: number): SaveLetterOutcome {
  if (isProblemDetails(error)) {
    if (error.code === "LETTER_NOT_FOUND") return { status: "not_found" };
    if (error.code === "LETTER_ASSIGNMENT_INVALID") {
      return { status: "assignment_invalid", detail: error.detail };
    }
    if (error.code === "VALIDATION_ERROR") {
      const fields = fieldErrorsFrom(error);
      const keys: (keyof CreateLetterValues)[] = [
        "direction",
        "category",
        "date",
        "projectId",
        "subject",
        "fromParty",
        "toParty",
        "senderReferenceNumber",
        "shortDescription",
        "remark",
      ];
      const fieldErrors: Partial<Record<keyof CreateLetterValues, string>> = {};
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

export interface ListLettersParams {
  direction?: LetterDirection | null;
  category?: LetterCategory | null;
  projectId?: string | null;
  search?: string;
  sort?: "date" | "referenceNumber" | "subject";
  order?: "asc" | "desc";
  page?: number;
  pageSize?: number;
}

type ListQuery = NonNullable<
  operations["Letters_list_v1"]["parameters"]["query"]
>;

export async function listLetters(
  params: ListLettersParams,
  signal?: AbortSignal,
): Promise<PaginatedLetters> {
  const query: Record<string, string | number> = {
    page: params.page ?? 1,
    pageSize: params.pageSize ?? 20,
    sort: params.sort ?? "date",
    order: params.order ?? "desc",
  };
  if (params.direction) query.direction = params.direction;
  if (params.category) query.category = params.category;
  if (params.projectId) query.projectId = params.projectId;
  if (params.search?.trim()) query.search = params.search.trim();

  const { data, response } = await browserApi.GET("/api/v1/letters", {
    params: { query: query as unknown as ListQuery },
    ...(signal ? { signal } : {}),
    cache: "no-store",
  });
  if (!data) throw new LettersRequestError(response.status);
  return data;
}

export const getLetter: GetLetter = async (id, signal?: AbortSignal) => {
  const { data, response } = await browserApi.GET("/api/v1/letters/{id}", {
    params: { path: { id } },
    ...(signal ? { signal } : {}),
    cache: "no-store",
  });
  if (!data && response.status !== 404)
    throw new LettersRequestError(response.status);
  return data ?? null;
};

export async function getLetterOptions(
  signal?: AbortSignal,
): Promise<LetterOptions> {
  const { data, response } = await browserApi.GET("/api/v1/letters/options", {
    ...(signal ? { signal } : {}),
    cache: "no-store",
  });
  if (!data) throw new LettersRequestError(response.status);
  return data;
}

export async function getReferencePreview(
  category: LetterCategory,
  signal?: AbortSignal,
): Promise<string> {
  const { data } = await browserApi.GET("/api/v1/letters/reference-preview", {
    params: { query: { category } },
    ...(signal ? { signal } : {}),
    cache: "no-store",
  });
  return data?.referenceNumber ?? "";
}

function toCreateBody(values: CreateLetterValues) {
  return {
    direction: values.direction,
    category: values.category,
    date: values.date,
    subject: values.subject.trim(),
    ...(values.projectId ? { projectId: values.projectId } : {}),
    ...(values.direction === "INCOMING" && values.fromParty.trim()
      ? { fromParty: values.fromParty.trim() }
      : {}),
    ...(values.direction === "OUTGOING" && values.toParty.trim()
      ? { toParty: values.toParty.trim() }
      : {}),
    ...(values.direction === "INCOMING" && values.senderReferenceNumber.trim()
      ? { senderReferenceNumber: values.senderReferenceNumber.trim() }
      : {}),
    ...(values.shortDescription.trim()
      ? { shortDescription: values.shortDescription.trim() }
      : {}),
    ...(values.remark.trim() ? { remark: values.remark.trim() } : {}),
  };
}

function toUpdateBody(values: Partial<UpdateLetterValues>) {
  const body: Record<string, unknown> = {};
  if (values.date !== undefined) body.date = values.date;
  if (values.projectId !== undefined) body.projectId = values.projectId;
  if (values.subject !== undefined) body.subject = values.subject.trim();
  if (values.fromParty !== undefined) body.fromParty = values.fromParty.trim();
  if (values.toParty !== undefined) body.toParty = values.toParty.trim();
  if (values.senderReferenceNumber !== undefined)
    body.senderReferenceNumber = values.senderReferenceNumber.trim() || null;
  if (values.shortDescription !== undefined)
    body.shortDescription = values.shortDescription.trim() || null;
  if (values.remark !== undefined) body.remark = values.remark.trim() || null;
  return body;
}

export const createLetter: CreateLetter = async (values) => {
  try {
    const { data, error, response } = await browserApi.POST("/api/v1/letters", {
      body: toCreateBody(values),
      headers: headers(),
    });
    return data
      ? { status: "success", letter: data }
      : saveFailure(error, response.status);
  } catch {
    return { status: "unexpected" };
  }
};

export const updateLetter: UpdateLetter = async (id, values) => {
  try {
    const { data, error, response } = await browserApi.PATCH(
      "/api/v1/letters/{id}",
      {
        params: { path: { id } },
        body: toUpdateBody(values),
        headers: headers(),
      },
    );
    return data
      ? { status: "success", letter: data }
      : saveFailure(error, response.status);
  } catch {
    return { status: "unexpected" };
  }
};

export const deleteLetter: DeleteLetter = async (id) => {
  try {
    const { error, response } = await browserApi.DELETE(
      "/api/v1/letters/{id}",
      { params: { path: { id } }, headers: headers() },
    );
    if (response.status === 204 || response.ok) return { status: "success" };
    if (isProblemDetails(error) && error.code === "LETTER_NOT_FOUND") {
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

export const listRemarks: ListRemarks = async (letterId) => {
  const { data } = await browserApi.GET("/api/v1/letters/{id}/remarks", {
    params: { path: { id: letterId } },
    cache: "no-store",
  });
  return data ?? null;
};

export const addRemark: AddRemark = async (letterId, body) => {
  try {
    const { data, error, response } = await browserApi.POST(
      "/api/v1/letters/{id}/remarks",
      {
        params: { path: { id: letterId } },
        body: { body },
        headers: headers(),
      },
    );
    if (data) return { status: "success", remark: data };
    if (isProblemDetails(error) && error.code === "LETTER_NOT_FOUND") {
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

export async function listLetterFiles(
  letterId: string,
  signal?: AbortSignal,
): Promise<EventFile[]> {
  const files: EventFile[] = [];
  let page = 1;
  let total = 0;
  do {
    const { data, response } = await browserApi.GET(
      "/api/v1/letters/{letterId}/files",
      {
        params: { path: { letterId }, query: { page, pageSize: 100 } },
        ...(signal ? { signal } : {}),
        cache: "no-store",
      },
    );
    if (!data) throw new LettersRequestError(response.status);
    files.push(...(data.items as unknown as EventFile[]));
    total = data.total;
    page += 1;
    if (data.items.length === 0) break;
  } while (files.length < total);
  return files;
}

export async function uploadLetterFile(
  letterId: string,
  file: File,
): Promise<EventFile> {
  const { data: intent, response } = await browserApi.POST(
    "/api/v1/letters/{letterId}/files/upload-intents",
    {
      params: { path: { letterId } },
      body: {
        filename: file.name,
        mediaType: file.type,
        sizeBytes: file.size,
      } as never,
      headers: headers(),
    },
  );
  if (!intent) throw new LettersRequestError(response.status);
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
    "/api/v1/letters/{letterId}/files/{fileId}/finalize",
    { params: { path: { letterId, fileId: intent.id } }, headers: headers() },
  );
  if (!finalized.data) throw new LettersRequestError(finalized.response.status);
  return finalized.data as unknown as EventFile;
}

export async function downloadLetterFile(
  letterId: string,
  fileId: string,
): Promise<void> {
  const url = await getLetterFileUrl(letterId, fileId);
  window.location.assign(url);
}

export async function getLetterFileUrl(
  letterId: string,
  fileId: string,
): Promise<string> {
  const { data, response } = await browserApi.GET(
    "/api/v1/letters/{letterId}/files/{fileId}/download",
    { params: { path: { letterId, fileId } }, cache: "no-store" },
  );
  if (!data) throw new LettersRequestError(response.status);
  return data.url;
}

export type { Letter };
