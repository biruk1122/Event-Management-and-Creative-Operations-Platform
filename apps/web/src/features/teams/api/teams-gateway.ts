import type { operations } from "@event-platform/api-client";

import { browserApi } from "@/lib/api/browser";
import { readCsrfToken } from "@/lib/api/csrf";
import {
  isProblemDetails,
  type ProblemDetails,
} from "@/lib/api/problem-details";

import type {
  AddTeamMember,
  AssignManager,
  AssignManagerOutcome,
  CreateTeam,
  CreateTeamValues,
  DeactivateTeam,
  DeactivateTeamOutcome,
  DeleteTeam,
  DeleteTeamOutcome,
  MembershipOutcome,
  ReactivateTeam,
  ReactivateTeamOutcome,
  RemoveTeamMember,
  SaveTeamOutcome,
  TeamProfileValues,
  UpdateTeam,
} from "../lib/teams-outcome";
import type {
  AssignableDepartment,
  AssignableUser,
  PaginatedTeams,
  Team,
  TeamActivity,
} from "../lib/teams-types";

/** Thrown by the read helpers when the API does not return a usable body. */
export class TeamsRequestError extends Error {
  constructor(readonly status: number) {
    super(
      status === 401
        ? "Your session expired. Sign in again."
        : status === 403
          ? "You do not have access to this area."
          : status === 404
            ? "This team no longer exists. Refresh the list."
            : "We could not load the data. Try again.",
    );
    this.name = "TeamsRequestError";
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

function saveFailure(error: unknown, status: number): SaveTeamOutcome {
  if (isProblemDetails(error)) {
    if (error.code === "TEAM_NAME_CONFLICT") return { status: "name_conflict" };
    if (error.code === "TEAM_DEPARTMENT_NOT_FOUND")
      return { status: "department_not_found" };
    if (error.code === "USER_NOT_FOUND") return { status: "manager_not_found" };
    if (error.code === "TEAM_NOT_FOUND") return { status: "not_found" };
    if (error.code === "VALIDATION_ERROR") {
      const fields = fieldErrorsFrom(error);
      const keys: (keyof CreateTeamValues)[] = [
        "name",
        "departmentId",
        "description",
        "managerId",
      ];
      const fieldErrors: Partial<Record<keyof CreateTeamValues, string>> = {};
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
    if (error.code === "TEAM_NOT_FOUND") return { status: "not_found" };
  }
  if (status === 401 || status === 403) return { status: "permission_denied" };
  return { status: "unexpected" };
}

function membershipFailure(
  error: unknown,
  status: number,
): Exclude<MembershipOutcome, { status: "success" }> {
  if (isProblemDetails(error)) {
    if (error.code === "USER_NOT_FOUND") return { status: "user_not_found" };
    if (error.code === "USER_NOT_IN_TEAM") return { status: "not_a_member" };
    if (error.code === "TEAM_NOT_FOUND") return { status: "not_found" };
  }
  if (status === 401 || status === 403) return { status: "permission_denied" };
  return { status: "unexpected" };
}

function deactivateFailure(
  error: unknown,
  status: number,
): Exclude<DeactivateTeamOutcome, { status: "success" }> {
  if (isProblemDetails(error)) {
    if (error.code === "TEAM_ALREADY_INACTIVE")
      return { status: "already_inactive" };
    if (error.code === "TEAM_NOT_FOUND") return { status: "not_found" };
  }
  if (status === 401 || status === 403) return { status: "permission_denied" };
  return { status: "unexpected" };
}

function reactivateFailure(
  error: unknown,
  status: number,
): Exclude<ReactivateTeamOutcome, { status: "success" }> {
  if (isProblemDetails(error)) {
    if (error.code === "TEAM_ALREADY_ACTIVE")
      return { status: "already_active" };
    if (error.code === "TEAM_NOT_FOUND") return { status: "not_found" };
  }
  if (status === 401 || status === 403) return { status: "permission_denied" };
  return { status: "unexpected" };
}

function deleteFailure(
  error: unknown,
  status: number,
): Exclude<DeleteTeamOutcome, { status: "success" }> {
  if (isProblemDetails(error)) {
    if (error.code === "TEAM_IN_USE") return { status: "in_use" };
    if (error.code === "TEAM_NOT_FOUND") return { status: "not_found" };
  }
  if (status === 401 || status === 403) return { status: "permission_denied" };
  return { status: "unexpected" };
}

export interface ListTeamsParams {
  status?: TeamActivity | null;
  search?: string;
  departmentId?: string | null;
  page?: number;
  pageSize?: number;
}

type ListQuery = NonNullable<
  operations["Teams_list_v1"]["parameters"]["query"]
>;

export async function listTeams(
  params: ListTeamsParams,
  signal?: AbortSignal,
): Promise<PaginatedTeams> {
  const query: Record<string, string | number> = {
    page: params.page ?? 1,
    pageSize: params.pageSize ?? 25,
  };
  if (params.status) query.status = params.status;
  if (params.search?.trim()) query.search = params.search.trim();
  if (params.departmentId) query.departmentId = params.departmentId;

  const { data, response } = await browserApi.GET("/api/v1/teams", {
    // The generated types model `page`/`pageSize` as an empty object because
    // the API decorates them without an explicit `type: Number`; they are
    // plain integers on the wire.
    params: { query: query as unknown as ListQuery },
    ...(signal ? { signal } : {}),
    cache: "no-store",
  });
  if (!data) throw new TeamsRequestError(response.status);
  return data;
}

/** Resolves `null` for any non-OK response so the detail dialog can show its
 * generic error state instead of leaving the promise unhandled. */
export async function getTeam(
  id: string,
  signal?: AbortSignal,
): Promise<Team | null> {
  const { data } = await browserApi.GET("/api/v1/teams/{id}", {
    params: { path: { id } },
    ...(signal ? { signal } : {}),
    cache: "no-store",
  });
  return data ?? null;
}

/**
 * Users the manager and member controls can offer. The team API has no
 * dedicated route, so this reads the first page of `GET /api/v1/users`.
 * Resolves `[]` when the caller cannot read users.
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

/**
 * Departments the create dialog can offer as the owner of a new team. Reads
 * the first page of `GET /api/v1/departments`; a department-scoped caller
 * only sees their own, which is the correct set for them. Resolves `[]` when
 * the caller cannot read departments.
 */
export async function listAssignableDepartments(
  signal?: AbortSignal,
): Promise<AssignableDepartment[]> {
  const { data } = await browserApi.GET("/api/v1/departments", {
    params: { query: { pageSize: 100 } as never },
    ...(signal ? { signal } : {}),
    cache: "no-store",
  });
  return (data?.items ?? []).map((department) => ({
    id: department.id,
    name: department.name,
  }));
}

function toCreateBody(values: CreateTeamValues) {
  return {
    name: values.name.trim(),
    departmentId: values.departmentId ?? "",
    ...(values.description.trim()
      ? { description: values.description.trim() }
      : {}),
    ...(values.managerId ? { managerId: values.managerId } : {}),
  };
}

function toUpdateBody(values: Partial<TeamProfileValues>) {
  const body: Record<string, string> = {};
  for (const [key, value] of Object.entries(values)) {
    if (typeof value === "string" && value.trim() !== "") {
      body[key] = value.trim();
    }
  }
  return body;
}

export const createTeam: CreateTeam = async (values) => {
  try {
    const { data, error, response } = await browserApi.POST("/api/v1/teams", {
      body: toCreateBody(values),
      headers: headers(),
    });
    return data
      ? { status: "success", team: data }
      : saveFailure(error, response.status);
  } catch {
    return { status: "unexpected" };
  }
};

export const updateTeam: UpdateTeam = async (id, values) => {
  try {
    const { data, error, response } = await browserApi.PATCH(
      "/api/v1/teams/{id}",
      {
        params: { path: { id } },
        body: toUpdateBody(values),
        headers: headers(),
      },
    );
    return data
      ? { status: "success", team: data }
      : saveFailure(error, response.status);
  } catch {
    return { status: "unexpected" };
  }
};

export const assignTeamManager: AssignManager = async (id, managerId) => {
  try {
    const { data, error, response } = await browserApi.PUT(
      "/api/v1/teams/{id}/manager",
      { params: { path: { id } }, body: { managerId }, headers: headers() },
    );
    return data
      ? { status: "success", team: data }
      : assignManagerFailure(error, response.status);
  } catch {
    return { status: "unexpected" };
  }
};

export const addTeamMember: AddTeamMember = async (id, userId) => {
  try {
    const { data, error, response } = await browserApi.PUT(
      "/api/v1/teams/{id}/members/{userId}",
      { params: { path: { id, userId } }, headers: headers() },
    );
    return data
      ? { status: "success", team: data }
      : membershipFailure(error, response.status);
  } catch {
    return { status: "unexpected" };
  }
};

export const removeTeamMember: RemoveTeamMember = async (id, userId) => {
  try {
    const { data, error, response } = await browserApi.DELETE(
      "/api/v1/teams/{id}/members/{userId}",
      { params: { path: { id, userId } }, headers: headers() },
    );
    return data
      ? { status: "success", team: data }
      : membershipFailure(error, response.status);
  } catch {
    return { status: "unexpected" };
  }
};

export const deactivateTeam: DeactivateTeam = async (id) => {
  try {
    const { data, error, response } = await browserApi.POST(
      "/api/v1/teams/{id}/deactivate",
      { params: { path: { id } }, headers: headers() },
    );
    return data
      ? { status: "success", team: data }
      : deactivateFailure(error, response.status);
  } catch {
    return { status: "unexpected" };
  }
};

export const reactivateTeam: ReactivateTeam = async (id) => {
  try {
    const { data, error, response } = await browserApi.POST(
      "/api/v1/teams/{id}/reactivate",
      { params: { path: { id } }, headers: headers() },
    );
    return data
      ? { status: "success", team: data }
      : reactivateFailure(error, response.status);
  } catch {
    return { status: "unexpected" };
  }
};

export const deleteTeam: DeleteTeam = async (id) => {
  try {
    const { error, response } = await browserApi.DELETE("/api/v1/teams/{id}", {
      params: { path: { id } },
      headers: headers(),
    });
    if (response.ok) return { status: "success" };
    return deleteFailure(error, response.status);
  } catch {
    return { status: "unexpected" };
  }
};
