import { browserApi } from "@/lib/api/browser";
import { readCsrfToken } from "@/lib/api/csrf";
import {
  isProblemDetails,
  type ProblemDetails,
} from "@/lib/api/problem-details";

import type {
  Share,
  ShareRecipientOption,
  ShareScope,
} from "../lib/sharing-types";

export class SharingRequestError extends Error {
  constructor(readonly status: number) {
    super(
      status === 401
        ? "Your session expired. Sign in again."
        : status === 403
          ? "You do not have access to this area."
          : status === 404
            ? "This share no longer exists. Refresh the list."
            : status === 409
              ? "This is already actively shared with that audience."
              : "We could not load the data. Try again.",
    );
    this.name = "SharingRequestError";
  }
}

function headers() {
  const token = readCsrfToken();
  return token ? { "x-csrf-token": token } : {};
}

export interface CreateShareValues {
  recipientId: string | null;
  allEmployees: boolean;
  scope: ShareScope;
}

export type CreateShareOutcome =
  | { status: "success"; share: Share }
  | { status: "not_found" }
  | { status: "assignment_invalid"; detail?: string }
  | { status: "already_exists" }
  | { status: "permission_denied" }
  | { status: "unexpected" };

function createBody(values: CreateShareValues) {
  return {
    ...(values.recipientId ? { recipientId: values.recipientId } : {}),
    allEmployees: values.allEmployees,
    scope: values.scope,
  };
}

function createFailure(error: unknown, status: number): CreateShareOutcome {
  if (isProblemDetails(error)) {
    if (
      error.code === "LETTER_NOT_FOUND" ||
      error.code === "DOCUMENT_NOT_FOUND"
    ) {
      return { status: "not_found" };
    }
    if (error.code === "SHARE_ASSIGNMENT_INVALID") {
      return { status: "assignment_invalid", detail: error.detail };
    }
    if (error.code === "SHARE_ALREADY_EXISTS") {
      return { status: "already_exists" };
    }
  }
  if (status === 401 || status === 403) return { status: "permission_denied" };
  return { status: "unexpected" };
}

export async function listLetterShares(
  letterId: string,
  signal?: AbortSignal,
): Promise<Share[]> {
  const { data, response } = await browserApi.GET(
    "/api/v1/letters/{letterId}/shares",
    {
      params: { path: { letterId } },
      ...(signal ? { signal } : {}),
      cache: "no-store",
    },
  );
  if (!data) throw new SharingRequestError(response.status);
  return data;
}

export async function createLetterShare(
  letterId: string,
  values: CreateShareValues,
): Promise<CreateShareOutcome> {
  try {
    const { data, error, response } = await browserApi.POST(
      "/api/v1/letters/{letterId}/shares",
      {
        params: { path: { letterId } },
        body: createBody(values),
        headers: headers(),
      },
    );
    return data
      ? { status: "success", share: data }
      : createFailure(error, response.status);
  } catch {
    return { status: "unexpected" };
  }
}

export async function listDocumentShares(
  documentId: string,
  signal?: AbortSignal,
): Promise<Share[]> {
  const { data, response } = await browserApi.GET(
    "/api/v1/documents/{documentId}/shares",
    {
      params: { path: { documentId } },
      ...(signal ? { signal } : {}),
      cache: "no-store",
    },
  );
  if (!data) throw new SharingRequestError(response.status);
  return data;
}

export async function createDocumentShare(
  documentId: string,
  values: CreateShareValues,
): Promise<CreateShareOutcome> {
  try {
    const { data, error, response } = await browserApi.POST(
      "/api/v1/documents/{documentId}/shares",
      {
        params: { path: { documentId } },
        body: createBody(values),
        headers: headers(),
      },
    );
    return data
      ? { status: "success", share: data }
      : createFailure(error, response.status);
  } catch {
    return { status: "unexpected" };
  }
}

export type RevokeShareOutcome =
  | { status: "success" }
  | { status: "not_found" }
  | { status: "already_revoked" }
  | { status: "permission_denied" }
  | { status: "unexpected" };

export async function revokeShare(
  shareId: string,
): Promise<RevokeShareOutcome> {
  try {
    const { error, response } = await browserApi.DELETE("/api/v1/shares/{id}", {
      params: { path: { id: shareId } },
      headers: headers(),
    });
    if (response.status === 204 || response.ok) return { status: "success" };
    if (isProblemDetails(error)) {
      if (error.code === "SHARE_NOT_FOUND") return { status: "not_found" };
      if (error.code === "SHARE_ALREADY_REVOKED") {
        return { status: "already_revoked" };
      }
    }
    if (response.status === 401 || response.status === 403) {
      return { status: "permission_denied" };
    }
    return { status: "unexpected" };
  } catch {
    return { status: "unexpected" };
  }
}

export async function searchRecipients(
  search: string,
  signal?: AbortSignal,
): Promise<ShareRecipientOption[]> {
  const { data, response } = await browserApi.GET(
    "/api/v1/sharing/recipients",
    {
      params: { query: search.trim() ? { search: search.trim() } : {} },
      ...(signal ? { signal } : {}),
      cache: "no-store",
    },
  );
  if (!data) throw new SharingRequestError(response.status);
  return data;
}

export type { ProblemDetails };
