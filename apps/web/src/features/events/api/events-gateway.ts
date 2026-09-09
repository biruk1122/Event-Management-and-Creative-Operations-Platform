import type { operations } from "@event-platform/api-client";

import { browserApi } from "@/lib/api/browser";
import { readCsrfToken } from "@/lib/api/csrf";
import { fieldErrorsOf, isProblemDetails } from "@/lib/api/problem-details";

import type {
  AssignEventManager,
  AssignEventManagerOutcome,
  AssignEventTeam,
  CreateEvent,
  CreateEventValues,
  DeleteEvent,
  DeleteEventOutcome,
  EditEventValues,
  EventTeamOutcome,
  RemoveEventTeam,
  SaveEventOutcome,
  SetEventBudget,
  SetEventBudgetOutcome,
  TransitionEvent,
  TransitionEventOutcome,
  UpdateEvent,
  UpdateEventOutcome,
} from "../lib/events-outcome";
import type {
  AssignableTeam,
  AssignableUser,
  Event,
  EventBudget,
  EventStatus,
  PaginatedEvents,
} from "../lib/events-types";

/** Thrown by the read helpers when the API does not return a usable body. */
export class EventsRequestError extends Error {
  constructor(readonly status: number) {
    super(
      status === 401
        ? "Your session expired. Sign in again."
        : status === 403
          ? "You do not have access to this area."
          : status === 404
            ? "This event no longer exists. Refresh the list."
            : "We could not load the data. Try again.",
    );
    this.name = "EventsRequestError";
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

/** Build a `CreateEventDto`: omit optional fields that were left blank. */
function createBody(values: CreateEventValues) {
  const start = toIsoUtc(values.startAt);
  const end = toIsoUtc(values.endAt);
  return {
    name: values.name.trim(),
    eventType: values.eventType,
    ...(values.description.trim()
      ? { description: values.description.trim() }
      : {}),
    ...(start ? { startAt: start } : {}),
    ...(end ? { endAt: end } : {}),
    ...(values.location.trim() ? { location: values.location.trim() } : {}),
    ...(values.organizerName.trim()
      ? { organizerName: values.organizerName.trim() }
      : {}),
    ...(values.managerId ? { managerId: values.managerId } : {}),
  };
}

/** Build an `UpdateEventDto`: send every field, blanking a nullable one to null. */
function updateBody(values: EditEventValues) {
  const trimmedDescription = values.description.trim();
  const trimmedLocation = values.location.trim();
  const trimmedOrganizer = values.organizerName.trim();
  return {
    name: values.name.trim(),
    eventType: values.eventType,
    description: trimmedDescription === "" ? null : trimmedDescription,
    startAt: toIsoUtc(values.startAt),
    endAt: toIsoUtc(values.endAt),
    location: trimmedLocation === "" ? null : trimmedLocation,
    organizerName: trimmedOrganizer === "" ? null : trimmedOrganizer,
  };
}

function saveFailure(error: unknown, status: number): SaveEventOutcome {
  if (isProblemDetails(error)) {
    if (error.code === "USER_NOT_FOUND") return { status: "manager_not_found" };
    if (error.code === "EVENT_SCHEDULE_INVALID")
      return { status: "schedule_invalid" };
    if (error.code === "VALIDATION_ERROR") {
      const fields = fieldErrorsOf(error);
      const fieldErrors: Partial<Record<keyof CreateEventValues, string>> = {};
      for (const key of [
        "name",
        "eventType",
        "description",
        "startAt",
        "endAt",
        "location",
        "organizerName",
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

function updateFailure(error: unknown, status: number): UpdateEventOutcome {
  if (isProblemDetails(error)) {
    if (error.code === "EVENT_NOT_FOUND") return { status: "not_found" };
    if (error.code === "EVENT_SCHEDULE_INVALID")
      return { status: "schedule_invalid" };
    if (error.code === "VALIDATION_ERROR") {
      const fields = fieldErrorsOf(error);
      const fieldErrors: Partial<Record<keyof EditEventValues, string>> = {};
      for (const key of [
        "name",
        "eventType",
        "description",
        "startAt",
        "endAt",
        "location",
        "organizerName",
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
): Exclude<TransitionEventOutcome, { status: "success" }> {
  if (isProblemDetails(error)) {
    if (error.code === "EVENT_INVALID_TRANSITION")
      return { status: "invalid_transition" };
    if (error.code === "EVENT_NOT_FOUND") return { status: "not_found" };
  }
  if (status === 401 || status === 403) return { status: "permission_denied" };
  return { status: "unexpected" };
}

function managerFailure(
  error: unknown,
  status: number,
): Exclude<AssignEventManagerOutcome, { status: "success" }> {
  if (isProblemDetails(error)) {
    if (error.code === "USER_NOT_FOUND") return { status: "manager_not_found" };
    if (error.code === "EVENT_NOT_FOUND") return { status: "not_found" };
  }
  if (status === 401 || status === 403) return { status: "permission_denied" };
  return { status: "unexpected" };
}

function teamFailure(
  error: unknown,
  status: number,
): Exclude<EventTeamOutcome, { status: "success" }> {
  if (isProblemDetails(error)) {
    if (error.code === "EVENT_TEAM_NOT_FOUND")
      return { status: "team_not_found" };
    if (error.code === "EVENT_TEAM_NOT_ASSIGNED")
      return { status: "not_assigned" };
    if (error.code === "EVENT_NOT_FOUND") return { status: "not_found" };
  }
  if (status === 401 || status === 403) return { status: "permission_denied" };
  return { status: "unexpected" };
}

function budgetFailure(
  error: unknown,
  status: number,
): Exclude<SetEventBudgetOutcome, { status: "success" }> {
  if (isProblemDetails(error)) {
    if (error.code === "EVENT_BUDGET_INCOMPLETE")
      return { status: "budget_incomplete" };
    if (error.code === "EVENT_NOT_FOUND") return { status: "not_found" };
    if (error.code === "VALIDATION_ERROR") {
      const fields = fieldErrorsOf(error);
      const fieldErrors: { amount?: string; currency?: string } = {};
      if (fields.amount) fieldErrors.amount = fields.amount;
      if (fields.currency) fieldErrors.currency = fields.currency;
      if (fieldErrors.amount || fieldErrors.currency) {
        return { status: "field_errors", fieldErrors };
      }
    }
  }
  if (status === 401 || status === 403) return { status: "permission_denied" };
  return { status: "unexpected" };
}

function deleteFailure(
  error: unknown,
  status: number,
): Exclude<DeleteEventOutcome, { status: "success" }> {
  if (isProblemDetails(error) && error.code === "EVENT_NOT_FOUND") {
    return { status: "not_found" };
  }
  if (status === 401 || status === 403) return { status: "permission_denied" };
  return { status: "unexpected" };
}

export interface ListEventsParams {
  status?: EventStatus | null;
  eventType?: string | null;
  search?: string | null;
  managerId?: string | null;
  page?: number;
  pageSize?: number;
}

type ListQuery = NonNullable<
  operations["Events_list_v1"]["parameters"]["query"]
>;

export async function listEvents(
  params: ListEventsParams,
  signal?: AbortSignal,
): Promise<PaginatedEvents> {
  const query: Record<string, string | number> = {
    page: params.page ?? 1,
    pageSize: params.pageSize ?? 25,
  };
  if (params.status) query.status = params.status;
  if (params.eventType) query.eventType = params.eventType;
  if (params.search?.trim()) query.search = params.search.trim();
  if (params.managerId) query.managerId = params.managerId;

  const { data, response } = await browserApi.GET("/api/v1/events", {
    params: { query: query as unknown as ListQuery },
    ...(signal ? { signal } : {}),
    cache: "no-store",
  });
  if (!data) throw new EventsRequestError(response.status);
  return data;
}

/** Resolves `null` for any non-OK response so the detail dialog shows its error state. */
export async function getEvent(
  id: string,
  signal?: AbortSignal,
): Promise<Event | null> {
  const { data } = await browserApi.GET("/api/v1/events/{id}", {
    params: { path: { id } },
    ...(signal ? { signal } : {}),
    cache: "no-store",
  });
  return data ?? null;
}

/**
 * The event budget. Resolves `null` on any non-OK response - in particular a
 * 403 when the caller lacks `event.budget.read` - so the section can render its
 * restricted state instead of an error.
 */
export async function getEventBudget(
  id: string,
  signal?: AbortSignal,
): Promise<EventBudget | null> {
  const { data } = await browserApi.GET("/api/v1/events/{id}/budget", {
    params: { path: { id } },
    ...(signal ? { signal } : {}),
    cache: "no-store",
  });
  return data ?? null;
}

/**
 * Users the manager control can offer. The events API has no dedicated route,
 * so this reads the first page of `GET /api/v1/users`. Resolves `[]` when the
 * caller cannot read users.
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

export const createEvent: CreateEvent = async (values) => {
  try {
    const { data, error, response } = await browserApi.POST("/api/v1/events", {
      body: createBody(values),
      headers: headers(),
    });
    return data
      ? { status: "success", event: data }
      : saveFailure(error, response.status);
  } catch {
    return { status: "unexpected" };
  }
};

export const updateEvent: UpdateEvent = async (id, values) => {
  try {
    const { data, error, response } = await browserApi.PATCH(
      "/api/v1/events/{id}",
      {
        params: { path: { id } },
        body: updateBody(values),
        headers: headers(),
      },
    );
    return data
      ? { status: "success", event: data }
      : updateFailure(error, response.status);
  } catch {
    return { status: "unexpected" };
  }
};

export const transitionEvent: TransitionEvent = async (id, status) => {
  try {
    const { data, error, response } = await browserApi.POST(
      "/api/v1/events/{id}/transition",
      { params: { path: { id } }, body: { status }, headers: headers() },
    );
    return data
      ? { status: "success", event: data }
      : transitionFailure(error, response.status);
  } catch {
    return { status: "unexpected" };
  }
};

export const assignEventManager: AssignEventManager = async (id, managerId) => {
  try {
    const { data, error, response } = await browserApi.PUT(
      "/api/v1/events/{id}/manager",
      { params: { path: { id } }, body: { managerId }, headers: headers() },
    );
    return data
      ? { status: "success", event: data }
      : managerFailure(error, response.status);
  } catch {
    return { status: "unexpected" };
  }
};

export const assignEventTeam: AssignEventTeam = async (id, teamId) => {
  try {
    const { data, error, response } = await browserApi.PUT(
      "/api/v1/events/{id}/teams/{teamId}",
      { params: { path: { id, teamId } }, headers: headers() },
    );
    return data
      ? { status: "success", event: data }
      : teamFailure(error, response.status);
  } catch {
    return { status: "unexpected" };
  }
};

export const removeEventTeam: RemoveEventTeam = async (id, teamId) => {
  try {
    const { data, error, response } = await browserApi.DELETE(
      "/api/v1/events/{id}/teams/{teamId}",
      { params: { path: { id, teamId } }, headers: headers() },
    );
    return data
      ? { status: "success", event: data }
      : teamFailure(error, response.status);
  } catch {
    return { status: "unexpected" };
  }
};

export const setEventBudget: SetEventBudget = async (id, amount, currency) => {
  try {
    const { data, error, response } = await browserApi.PUT(
      "/api/v1/events/{id}/budget",
      {
        params: { path: { id } },
        body: { amount, currency },
        headers: headers(),
      },
    );
    return data
      ? { status: "success", budget: data }
      : budgetFailure(error, response.status);
  } catch {
    return { status: "unexpected" };
  }
};

export const deleteEvent: DeleteEvent = async (id) => {
  try {
    const { error, response } = await browserApi.DELETE("/api/v1/events/{id}", {
      params: { path: { id } },
      headers: headers(),
    });
    if (response.ok) return { status: "success" };
    return deleteFailure(error, response.status);
  } catch {
    return { status: "unexpected" };
  }
};
