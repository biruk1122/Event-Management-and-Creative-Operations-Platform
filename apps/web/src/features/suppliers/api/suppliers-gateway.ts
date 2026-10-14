import { browserApi } from "@/lib/api/browser";
import { readCsrfToken } from "@/lib/api/csrf";
import { fieldErrorsOf, isProblemDetails } from "@/lib/api/problem-details";

import type {
  CreateSupplier,
  GetSupplier,
  SupplierFieldValues,
  UpdateSupplier,
} from "../lib/suppliers-outcome";
import type {
  PaginatedSuppliers,
  SupplierStatus,
} from "../lib/suppliers-types";

/** Thrown by the read helpers when the API does not return a usable body. */
export class SuppliersRequestError extends Error {
  constructor(readonly status: number) {
    super(
      status === 401
        ? "Your session expired. Sign in again."
        : status === 403
          ? "You do not have access to this area."
          : status === 404
            ? "This supplier no longer exists. Refresh the list."
            : "We could not load the data. Try again.",
    );
    this.name = "SuppliersRequestError";
  }
}

function headers() {
  const token = readCsrfToken();
  return token ? { "x-csrf-token": token } : {};
}

function fieldsBody(values: Partial<SupplierFieldValues>) {
  return {
    ...(values.name !== undefined ? { name: values.name.trim() } : {}),
    ...(values.category !== undefined
      ? { category: values.category.trim() || undefined }
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
    ...(values.notes !== undefined
      ? { notes: values.notes.trim() || undefined }
      : {}),
  };
}

function fieldErrors<K extends keyof SupplierFieldValues>(
  error: unknown,
  keys: readonly K[],
): Partial<Record<K, string>> {
  if (!isProblemDetails(error) || error.code !== "VALIDATION_ERROR") return {};
  const fields = fieldErrorsOf(error);
  const result: Partial<Record<K, string>> = {};
  for (const key of keys) if (fields[key]) result[key] = fields[key];
  return result;
}

const FIELD_KEYS: readonly (keyof SupplierFieldValues)[] = [
  "name",
  "category",
  "contactName",
  "contactEmail",
  "contactPhone",
  "notes",
];

export interface ListSuppliersParams {
  status?: SupplierStatus | null;
  page?: number;
  pageSize?: number;
}

export async function listSuppliers(
  params: ListSuppliersParams,
  signal?: AbortSignal,
): Promise<PaginatedSuppliers> {
  const query: Record<string, string | number> = {
    page: params.page ?? 1,
    pageSize: params.pageSize ?? 25,
  };
  if (params.status) query.status = params.status;

  const { data, response } = await browserApi.GET("/api/v1/suppliers", {
    params: { query: query as never },
    ...(signal ? { signal } : {}),
    cache: "no-store",
  });
  if (!data) throw new SuppliersRequestError(response.status);
  return data;
}

/** Resolves `null` for any non-OK response so the detail dialog shows its error state. */
export const getSupplier: GetSupplier = async (id) => {
  const { data } = await browserApi.GET("/api/v1/suppliers/{id}", {
    params: { path: { id } },
    cache: "no-store",
  });
  return data ?? null;
};

export const createSupplier: CreateSupplier = async (values) => {
  try {
    const { data, error, response } = await browserApi.POST(
      "/api/v1/suppliers",
      { body: fieldsBody(values) as never, headers: headers() },
    );
    if (data) return { status: "success", supplier: data };
    if (isProblemDetails(error) && error.code === "SUPPLIER_DUPLICATE")
      return { status: "duplicate" };
    if (isProblemDetails(error) && error.code === "VALIDATION_ERROR") {
      const errors = fieldErrors(error, FIELD_KEYS);
      if (Object.keys(errors).length > 0)
        return { status: "field_errors", fieldErrors: errors };
    }
    if (response.status === 401 || response.status === 403)
      return { status: "permission_denied" };
    return { status: "unexpected" };
  } catch {
    return { status: "unexpected" };
  }
};

export const updateSupplier: UpdateSupplier = async (id, values) => {
  try {
    const { data, error, response } = await browserApi.PATCH(
      "/api/v1/suppliers/{id}",
      {
        params: { path: { id } },
        body: {
          ...fieldsBody(values),
          ...(values.status ? { status: values.status } : {}),
        } as never,
        headers: headers(),
      },
    );
    if (data) return { status: "success", supplier: data };
    if (isProblemDetails(error)) {
      if (error.code === "SUPPLIER_NOT_FOUND") return { status: "not_found" };
      if (error.code === "SUPPLIER_DUPLICATE") return { status: "duplicate" };
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
