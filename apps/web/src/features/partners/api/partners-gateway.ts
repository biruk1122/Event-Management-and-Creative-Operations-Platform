import { browserApi } from "@/lib/api/browser";
import { readCsrfToken } from "@/lib/api/csrf";
import { fieldErrorsOf, isProblemDetails } from "@/lib/api/problem-details";

import type {
  CreatePartner,
  CreatePartnerActivity,
  GetPartner,
  PartnerFieldValues,
  UpdatePartner,
} from "../lib/partners-outcome";
import type {
  PaginatedPartnerActivities,
  PaginatedPartners,
  PartnerStatus,
} from "../lib/partners-types";

/** Thrown by the read helpers when the API does not return a usable body. */
export class PartnersRequestError extends Error {
  constructor(readonly status: number) {
    super(
      status === 401
        ? "Your session expired. Sign in again."
        : status === 403
          ? "You do not have access to this area."
          : status === 404
            ? "This partner no longer exists. Refresh the list."
            : "We could not load the data. Try again.",
    );
    this.name = "PartnersRequestError";
  }
}

function headers() {
  const token = readCsrfToken();
  return token ? { "x-csrf-token": token } : {};
}

function fieldsBody(values: Partial<PartnerFieldValues>) {
  return {
    ...(values.organizationName !== undefined
      ? { organizationName: values.organizationName.trim() }
      : {}),
    ...(values.category !== undefined
      ? { category: values.category.trim() }
      : {}),
    ...(values.contactName !== undefined
      ? { contactName: values.contactName.trim() || undefined }
      : {}),
    ...(values.contactEmail !== undefined
      ? { contactEmail: values.contactEmail.trim() || undefined }
      : {}),
    ...(values.contactPhone !== undefined
      ? { contactPhone: values.contactPhone.trim() || undefined }
      : {}),
    ...(values.proposedContribution !== undefined
      ? {
          proposedContribution: values.proposedContribution.trim() || undefined,
        }
      : {}),
    ...(values.notes !== undefined
      ? { notes: values.notes.trim() || undefined }
      : {}),
    ...(values.followUpAt !== undefined
      ? {
          followUpAt: values.followUpAt
            ? new Date(values.followUpAt).toISOString()
            : undefined,
        }
      : {}),
  };
}

function fieldErrors<K extends keyof PartnerFieldValues>(
  error: unknown,
  keys: readonly K[],
): Partial<Record<K, string>> {
  if (!isProblemDetails(error) || error.code !== "VALIDATION_ERROR") return {};
  const fields = fieldErrorsOf(error);
  const result: Partial<Record<K, string>> = {};
  for (const key of keys) if (fields[key]) result[key] = fields[key];
  return result;
}

const FIELD_KEYS: readonly (keyof PartnerFieldValues)[] = [
  "organizationName",
  "category",
  "contactName",
  "contactEmail",
  "contactPhone",
  "proposedContribution",
  "notes",
  "followUpAt",
];

export interface ListPartnersParams {
  status?: PartnerStatus | null;
  search?: string | null;
  page?: number;
  pageSize?: number;
}

export async function listPartners(
  params: ListPartnersParams,
  signal?: AbortSignal,
): Promise<PaginatedPartners> {
  const query: Record<string, string | number> = {
    page: params.page ?? 1,
    pageSize: params.pageSize ?? 25,
  };
  if (params.status) query.status = params.status;
  if (params.search) query.search = params.search;

  const { data, response } = await browserApi.GET("/api/v1/partners", {
    params: { query: query as never },
    ...(signal ? { signal } : {}),
    cache: "no-store",
  });
  if (!data) throw new PartnersRequestError(response.status);
  return data;
}

/** Resolves `null` for any non-OK response so the detail dialog shows its error state. */
export const getPartner: GetPartner = async (id) => {
  const { data } = await browserApi.GET("/api/v1/partners/{id}", {
    params: { path: { id } },
    cache: "no-store",
  });
  return data ?? null;
};

export const createPartner: CreatePartner = async (values) => {
  try {
    const { data, error, response } = await browserApi.POST(
      "/api/v1/partners",
      {
        body: fieldsBody(values) as never,
        headers: headers(),
      },
    );
    if (data) return { status: "success", partner: data };
    if (isProblemDetails(error)) {
      if (
        error.code === "PARTNER_DEPARTMENT_NOT_FOUND" ||
        error.code === "PARTNER_CAMPAIGN_NOT_FOUND" ||
        error.code === "EVENT_NOT_FOUND"
      )
        return { status: "not_found" };
      if (error.code === "VALIDATION_ERROR") {
        const errors = fieldErrors(error, FIELD_KEYS);
        if (Object.keys(errors).length > 0)
          return { status: "field_errors", fieldErrors: errors };
      }
    }
    if (response.status === 401 || response.status === 403)
      return { status: "permission_denied" };
    return { status: "unexpected" };
  } catch {
    return { status: "unexpected" };
  }
};

export const updatePartner: UpdatePartner = async (id, values) => {
  try {
    const { data, error, response } = await browserApi.PATCH(
      "/api/v1/partners/{id}",
      {
        params: { path: { id } },
        body: {
          ...fieldsBody(values),
          ...(values.status ? { status: values.status } : {}),
          ...(values.ownerId !== undefined ? { ownerId: values.ownerId } : {}),
        } as never,
        headers: headers(),
      },
    );
    if (data) return { status: "success", partner: data };
    if (isProblemDetails(error)) {
      if (error.code === "PARTNER_NOT_FOUND") return { status: "not_found" };
      if (error.code === "PARTNER_OWNER_OUTSIDE_DEPARTMENT")
        return { status: "owner_outside_department" };
      if (error.code === "VALIDATION_ERROR") {
        const errors = fieldErrors(error, FIELD_KEYS);
        if (Object.keys(errors).length > 0)
          return { status: "field_errors", fieldErrors: errors };
      }
    }
    if (response.status === 401 || response.status === 403)
      return { status: "permission_denied" };
    return { status: "unexpected" };
  } catch {
    return { status: "unexpected" };
  }
};

export async function listPartnerActivities(
  id: string,
  page: number,
  signal?: AbortSignal,
): Promise<PaginatedPartnerActivities> {
  const { data, response } = await browserApi.GET(
    "/api/v1/partners/{id}/activities",
    {
      params: { path: { id }, query: { page, pageSize: 25 } as never },
      ...(signal ? { signal } : {}),
      cache: "no-store",
    },
  );
  if (!data) throw new PartnersRequestError(response.status);
  return data;
}

export const createPartnerActivity: CreatePartnerActivity = async (
  id,
  note,
) => {
  try {
    const { data, response } = await browserApi.POST(
      "/api/v1/partners/{id}/activities",
      {
        params: { path: { id } },
        body: { note: note.trim() },
        headers: headers(),
      },
    );
    if (data) return { status: "success", activity: data };
    if (response.status === 401 || response.status === 403)
      return { status: "permission_denied" };
    return { status: "unexpected" };
  } catch {
    return { status: "unexpected" };
  }
};
