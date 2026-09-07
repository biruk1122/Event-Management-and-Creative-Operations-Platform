import { browserApi } from "@/lib/api/browser";
import { readCsrfToken } from "@/lib/api/csrf";
import { fieldErrorsOf, isProblemDetails } from "@/lib/api/problem-details";
import type {
  AddGrant,
  CreateRole,
  DeleteRole,
  RemoveGrant,
  UpdateRole,
  RbacFailure,
  SaveRoleOutcome,
} from "../lib/rbac-outcome";

export class RbacRequestError extends Error {
  constructor(readonly status: number) {
    super(
      status === 401
        ? "Your session expired. Sign in again."
        : status === 403
          ? "You do not have access to this area."
          : status === 404
            ? "This role no longer exists. Close it and refresh the list."
            : "We could not load the data. Try again.",
    );
  }
}

function headers() {
  const token = readCsrfToken();
  return token ? { "x-csrf-token": token } : {};
}

function failure(error: unknown, status: number): RbacFailure {
  if (status === 401) return { status: "session_expired" };
  if (status === 429) return { status: "rate_limited" };
  if (isProblemDetails(error) && error.code === "CSRF_TOKEN_INVALID")
    return { status: "csrf_invalid" };
  if (status === 403) return { status: "permission_denied" };
  if (status === 404) return { status: "role_not_found" };
  return { status: "unexpected" };
}

function saveFailure(error: unknown, status: number): SaveRoleOutcome {
  if (isProblemDetails(error)) {
    if (error.code === "ROLE_NAME_CONFLICT") return { status: "name_conflict" };
    if (error.code === "VALIDATION_ERROR") {
      const fields = fieldErrorsOf(error);
      if (fields.name || fields.description)
        return {
          status: "field_errors",
          fieldErrors: {
            ...(fields.name ? { name: fields.name } : {}),
            ...(fields.description ? { description: fields.description } : {}),
          },
        };
    }
  }
  return failure(error, status);
}

export async function listRoles(signal?: AbortSignal) {
  const { data, response } = await browserApi.GET("/api/v1/roles", {
    ...(signal ? { signal } : {}),
    cache: "no-store",
  });
  if (!data) throw new RbacRequestError(response.status);
  return data;
}

export async function listPermissions(signal?: AbortSignal) {
  const { data, response } = await browserApi.GET("/api/v1/permissions", {
    ...(signal ? { signal } : {}),
    cache: "no-store",
  });
  if (!data) throw new RbacRequestError(response.status);
  return data;
}

export async function getRole(id: string, signal?: AbortSignal) {
  const { data, response } = await browserApi.GET("/api/v1/roles/{id}", {
    params: { path: { id } },
    ...(signal ? { signal } : {}),
    cache: "no-store",
  });
  if (!data) throw new RbacRequestError(response.status);
  return data;
}

export const createRole: CreateRole = async (values) => {
  try {
    const { data, error, response } = await browserApi.POST("/api/v1/roles", {
      body: values,
      headers: headers(),
    });
    return data
      ? { status: "success", role: data }
      : saveFailure(error, response.status);
  } catch {
    return { status: "unexpected" };
  }
};

export const updateRole: UpdateRole = async (id, values) => {
  try {
    const { data, error, response } = await browserApi.PATCH(
      "/api/v1/roles/{id}",
      { params: { path: { id } }, body: values, headers: headers() },
    );
    return data
      ? { status: "success", role: data }
      : saveFailure(error, response.status);
  } catch {
    return { status: "unexpected" };
  }
};

export const deleteRole: DeleteRole = async (id) => {
  try {
    const { error, response } = await browserApi.DELETE("/api/v1/roles/{id}", {
      params: { path: { id } },
      headers: headers(),
    });
    if (response.ok) return { status: "success" };
    if (isProblemDetails(error)) {
      if (error.code === "ROLE_IS_SYSTEM") return { status: "is_system" };
      if (error.code === "ROLE_IN_USE") return { status: "in_use" };
    }
    return failure(error, response.status);
  } catch {
    return { status: "unexpected" };
  }
};

export const addGrant: AddGrant = async (id, permissionKey, scope) => {
  try {
    const { error, response } = await browserApi.POST(
      "/api/v1/roles/{id}/permissions",
      {
        params: { path: { id } },
        body: { permissionKey, scope },
        headers: headers(),
      },
    );
    if (response.ok) return { status: "success" };
    if (isProblemDetails(error) && error.code === "GRANT_ALREADY_EXISTS")
      return { status: "already_exists" };
    return failure(error, response.status);
  } catch {
    return { status: "unexpected" };
  }
};

export const removeGrant: RemoveGrant = async (id, permissionKey, scope) => {
  try {
    const { error, response } = await browserApi.DELETE(
      "/api/v1/roles/{id}/permissions/{permissionKey}/{scope}",
      { params: { path: { id, permissionKey, scope } }, headers: headers() },
    );
    if (response.ok) return { status: "success" };
    if (isProblemDetails(error) && error.code === "GRANT_NOT_FOUND")
      return { status: "not_found" };
    return failure(error, response.status);
  } catch {
    return { status: "unexpected" };
  }
};
