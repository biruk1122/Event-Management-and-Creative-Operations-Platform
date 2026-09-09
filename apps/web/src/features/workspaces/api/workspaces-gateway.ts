import type { operations } from "@event-platform/api-client";

import { browserApi } from "@/lib/api/browser";
import { readCsrfToken } from "@/lib/api/csrf";
import { fieldErrorsOf, isProblemDetails } from "@/lib/api/problem-details";

import type {
  AddWorkspaceParticipant,
  AssignManagerOutcome,
  AssignWorkspaceManager,
  AssignWorkspaceTeam,
  CreateWorkspace,
  CreateWorkspaceValues,
  DeleteWorkspace,
  DeleteWorkspaceOutcome,
  RemoveWorkspaceParticipant,
  RemoveWorkspaceTeam,
  SaveWorkspaceOutcome,
  WorkspaceParticipantOutcome,
  WorkspaceTeamOutcome,
} from "../lib/workspaces-outcome";
import type {
  AssignableTeam,
  AssignableUser,
  PaginatedWorkspaces,
  Workspace,
  WorkspaceKind,
} from "../lib/workspaces-types";

/** Thrown by the read helpers when the API does not return a usable body. */
export class WorkspacesRequestError extends Error {
  constructor(readonly status: number) {
    super(
      status === 401
        ? "Your session expired. Sign in again."
        : status === 403
          ? "You do not have access to this area."
          : status === 404
            ? "This workspace no longer exists. Refresh the list."
            : "We could not load the data. Try again.",
    );
    this.name = "WorkspacesRequestError";
  }
}

function headers() {
  const token = readCsrfToken();
  return token ? { "x-csrf-token": token } : {};
}

function saveFailure(error: unknown, status: number): SaveWorkspaceOutcome {
  if (isProblemDetails(error)) {
    if (error.code === "USER_NOT_FOUND") {
      return { status: "manager_not_found" };
    }
    if (error.code === "VALIDATION_ERROR") {
      const fields = fieldErrorsOf(error);
      const fieldErrors: Partial<Record<keyof CreateWorkspaceValues, string>> =
        {};
      for (const key of ["kind", "managerId"] as const) {
        if (fields[key]) {
          fieldErrors[key] = fields[key];
        }
      }
      if (Object.keys(fieldErrors).length > 0) {
        return { status: "field_errors", fieldErrors };
      }
    }
  }
  if (status === 401 || status === 403) {
    return { status: "permission_denied" };
  }
  return { status: "unexpected" };
}

function assignManagerFailure(
  error: unknown,
  status: number,
): Exclude<AssignManagerOutcome, { status: "success" }> {
  if (isProblemDetails(error)) {
    if (error.code === "USER_NOT_FOUND") return { status: "manager_not_found" };
    if (error.code === "WORKSPACE_NOT_FOUND") return { status: "not_found" };
  }
  if (status === 401 || status === 403) return { status: "permission_denied" };
  return { status: "unexpected" };
}

function teamFailure(
  error: unknown,
  status: number,
): Exclude<WorkspaceTeamOutcome, { status: "success" }> {
  if (isProblemDetails(error)) {
    if (error.code === "WORKSPACE_TEAM_NOT_FOUND")
      return { status: "team_not_found" };
    if (error.code === "WORKSPACE_TEAM_NOT_ASSIGNED")
      return { status: "not_assigned" };
    if (error.code === "WORKSPACE_NOT_FOUND") return { status: "not_found" };
  }
  if (status === 401 || status === 403) return { status: "permission_denied" };
  return { status: "unexpected" };
}

function participantFailure(
  error: unknown,
  status: number,
): Exclude<WorkspaceParticipantOutcome, { status: "success" }> {
  if (isProblemDetails(error)) {
    if (error.code === "USER_NOT_FOUND") return { status: "user_not_found" };
    if (error.code === "WORKSPACE_PARTICIPANT_NOT_FOUND")
      return { status: "not_a_participant" };
    if (error.code === "WORKSPACE_NOT_FOUND") return { status: "not_found" };
  }
  if (status === 401 || status === 403) return { status: "permission_denied" };
  return { status: "unexpected" };
}

function deleteFailure(
  error: unknown,
  status: number,
): Exclude<DeleteWorkspaceOutcome, { status: "success" }> {
  if (isProblemDetails(error) && error.code === "WORKSPACE_NOT_FOUND") {
    return { status: "not_found" };
  }
  if (status === 401 || status === 403) return { status: "permission_denied" };
  return { status: "unexpected" };
}

export interface ListWorkspacesParams {
  kind: WorkspaceKind;
  managerId?: string | null;
  page?: number;
  pageSize?: number;
}

type ListQuery = NonNullable<
  operations["Workspaces_list_v1"]["parameters"]["query"]
>;

export async function listWorkspaces(
  params: ListWorkspacesParams,
  signal?: AbortSignal,
): Promise<PaginatedWorkspaces> {
  const query: Record<string, string | number> = {
    kind: params.kind,
    page: params.page ?? 1,
    pageSize: params.pageSize ?? 25,
  };
  if (params.managerId) query.managerId = params.managerId;

  const { data, response } = await browserApi.GET("/api/v1/workspaces", {
    // `page` / `pageSize` are modelled as an empty object because the API
    // decorates them without an explicit `type: Number`; they are plain
    // integers on the wire.
    params: { query: query as unknown as ListQuery },
    ...(signal ? { signal } : {}),
    cache: "no-store",
  });
  if (!data) throw new WorkspacesRequestError(response.status);
  return data;
}

/** Resolves `null` for any non-OK response so the detail dialog can show its
 * generic error state instead of leaving the promise unhandled. */
export async function getWorkspace(
  id: string,
  signal?: AbortSignal,
): Promise<Workspace | null> {
  const { data } = await browserApi.GET("/api/v1/workspaces/{id}", {
    params: { path: { id } },
    ...(signal ? { signal } : {}),
    cache: "no-store",
  });
  return data ?? null;
}

/**
 * Users the manager and participant controls can offer. The workspace API has
 * no dedicated route, so this reads the first page of `GET /api/v1/users`.
 * Resolves `[]` when the caller cannot read users.
 */
export async function listAssignableUsers(
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
 * Teams the "assign team" control can offer. Reads the first page of
 * `GET /api/v1/teams`. Resolves `[]` when the caller cannot read teams.
 */
export async function listAssignableTeams(
  signal?: AbortSignal,
): Promise<AssignableTeam[]> {
  const { data } = await browserApi.GET("/api/v1/teams", {
    params: { query: { pageSize: 100 } as never },
    ...(signal ? { signal } : {}),
    cache: "no-store",
  });
  return (data?.items ?? []).map((team) => ({ id: team.id, name: team.name }));
}

export const createWorkspace: CreateWorkspace = async (values) => {
  try {
    const { data, error, response } = await browserApi.POST(
      "/api/v1/workspaces",
      {
        body: {
          kind: values.kind,
          ...(values.managerId ? { managerId: values.managerId } : {}),
        },
        headers: headers(),
      },
    );
    return data
      ? { status: "success", workspace: data }
      : saveFailure(error, response.status);
  } catch {
    return { status: "unexpected" };
  }
};

export const assignWorkspaceManager: AssignWorkspaceManager = async (
  id,
  managerId,
) => {
  try {
    const { data, error, response } = await browserApi.PUT(
      "/api/v1/workspaces/{id}/manager",
      { params: { path: { id } }, body: { managerId }, headers: headers() },
    );
    return data
      ? { status: "success", workspace: data }
      : assignManagerFailure(error, response.status);
  } catch {
    return { status: "unexpected" };
  }
};

export const assignWorkspaceTeam: AssignWorkspaceTeam = async (id, teamId) => {
  try {
    const { data, error, response } = await browserApi.PUT(
      "/api/v1/workspaces/{id}/teams/{teamId}",
      { params: { path: { id, teamId } }, headers: headers() },
    );
    return data
      ? { status: "success", workspace: data }
      : teamFailure(error, response.status);
  } catch {
    return { status: "unexpected" };
  }
};

export const removeWorkspaceTeam: RemoveWorkspaceTeam = async (id, teamId) => {
  try {
    const { data, error, response } = await browserApi.DELETE(
      "/api/v1/workspaces/{id}/teams/{teamId}",
      { params: { path: { id, teamId } }, headers: headers() },
    );
    return data
      ? { status: "success", workspace: data }
      : teamFailure(error, response.status);
  } catch {
    return { status: "unexpected" };
  }
};

export const addWorkspaceParticipant: AddWorkspaceParticipant = async (
  id,
  userId,
) => {
  try {
    const { data, error, response } = await browserApi.PUT(
      "/api/v1/workspaces/{id}/participants/{userId}",
      { params: { path: { id, userId } }, headers: headers() },
    );
    return data
      ? { status: "success", workspace: data }
      : participantFailure(error, response.status);
  } catch {
    return { status: "unexpected" };
  }
};

export const removeWorkspaceParticipant: RemoveWorkspaceParticipant = async (
  id,
  userId,
) => {
  try {
    const { data, error, response } = await browserApi.DELETE(
      "/api/v1/workspaces/{id}/participants/{userId}",
      { params: { path: { id, userId } }, headers: headers() },
    );
    return data
      ? { status: "success", workspace: data }
      : participantFailure(error, response.status);
  } catch {
    return { status: "unexpected" };
  }
};

export const deleteWorkspace: DeleteWorkspace = async (id) => {
  try {
    const { error, response } = await browserApi.DELETE(
      "/api/v1/workspaces/{id}",
      { params: { path: { id } }, headers: headers() },
    );
    if (response.ok) return { status: "success" };
    return deleteFailure(error, response.status);
  } catch {
    return { status: "unexpected" };
  }
};
