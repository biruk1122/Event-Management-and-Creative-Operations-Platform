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

/** EVE-233: a set value, or `null` to clear it, for the newer nullable
 * fields. Left out entirely when the form does not carry the field. */
function textOrClear(key: string, value: string | undefined) {
  if (value === undefined) return {};
  return { [key]: value.trim() ? value.trim() : null };
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
    ...textOrClear("partnershipName", values.partnershipName),
    ...textOrClear("partnershipType", values.partnershipType),
    ...textOrClear("campaignId", values.campaignId),
    ...textOrClear("agreementDetails", values.agreementDetails),
    ...textOrClear("agreementStartOn", values.agreementStartOn),
    ...textOrClear("agreementEndOn", values.agreementEndOn),
    ...textOrClear("agreedValueCurrency", values.agreedValueCurrency),
    ...(values.agreedValueAmount !== undefined
      ? {
          agreedValueAmount: values.agreedValueAmount.trim()
            ? Number(values.agreedValueAmount)
            : null,
        }
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
  "partnershipName",
  "partnershipType",
  "campaignId",
  "agreementDetails",
  "agreementStartOn",
  "agreementEndOn",
  "agreedValueAmount",
  "agreedValueCurrency",
];

/** EVE-233: the API's agreement rules, shown on the field they concern. */
function agreementFieldErrors(
  code: string,
): Partial<Record<keyof PartnerFieldValues, string>> | null {
  if (code === "PARTNER_AGREEMENT_DATES_INVALID")
    return { agreementEndOn: "The agreement cannot end before it starts." };
  if (code === "PARTNER_AGREED_VALUE_INCOMPLETE")
    return {
      agreedValueCurrency: "Give the agreed value and its currency together.",
    };
  return null;
}

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
        // A new partner has nothing to clear, so empty fields are left out.
        body: Object.fromEntries(
          Object.entries(fieldsBody(values)).filter(
            ([, value]) => value !== null,
          ),
        ) as never,
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
      const agreement = agreementFieldErrors(error.code);
      if (agreement) return { status: "field_errors", fieldErrors: agreement };
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
      const agreement = agreementFieldErrors(error.code);
      if (agreement) return { status: "field_errors", fieldErrors: agreement };
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

/** EVE-233: a partnership's documents. */
export async function listPartnerFiles(id: string, signal?: AbortSignal) {
  const { data, response } = await browserApi.GET(
    "/api/v1/partners/{partnerId}/files",
    {
      params: {
        path: { partnerId: id },
        query: { page: 1, pageSize: 100 } as never,
      },
      ...(signal ? { signal } : {}),
      cache: "no-store",
    },
  );
  if (!data) throw new PartnersRequestError(response.status);
  return data;
}

export async function uploadPartnerFile(id: string, file: File) {
  const intent = await browserApi.POST(
    "/api/v1/partners/{partnerId}/files/upload-intents",
    {
      params: { path: { partnerId: id } },
      body: {
        filename: file.name,
        mediaType: file.type as never,
        sizeBytes: file.size,
      },
      headers: headers(),
    },
  );
  if (!intent.data) throw new PartnersRequestError(intent.response.status);
  const form = new FormData();
  Object.entries(intent.data.upload.fields).forEach(([key, value]) =>
    form.append(key, value),
  );
  form.append("file", file);
  const uploaded = await fetch(intent.data.upload.url, {
    method: "POST",
    body: form,
  });
  if (!uploaded.ok) throw new PartnersRequestError(uploaded.status);
  const finalized = await browserApi.POST(
    "/api/v1/partners/{partnerId}/files/{fileId}/finalize",
    {
      params: { path: { partnerId: id, fileId: intent.data.id } },
      headers: headers(),
    },
  );
  if (!finalized.data)
    throw new PartnersRequestError(finalized.response.status);
  return finalized.data;
}

export async function downloadPartnerFile(id: string, fileId: string) {
  const { data, response } = await browserApi.GET(
    "/api/v1/partners/{partnerId}/files/{fileId}/download",
    { params: { path: { partnerId: id, fileId } }, cache: "no-store" },
  );
  if (!data) throw new PartnersRequestError(response.status);
  window.location.assign(data.url);
}
