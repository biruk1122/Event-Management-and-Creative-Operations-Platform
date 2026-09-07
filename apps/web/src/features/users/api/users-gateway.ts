import type { operations } from "@event-platform/api-client";

import { browserApi } from "@/lib/api/browser";
import { readCsrfToken } from "@/lib/api/csrf";
import {
  isProblemDetails,
  type ProblemDetails,
} from "@/lib/api/problem-details";

import type {
  AssignRole,
  AssignRoleOutcome,
  CreateUser,
  CreateUserValues,
  DeactivateUser,
  DeactivateUserOutcome,
  ProfileValues,
  ReactivateUser,
  ReactivateUserOutcome,
  SaveUserOutcome,
  UpdateUser,
} from "../lib/users-outcome";
import type {
  PaginatedUsers,
  User,
  UserRoleSummary,
  UserStatus,
} from "../lib/users-types";

/** Thrown by the read helpers when the API does not return a usable body. */
export class UsersRequestError extends Error {
  constructor(readonly status: number) {
    super(
      status === 401
        ? "Your session expired. Sign in again."
        : status === 403
          ? "You do not have access to this area."
          : status === 404
            ? "This user no longer exists. Refresh the list."
            : "We could not load the data. Try again.",
    );
    this.name = "UsersRequestError";
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

function saveFailure(error: unknown, status: number): SaveUserOutcome {
  if (isProblemDetails(error)) {
    if (error.code === "USER_EMAIL_CONFLICT")
      return { status: "email_conflict" };
    if (error.code === "ROLE_NOT_FOUND") return { status: "role_not_found" };
    if (error.code === "USER_NOT_FOUND") return { status: "not_found" };
    if (error.code === "VALIDATION_ERROR") {
      const fields = fieldErrorsFrom(error);
      const keys: (keyof CreateUserValues)[] = [
        "email",
        "firstName",
        "lastName",
        "phone",
        "profileImage",
        "temporaryPassword",
        "roleId",
      ];
      const fieldErrors: Partial<Record<keyof CreateUserValues, string>> = {};
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

function deactivateFailure(
  error: unknown,
  status: number,
): Exclude<DeactivateUserOutcome, { status: "success" }> {
  if (isProblemDetails(error)) {
    if (error.code === "USER_ALREADY_INACTIVE")
      return { status: "already_inactive" };
    if (error.code === "USER_NOT_FOUND") return { status: "not_found" };
  }
  if (status === 401 || status === 403) return { status: "permission_denied" };
  return { status: "unexpected" };
}

function reactivateFailure(
  error: unknown,
  status: number,
): Exclude<ReactivateUserOutcome, { status: "success" }> {
  if (isProblemDetails(error)) {
    if (error.code === "USER_ALREADY_ACTIVE")
      return { status: "already_active" };
    if (error.code === "USER_NOT_FOUND") return { status: "not_found" };
  }
  if (status === 401 || status === 403) return { status: "permission_denied" };
  return { status: "unexpected" };
}

function assignFailure(error: unknown, status: number): AssignRoleOutcome {
  if (isProblemDetails(error)) {
    if (error.code === "ROLE_NOT_FOUND") return { status: "role_not_found" };
    if (error.code === "USER_NOT_FOUND") return { status: "not_found" };
  }
  if (status === 401 || status === 403) return { status: "permission_denied" };
  return { status: "unexpected" };
}

export interface ListUsersParams {
  status?: UserStatus | null;
  search?: string;
  page?: number;
  pageSize?: number;
}

type ListQuery = NonNullable<
  operations["Users_list_v1"]["parameters"]["query"]
>;

export async function listUsers(
  params: ListUsersParams,
  signal?: AbortSignal,
): Promise<PaginatedUsers> {
  const query: Record<string, string | number> = {
    page: params.page ?? 1,
    pageSize: params.pageSize ?? 25,
  };
  if (params.status) query.status = params.status;
  if (params.search?.trim()) query.search = params.search.trim();

  const { data, response } = await browserApi.GET("/api/v1/users", {
    // The generated types model `page`/`pageSize` as an empty object because
    // the API decorates them without an explicit `type: Number`; they are
    // plain integers on the wire.
    params: { query: query as unknown as ListQuery },
    ...(signal ? { signal } : {}),
    cache: "no-store",
  });
  if (!data) throw new UsersRequestError(response.status);
  return data;
}

/** Resolves `null` for any non-OK response so the detail dialog can show its
 * generic error state instead of leaving the promise unhandled. */
export async function getUser(
  id: string,
  signal?: AbortSignal,
): Promise<User | null> {
  const { data } = await browserApi.GET("/api/v1/users/{id}", {
    params: { path: { id } },
    ...(signal ? { signal } : {}),
    cache: "no-store",
  });
  return data ?? null;
}

/** The assignment control only needs `{ id, name }`; source it from the roles
 * list. Resolves `[]` when the caller cannot read roles. */
export async function listAssignableRoles(
  signal?: AbortSignal,
): Promise<UserRoleSummary[]> {
  const { data } = await browserApi.GET("/api/v1/roles", {
    ...(signal ? { signal } : {}),
    cache: "no-store",
  });
  return (data ?? []).map((role) => ({ id: role.id, name: role.name }));
}

function toCreateBody(values: CreateUserValues) {
  return {
    email: values.email.trim(),
    firstName: values.firstName.trim(),
    lastName: values.lastName.trim(),
    temporaryPassword: values.temporaryPassword,
    ...(values.phone.trim() ? { phone: values.phone.trim() } : {}),
    ...(values.profileImage.trim()
      ? { profileImage: values.profileImage.trim() }
      : {}),
    ...(values.roleId ? { roleId: values.roleId } : {}),
  };
}

function toUpdateBody(values: Partial<ProfileValues>) {
  const body: Record<string, string> = {};
  for (const [key, value] of Object.entries(values)) {
    if (typeof value === "string" && value.trim() !== "") {
      body[key] = value.trim();
    }
  }
  return body;
}

export const createUser: CreateUser = async (values) => {
  try {
    const { data, error, response } = await browserApi.POST("/api/v1/users", {
      body: toCreateBody(values),
      headers: headers(),
    });
    return data
      ? { status: "success", user: data }
      : saveFailure(error, response.status);
  } catch {
    return { status: "unexpected" };
  }
};

export const updateUser: UpdateUser = async (id, values) => {
  try {
    const { data, error, response } = await browserApi.PATCH(
      "/api/v1/users/{id}",
      {
        params: { path: { id } },
        body: toUpdateBody(values),
        headers: headers(),
      },
    );
    return data
      ? { status: "success", user: data }
      : saveFailure(error, response.status);
  } catch {
    return { status: "unexpected" };
  }
};

export const deactivateUser: DeactivateUser = async (id) => {
  try {
    const { data, error, response } = await browserApi.POST(
      "/api/v1/users/{id}/deactivate",
      { params: { path: { id } }, headers: headers() },
    );
    return data
      ? { status: "success", user: data }
      : deactivateFailure(error, response.status);
  } catch {
    return { status: "unexpected" };
  }
};

export const reactivateUser: ReactivateUser = async (id) => {
  try {
    const { data, error, response } = await browserApi.POST(
      "/api/v1/users/{id}/reactivate",
      { params: { path: { id } }, headers: headers() },
    );
    return data
      ? { status: "success", user: data }
      : reactivateFailure(error, response.status);
  } catch {
    return { status: "unexpected" };
  }
};

export const assignUserRole: AssignRole = async (id, roleId) => {
  try {
    const { data, error, response } = await browserApi.PUT(
      "/api/v1/users/{id}/role",
      { params: { path: { id } }, body: { roleId }, headers: headers() },
    );
    return data
      ? { status: "success", user: data }
      : assignFailure(error, response.status);
  } catch {
    return { status: "unexpected" };
  }
};
