import type { operations } from "@event-platform/api-client";

import { browserApi } from "@/lib/api/browser";
import { readCsrfToken } from "@/lib/api/csrf";
import { fieldErrorsOf, isProblemDetails } from "@/lib/api/problem-details";

import type {
  AssignProjectManager,
  AssignProjectManagerOutcome,
  AssignProjectTeam,
  CreateProject,
  CreateProjectValues,
  DeleteProject,
  DeleteProjectOutcome,
  EditProjectValues,
  ProjectTeamOutcome,
  RemoveProjectTeam,
  SaveProjectOutcome,
  TransitionProject,
  TransitionProjectOutcome,
  UpdateProject,
  UpdateProjectOutcome,
} from "../lib/projects-outcome";
import type {
  AssignableEvent,
  AssignableTeam,
  AssignableUser,
  PaginatedProjects,
  Project,
  ProjectStatus,
} from "../lib/projects-types";

/** Thrown by the read helpers when the API does not return a usable body. */
export class ProjectsRequestError extends Error {
  constructor(readonly status: number) {
    super(
      status === 401
        ? "Your session expired. Sign in again."
        : status === 403
          ? "You do not have access to this area."
          : status === 404
            ? "This project no longer exists. Refresh the list."
            : "We could not load the data. Try again.",
    );
    this.name = "ProjectsRequestError";
  }
}

function headers() {
  const token = readCsrfToken();
  return token ? { "x-csrf-token": token } : {};
}

/** A `datetime-local` field value, read as a UTC instant. Empty stays empty. */
function toIsoUtc(local: string): string | null {
  if (local === "") return null;
  return new Date(`${local.slice(0, 16)}:00.000Z`).toISOString();
}

/** Build a `CreateProjectDto`: omit optional fields that were left blank. */
function createBody(values: CreateProjectValues) {
  const start = toIsoUtc(values.startAt);
  const end = toIsoUtc(values.endAt);
  return {
    name: values.name.trim(),
    ...(values.description.trim()
      ? { description: values.description.trim() }
      : {}),
    ...(start ? { startAt: start } : {}),
    ...(end ? { endAt: end } : {}),
    ...(values.eventId ? { eventId: values.eventId } : {}),
    ...(values.managerId ? { managerId: values.managerId } : {}),
  };
}

/** Build an `UpdateProjectDto`: send every field, blanking a nullable one to null. */
function updateBody(values: EditProjectValues) {
  const trimmedDescription = values.description.trim();
  return {
    name: values.name.trim(),
    description: trimmedDescription === "" ? null : trimmedDescription,
    startAt: toIsoUtc(values.startAt),
    endAt: toIsoUtc(values.endAt),
    eventId: values.eventId,
  };
}

function saveFailure(error: unknown, status: number): SaveProjectOutcome {
  if (isProblemDetails(error)) {
    if (error.code === "USER_NOT_FOUND") return { status: "manager_not_found" };
    if (error.code === "EVENT_NOT_FOUND") return { status: "event_not_found" };
    if (error.code === "PROJECT_SCHEDULE_INVALID")
      return { status: "schedule_invalid" };
    if (error.code === "VALIDATION_ERROR") {
      const fields = fieldErrorsOf(error);
      const fieldErrors: Partial<Record<keyof CreateProjectValues, string>> =
        {};
      for (const key of [
        "name",
        "description",
        "startAt",
        "endAt",
        "eventId",
        "managerId",
      ] as const) {
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

function updateFailure(error: unknown, status: number): UpdateProjectOutcome {
  if (isProblemDetails(error)) {
    if (error.code === "PROJECT_NOT_FOUND") return { status: "not_found" };
    if (error.code === "EVENT_NOT_FOUND") return { status: "event_not_found" };
    if (error.code === "PROJECT_SCHEDULE_INVALID")
      return { status: "schedule_invalid" };
    if (error.code === "VALIDATION_ERROR") {
      const fields = fieldErrorsOf(error);
      const fieldErrors: Partial<Record<keyof EditProjectValues, string>> = {};
      for (const key of [
        "name",
        "description",
        "startAt",
        "endAt",
        "eventId",
      ] as const) {
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

function transitionFailure(
  error: unknown,
  status: number,
): Exclude<TransitionProjectOutcome, { status: "success" }> {
  if (isProblemDetails(error)) {
    if (error.code === "PROJECT_INVALID_TRANSITION")
      return { status: "invalid_transition" };
    if (error.code === "PROJECT_NOT_FOUND") return { status: "not_found" };
  }
  if (status === 401 || status === 403) return { status: "permission_denied" };
  return { status: "unexpected" };
}

function managerFailure(
  error: unknown,
  status: number,
): Exclude<AssignProjectManagerOutcome, { status: "success" }> {
  if (isProblemDetails(error)) {
    if (error.code === "USER_NOT_FOUND") return { status: "manager_not_found" };
    if (error.code === "PROJECT_NOT_FOUND") return { status: "not_found" };
  }
  if (status === 401 || status === 403) return { status: "permission_denied" };
  return { status: "unexpected" };
}

function teamFailure(
  error: unknown,
  status: number,
): Exclude<ProjectTeamOutcome, { status: "success" }> {
  if (isProblemDetails(error)) {
    if (error.code === "PROJECT_TEAM_NOT_FOUND")
      return { status: "team_not_found" };
    if (error.code === "PROJECT_TEAM_NOT_ASSIGNED")
      return { status: "not_assigned" };
    if (error.code === "PROJECT_NOT_FOUND") return { status: "not_found" };
  }
  if (status === 401 || status === 403) return { status: "permission_denied" };
  return { status: "unexpected" };
}

function deleteFailure(
  error: unknown,
  status: number,
): Exclude<DeleteProjectOutcome, { status: "success" }> {
  if (isProblemDetails(error) && error.code === "PROJECT_NOT_FOUND") {
    return { status: "not_found" };
  }
  if (status === 401 || status === 403) return { status: "permission_denied" };
  return { status: "unexpected" };
}

export interface ListProjectsParams {
  status?: ProjectStatus | null;
  search?: string | null;
  eventId?: string | null;
  managerId?: string | null;
  page?: number;
  pageSize?: number;
}

type ListQuery = NonNullable<
  operations["Projects_list_v1"]["parameters"]["query"]
>;

export async function listProjects(
  params: ListProjectsParams,
  signal?: AbortSignal,
): Promise<PaginatedProjects> {
  const query: Record<string, string | number> = {
    page: params.page ?? 1,
    pageSize: params.pageSize ?? 25,
  };
  if (params.status) query.status = params.status;
  if (params.search?.trim()) query.search = params.search.trim();
  if (params.eventId) query.eventId = params.eventId;
  if (params.managerId) query.managerId = params.managerId;

  const { data, response } = await browserApi.GET("/api/v1/projects", {
    params: { query: query as unknown as ListQuery },
    ...(signal ? { signal } : {}),
    cache: "no-store",
  });
  if (!data) throw new ProjectsRequestError(response.status);
  return data;
}

/** Resolves `null` for any non-OK response so the detail dialog shows its error state. */
export async function getProject(
  id: string,
  signal?: AbortSignal,
): Promise<Project | null> {
  const { data } = await browserApi.GET("/api/v1/projects/{id}", {
    params: { path: { id } },
    ...(signal ? { signal } : {}),
    cache: "no-store",
  });
  return data ?? null;
}

/**
 * Users the manager control can offer. The projects API has no dedicated
 * route, so this reads the first page of `GET /api/v1/users`. Resolves `[]`
 * when the caller cannot read users.
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

/** Teams the "assign team" control can offer, from the first page of `GET /api/v1/teams`. */
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

/** Events the "related event" control can offer, from the first page of `GET /api/v1/events`. */
export async function listAssignableEvents(
  signal?: AbortSignal,
): Promise<AssignableEvent[]> {
  const { data } = await browserApi.GET("/api/v1/events", {
    params: { query: { pageSize: 100 } as never },
    ...(signal ? { signal } : {}),
    cache: "no-store",
  });
  return (data?.items ?? []).map((event) => ({
    id: event.id,
    name: event.name,
  }));
}

export const createProject: CreateProject = async (values) => {
  try {
    const { data, error, response } = await browserApi.POST(
      "/api/v1/projects",
      { body: createBody(values), headers: headers() },
    );
    return data
      ? { status: "success", project: data }
      : saveFailure(error, response.status);
  } catch {
    return { status: "unexpected" };
  }
};

export const updateProject: UpdateProject = async (id, values) => {
  try {
    const { data, error, response } = await browserApi.PATCH(
      "/api/v1/projects/{id}",
      {
        params: { path: { id } },
        body: updateBody(values),
        headers: headers(),
      },
    );
    return data
      ? { status: "success", project: data }
      : updateFailure(error, response.status);
  } catch {
    return { status: "unexpected" };
  }
};

export const transitionProject: TransitionProject = async (id, status) => {
  try {
    const { data, error, response } = await browserApi.POST(
      "/api/v1/projects/{id}/transition",
      { params: { path: { id } }, body: { status }, headers: headers() },
    );
    return data
      ? { status: "success", project: data }
      : transitionFailure(error, response.status);
  } catch {
    return { status: "unexpected" };
  }
};

export const assignProjectManager: AssignProjectManager = async (
  id,
  managerId,
) => {
  try {
    const { data, error, response } = await browserApi.PUT(
      "/api/v1/projects/{id}/manager",
      { params: { path: { id } }, body: { managerId }, headers: headers() },
    );
    return data
      ? { status: "success", project: data }
      : managerFailure(error, response.status);
  } catch {
    return { status: "unexpected" };
  }
};

export const assignProjectTeam: AssignProjectTeam = async (id, teamId) => {
  try {
    const { data, error, response } = await browserApi.PUT(
      "/api/v1/projects/{id}/teams/{teamId}",
      { params: { path: { id, teamId } }, headers: headers() },
    );
    return data
      ? { status: "success", project: data }
      : teamFailure(error, response.status);
  } catch {
    return { status: "unexpected" };
  }
};

export const removeProjectTeam: RemoveProjectTeam = async (id, teamId) => {
  try {
    const { data, error, response } = await browserApi.DELETE(
      "/api/v1/projects/{id}/teams/{teamId}",
      { params: { path: { id, teamId } }, headers: headers() },
    );
    return data
      ? { status: "success", project: data }
      : teamFailure(error, response.status);
  } catch {
    return { status: "unexpected" };
  }
};

export const deleteProject: DeleteProject = async (id) => {
  try {
    const { error, response } = await browserApi.DELETE(
      "/api/v1/projects/{id}",
      { params: { path: { id } }, headers: headers() },
    );
    if (response.ok) return { status: "success" };
    return deleteFailure(error, response.status);
  } catch {
    return { status: "unexpected" };
  }
};
