import { browserApi } from "@/lib/api/browser";
import { readCsrfToken } from "@/lib/api/csrf";
import { fieldErrorsOf, isProblemDetails } from "@/lib/api/problem-details";

import type {
  CreateTodo,
  CreateTodoOutcome,
  DeleteTodo,
  DeleteTodoOutcome,
  TodoFormValues,
  UpdateTodo,
  UpdateTodoOutcome,
} from "../lib/todo-outcome";
import type { RelatedOption, TodoItem } from "../lib/todo-types";

/** Thrown by the read helper when the API does not return a usable body. */
export class TodoRequestError extends Error {
  constructor(readonly status: number) {
    super(
      status === 401
        ? "Your session expired. Sign in again."
        : status === 403
          ? "You do not have access to your to-do list."
          : "We could not load your to-dos. Try again.",
    );
    this.name = "TodoRequestError";
  }
}

function headers() {
  const token = readCsrfToken();
  return token ? { "x-csrf-token": token } : {};
}

export async function listTodos(
  signal?: AbortSignal,
): Promise<readonly TodoItem[]> {
  const { data, response } = await browserApi.GET("/api/v1/todos", {
    ...(signal ? { signal } : {}),
    cache: "no-store",
  });
  if (!data) throw new TodoRequestError(response.status);
  return data.items;
}

/**
 * Events the "related event" control can offer, from the first page of
 * `GET /api/v1/events`. Resolves `[]` when the caller cannot read events,
 * matching `listAssignableEvents` in the projects feature.
 */
export async function listAssignableEvents(
  signal?: AbortSignal,
): Promise<RelatedOption[]> {
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

/**
 * Projects the "related project" control can offer, from the first page of
 * `GET /api/v1/projects`. Resolves `[]` when the caller cannot read projects.
 */
export async function listAssignableProjects(
  signal?: AbortSignal,
): Promise<RelatedOption[]> {
  const { data } = await browserApi.GET("/api/v1/projects", {
    params: { query: { pageSize: 100 } as never },
    ...(signal ? { signal } : {}),
    cache: "no-store",
  });
  return (data?.items ?? []).map((project) => ({
    id: project.id,
    name: project.name,
  }));
}

/** Build a `CreateTodoDto`: omit optional fields left blank. */
function createBody(values: TodoFormValues) {
  const description = values.description.trim();
  return {
    title: values.title.trim(),
    type: values.type,
    priority: values.priority,
    status: values.status,
    ...(description ? { description } : {}),
    ...(values.dueDate ? { dueDate: values.dueDate } : {}),
    ...(values.dueDate && values.dueTime
      ? { dueTime: `${values.dueTime}:00` }
      : {}),
    ...(values.relatedEventId ? { relatedEventId: values.relatedEventId } : {}),
    ...(values.relatedProjectId
      ? { relatedProjectId: values.relatedProjectId }
      : {}),
    ...(values.remindMe && values.reminderAt
      ? { reminderAt: new Date(values.reminderAt).toISOString() }
      : {}),
  };
}

/** Build an `UpdateTodoDto`: send every field, blanking optional ones to null. */
function updateBody(values: TodoFormValues) {
  const description = values.description.trim();
  return {
    title: values.title.trim(),
    description: description === "" ? null : description,
    type: values.type,
    priority: values.priority,
    status: values.status,
    dueDate: values.dueDate || null,
    dueTime: values.dueDate && values.dueTime ? `${values.dueTime}:00` : null,
    relatedEventId: values.relatedEventId || null,
    relatedProjectId: values.relatedProjectId || null,
    reminderAt:
      values.remindMe && values.reminderAt
        ? new Date(values.reminderAt).toISOString()
        : null,
  };
}

const FIELD_KEYS = [
  "title",
  "description",
  "type",
  "priority",
  "status",
  "dueDate",
  "dueTime",
  "relatedEventId",
  "relatedProjectId",
  "reminderAt",
] as const;

function saveFailure(
  error: unknown,
  status: number,
): Exclude<CreateTodoOutcome, { status: "success" }> {
  if (isProblemDetails(error)) {
    if (error.code === "TODO_SCHEDULE_INVALID")
      return { status: "schedule_invalid" };
    if (error.code === "TODO_RELATED_EVENT_NOT_FOUND")
      return { status: "related_event_not_found" };
    if (error.code === "TODO_RELATED_PROJECT_NOT_FOUND")
      return { status: "related_project_not_found" };
    if (error.code === "VALIDATION_ERROR") {
      const fields = fieldErrorsOf(error);
      const fieldErrors: Partial<Record<keyof TodoFormValues, string>> = {};
      for (const key of FIELD_KEYS) {
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

function updateFailure(
  error: unknown,
  status: number,
): Exclude<UpdateTodoOutcome, { status: "success" }> {
  if (isProblemDetails(error)) {
    if (error.code === "TODO_NOT_FOUND") return { status: "not_found" };
    if (error.code === "TODO_SCHEDULE_INVALID")
      return { status: "schedule_invalid" };
    if (error.code === "TODO_RELATED_EVENT_NOT_FOUND")
      return { status: "related_event_not_found" };
    if (error.code === "TODO_RELATED_PROJECT_NOT_FOUND")
      return { status: "related_project_not_found" };
    if (error.code === "VALIDATION_ERROR") {
      const fields = fieldErrorsOf(error);
      const fieldErrors: Partial<Record<keyof TodoFormValues, string>> = {};
      for (const key of FIELD_KEYS) {
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

function deleteFailure(
  error: unknown,
  status: number,
): Exclude<DeleteTodoOutcome, { status: "success" }> {
  if (isProblemDetails(error) && error.code === "TODO_NOT_FOUND") {
    return { status: "not_found" };
  }
  if (status === 401 || status === 403) return { status: "permission_denied" };
  return { status: "unexpected" };
}

export const createTodo: CreateTodo = async (values) => {
  try {
    const { data, error, response } = await browserApi.POST("/api/v1/todos", {
      body: createBody(values),
      headers: headers(),
    });
    return data
      ? { status: "success", item: data }
      : saveFailure(error, response.status);
  } catch {
    return { status: "unexpected" };
  }
};

export const updateTodo: UpdateTodo = async (id, values) => {
  try {
    const { data, error, response } = await browserApi.PATCH(
      "/api/v1/todos/{id}",
      {
        params: { path: { id } },
        body: updateBody(values),
        headers: headers(),
      },
    );
    return data
      ? { status: "success", item: data }
      : updateFailure(error, response.status);
  } catch {
    return { status: "unexpected" };
  }
};

/** A minimal `PATCH` carrying only `status` - used by the list's one-click
 * complete toggle so it never resends (and risks racing) the rest of the
 * item's fields. */
export async function toggleTodoStatus(
  id: string,
  status: TodoItem["status"],
): Promise<UpdateTodoOutcome> {
  try {
    const { data, error, response } = await browserApi.PATCH(
      "/api/v1/todos/{id}",
      { params: { path: { id } }, body: { status }, headers: headers() },
    );
    return data
      ? { status: "success", item: data }
      : updateFailure(error, response.status);
  } catch {
    return { status: "unexpected" };
  }
}

export const deleteTodo: DeleteTodo = async (id) => {
  try {
    const { error, response } = await browserApi.DELETE("/api/v1/todos/{id}", {
      params: { path: { id } },
      headers: headers(),
    });
    if (response.ok) return { status: "success" };
    return deleteFailure(error, response.status);
  } catch {
    return { status: "unexpected" };
  }
};
