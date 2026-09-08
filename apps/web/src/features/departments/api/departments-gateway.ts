import type { operations } from "@event-platform/api-client";

import { browserApi } from "@/lib/api/browser";
import { readCsrfToken } from "@/lib/api/csrf";
import {
  isProblemDetails,
  type ProblemDetails,
} from "@/lib/api/problem-details";

import type {
  AssignManager,
  AssignManagerOutcome,
  CreateDepartment,
  CreateDepartmentValues,
  DeactivateDepartment,
  DeactivateDepartmentOutcome,
  DeleteDepartment,
  DeleteDepartmentOutcome,
  DepartmentProfileValues,
  ReactivateDepartment,
  ReactivateDepartmentOutcome,
  SaveDepartmentOutcome,
  UpdateDepartment,
} from "../lib/departments-outcome";
import type {
  AssignableUser,
  Department,
  DepartmentActivity,
  PaginatedDepartments,
} from "../lib/departments-types";

/** Thrown by the read helpers when the API does not return a usable body. */
export class DepartmentsRequestError extends Error {
  constructor(readonly status: number) {
    super(
      status === 401
        ? "Your session expired. Sign in again."
        : status === 403
          ? "You do not have access to this area."
          : status === 404
            ? "This department no longer exists. Refresh the list."
            : "We could not load the data. Try again.",
    );
    this.name = "DepartmentsRequestError";
  }
}

function headers() {
  const token = readCsrfToken();
  return token ? { "x-csrf-token": token } : {};
}

/**
 * The API returns validation details as `[{ field, messages }]`
 * (see `createValidationException`). Flatten to `field -> first message`.
 */
function fieldErrorsFrom(problem: ProblemDetails): Record<string, string> {
  const raw = (problem as { errors?: unknown }).errors;
  const flattened: Record<string, string> = {};
  if (!Array.isArray(raw)) {
    return flattened;
  }
  for (const entry of raw) {
    if (typeof entry !== "object" || entry === null) {
      continue;
    }
    const candidate = entry as { field?: unknown; messages?: unknown };
    if (typeof candidate.field !== "string") {
      continue;
    }
    const message =
      Array.isArray(candidate.messages) &&
      typeof candidate.messages[0] === "string"
        ? candidate.messages[0]
        : undefined;
    if (message) {
      flattened[candidate.field] = message;
    }
  }
  return flattened;
}

function saveFailure(error: unknown, status: number): SaveDepartmentOutcome {
  if (isProblemDetails(error)) {
    if (error.code === "DEPARTMENT_NAME_CONFLICT")
      return { status: "name_conflict" };
    if (error.code === "USER_NOT_FOUND") return { status: "manager_not_found" };
    if (error.code === "DEPARTMENT_NOT_FOUND") return { status: "not_found" };
    if (error.code === "VALIDATION_ERROR") {
      const fields = fieldErrorsFrom(error);
      const keys: (keyof CreateDepartmentValues)[] = [
        "name",
        "description",
        "managerId",
      ];
      const fieldErrors: Partial<Record<keyof CreateDepartmentValues, string>> =
        {};
      for (const key of keys) {
        if (fields[key]) {
          fieldErrors[key] = fields[key];
        }
      }
      if (Object.keys(fieldErrors).length > 0) {
        return { status: "field_errors", fieldErrors };
      }
    }
  }
  if (status === 401 || status === 403) return { status: "permission_denied" };
  return { status: "unexpected" };
}

function assignManagerFailure(
  error: unknown,
  status: number,
): Exclude<AssignManagerOutcome, { status: "success" }> {
  if (isProblemDetails(error)) {
    if (error.code === "USER_NOT_FOUND") return { status: "manager_not_found" };
    if (error.code === "DEPARTMENT_NOT_FOUND") return { status: "not_found" };
  }
  if (status === 401 || status === 403) return { status: "permission_denied" };
  return { status: "unexpected" };
}

function deactivateFailure(
  error: unknown,
  status: number,
): Exclude<DeactivateDepartmentOutcome, { status: "success" }> {
  if (isProblemDetails(error)) {
    if (error.code === "DEPARTMENT_ALREADY_INACTIVE")
      return { status: "already_inactive" };
    if (error.code === "DEPARTMENT_NOT_FOUND") return { status: "not_found" };
  }
  if (status === 401 || status === 403) return { status: "permission_denied" };
  return { status: "unexpected" };
}

function reactivateFailure(
  error: unknown,
  status: number,
): Exclude<ReactivateDepartmentOutcome, { status: "success" }> {
  if (isProblemDetails(error)) {
    if (error.code === "DEPARTMENT_ALREADY_ACTIVE")
      return { status: "already_active" };
    if (error.code === "DEPARTMENT_NOT_FOUND") return { status: "not_found" };
  }
  if (status === 401 || status === 403) return { status: "permission_denied" };
  return { status: "unexpected" };
}

function deleteFailure(
  error: unknown,
  status: number,
): Exclude<DeleteDepartmentOutcome, { status: "success" }> {
  if (isProblemDetails(error)) {
    if (error.code === "DEPARTMENT_IN_USE") return { status: "in_use" };
    if (error.code === "DEPARTMENT_NOT_FOUND") return { status: "not_found" };
  }
  if (status === 401 || status === 403) return { status: "permission_denied" };
  return { status: "unexpected" };
}

export interface ListDepartmentsParams {
  status?: DepartmentActivity | null;
  search?: string;
  page?: number;
  pageSize?: number;
}

type ListQuery = NonNullable<
  operations["Departments_list_v1"]["parameters"]["query"]
>;

export async function listDepartments(
  params: ListDepartmentsParams,
  signal?: AbortSignal,
): Promise<PaginatedDepartments> {
  const query: Record<string, string | number> = {
    page: params.page ?? 1,
    pageSize: params.pageSize ?? 25,
  };
  if (params.status) query.status = params.status;
  if (params.search?.trim()) query.search = params.search.trim();

  const { data, response } = await browserApi.GET("/api/v1/departments", {
    // The generated types model `page`/`pageSize` as an empty object because
    // the API decorates them without an explicit `type: Number`; they are
    // plain integers on the wire.
    params: { query: query as unknown as ListQuery },
    ...(signal ? { signal } : {}),
    cache: "no-store",
  });
  if (!data) throw new DepartmentsRequestError(response.status);
  return data;
}

/** Resolves `null` for any non-OK response so the detail dialog can show its
 * generic error state instead of leaving the promise unhandled. */
export async function getDepartment(
  id: string,
  signal?: AbortSignal,
): Promise<Department | null> {
  const { data } = await browserApi.GET("/api/v1/departments/{id}", {
    params: { path: { id } },
    ...(signal ? { signal } : {}),
    cache: "no-store",
  });
  return data ?? null;
}

/**
 * Users the manager control can offer. The department API has no dedicated
 * route, so this reads the first page of `GET /api/v1/users`. Resolves `[]`
 * when the caller cannot read users.
 */
export async function listAssignableManagers(
  signal?: AbortSignal,
): Promise<AssignableUser[]> {
  const { data } = await browserApi.GET("/api/v1/users", {
    params: { query: { pageSize: 100 } as never },
    ...(signal ? { signal } : {}),
    cache: "no-store",
  });
  return (data?.items ?? []).map((user) => ({
    id: user.id,
    email: user.email,
    firstName: user.firstName,
    lastName: user.lastName,
  }));
}

function toCreateBody(values: CreateDepartmentValues) {
  return {
    name: values.name.trim(),
    ...(values.description.trim()
      ? { description: values.description.trim() }
      : {}),
    ...(values.managerId ? { managerId: values.managerId } : {}),
  };
}

function toUpdateBody(values: Partial<DepartmentProfileValues>) {
  const body: Record<string, string> = {};
  for (const [key, value] of Object.entries(values)) {
    if (typeof value === "string" && value.trim() !== "") {
      body[key] = value.trim();
    }
  }
  return body;
}

export const createDepartment: CreateDepartment = async (values) => {
  try {
    const { data, error, response } = await browserApi.POST(
      "/api/v1/departments",
      { body: toCreateBody(values), headers: headers() },
    );
    return data
      ? { status: "success", department: data }
      : saveFailure(error, response.status);
  } catch {
    return { status: "unexpected" };
  }
};

export const updateDepartment: UpdateDepartment = async (id, values) => {
  try {
    const { data, error, response } = await browserApi.PATCH(
      "/api/v1/departments/{id}",
      {
        params: { path: { id } },
        body: toUpdateBody(values),
        headers: headers(),
      },
    );
    return data
      ? { status: "success", department: data }
      : saveFailure(error, response.status);
  } catch {
    return { status: "unexpected" };
  }
};

export const assignDepartmentManager: AssignManager = async (id, managerId) => {
  try {
    const { data, error, response } = await browserApi.PUT(
      "/api/v1/departments/{id}/manager",
      { params: { path: { id } }, body: { managerId }, headers: headers() },
    );
    return data
      ? { status: "success", department: data }
      : assignManagerFailure(error, response.status);
  } catch {
    return { status: "unexpected" };
  }
};

export const deactivateDepartment: DeactivateDepartment = async (id) => {
  try {
    const { data, error, response } = await browserApi.POST(
      "/api/v1/departments/{id}/deactivate",
      { params: { path: { id } }, headers: headers() },
    );
    return data
      ? { status: "success", department: data }
      : deactivateFailure(error, response.status);
  } catch {
    return { status: "unexpected" };
  }
};

export const reactivateDepartment: ReactivateDepartment = async (id) => {
  try {
    const { data, error, response } = await browserApi.POST(
      "/api/v1/departments/{id}/reactivate",
      { params: { path: { id } }, headers: headers() },
    );
    return data
      ? { status: "success", department: data }
      : reactivateFailure(error, response.status);
  } catch {
    return { status: "unexpected" };
  }
};

export const deleteDepartment: DeleteDepartment = async (id) => {
  try {
    const { error, response } = await browserApi.DELETE(
      "/api/v1/departments/{id}",
      { params: { path: { id } }, headers: headers() },
    );
    if (response.ok) return { status: "success" };
    return deleteFailure(error, response.status);
  } catch {
    return { status: "unexpected" };
  }
};
