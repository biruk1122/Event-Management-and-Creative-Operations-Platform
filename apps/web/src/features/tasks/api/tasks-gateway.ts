import type { operations } from "@event-platform/api-client";

import { browserApi } from "@/lib/api/browser";
import { readCsrfToken } from "@/lib/api/csrf";
import { isProblemDetails } from "@/lib/api/problem-details";

import type {
  Task,
  TaskCollaborationPreview,
  TaskPriority,
  TaskStatus,
} from "../lib/tasks-types";

/** A usable error for read failures, including a scope or session change. */
export class TasksRequestError extends Error {
  constructor(
    readonly status: number,
    detail?: string,
    fallback?: string,
  ) {
    super(
      detail ??
        (status === 401
          ? "Your session expired. Sign in again, then retry."
          : status === 403
            ? "You do not have permission for that task action. Refresh your permissions and try again."
            : status === 404
              ? "This task is no longer available. Refresh the task list."
              : status === 409
                ? "That task changed or the workflow action is no longer allowed. Refresh and try again."
                : (fallback ??
                  "We could not load tasks. Your filters are still in place; try again.")),
    );
    this.name = "TasksRequestError";
  }
}

function fail(status: number, error: unknown, fallback?: string): never {
  throw new TasksRequestError(
    status,
    isProblemDetails(error) ? error.detail : undefined,
    fallback,
  );
}

function headers() {
  const token = readCsrfToken();
  return token ? { "x-csrf-token": token } : {};
}

export interface ListTasksParams {
  status?: TaskStatus | null;
  priority?: TaskPriority | null;
  search?: string | null;
  page?: number;
  pageSize?: number;
}

type ListQuery = NonNullable<
  operations["Tasks_list_v1"]["parameters"]["query"]
>;

export async function listTasks(params: ListTasksParams, signal?: AbortSignal) {
  const query: Record<string, string | number> = {
    page: params.page ?? 1,
    pageSize: params.pageSize ?? 25,
  };
  if (params.status) query.status = params.status;
  if (params.priority) query.priority = params.priority;
  if (params.search?.trim()) query.search = params.search.trim();

  const { data, error, response } = await browserApi.GET("/api/v1/tasks", {
    params: { query: query as unknown as ListQuery },
    ...(signal ? { signal } : {}),
    cache: "no-store",
  });
  if (!data) fail(response.status, error);
  return data;
}

async function requireData<T>(
  result: Promise<{ data?: T; error?: unknown; response: Response }>,
): Promise<T> {
  const { data, error, response } = await result;
  if (!data) fail(response.status, error);
  return data;
}

/** Fetch every API-backed section that appears in the task detail dialog. */
export async function getTaskCollaboration(
  id: string,
  signal?: AbortSignal,
): Promise<TaskCollaborationPreview> {
  const request = { ...(signal ? { signal } : {}), cache: "no-store" as const };
  const [task, comments, activity, reviews, files] = await Promise.all([
    requireData(
      browserApi.GET("/api/v1/tasks/{id}", {
        params: { path: { id } },
        ...request,
      }),
    ),
    requireData(
      browserApi.GET("/api/v1/tasks/{id}/comments", {
        params: { path: { id }, query: { page: 1, pageSize: 100 } as never },
        ...request,
      }),
    ),
    requireData(
      browserApi.GET("/api/v1/tasks/{id}/activity", {
        params: { path: { id }, query: { page: 1, pageSize: 100 } as never },
        ...request,
      }),
    ),
    requireData(
      browserApi.GET("/api/v1/tasks/{id}/reviews", {
        params: { path: { id }, query: { page: 1, pageSize: 100 } as never },
        ...request,
      }),
    ),
    requireData(
      browserApi.GET("/api/v1/tasks/{taskId}/files", {
        params: {
          path: { taskId: id },
          query: { page: 1, pageSize: 100 } as never,
        },
        ...request,
      }),
    ),
  ]);

  return {
    task,
    comments: comments.items,
    activity: activity.items,
    reviews: reviews.items,
    files: files.items,
  };
}

export async function createTaskComment(id: string, content: string) {
  const { data, error, response } = await browserApi.POST(
    "/api/v1/tasks/{id}/comments",
    {
      params: { path: { id } },
      body: { content: content.trim() },
      headers: headers(),
    },
  );
  if (!data)
    fail(
      response.status,
      error,
      "Your comment was not saved. Keep the text and try again.",
    );
  return data;
}

export async function updateTaskProgress(id: string, progress: number) {
  const { data, error, response } = await browserApi.PATCH(
    "/api/v1/tasks/{id}/progress",
    {
      params: { path: { id } },
      body: { progress },
      headers: headers(),
    },
  );
  if (!data)
    fail(
      response.status,
      error,
      "Progress was not saved. Keep the value and try again.",
    );
  return data;
}

export async function transitionTask(id: string, status: TaskStatus) {
  const { data, error, response } = await browserApi.POST(
    "/api/v1/tasks/{id}/transition",
    {
      params: { path: { id } },
      // The current public contract only accepts the assignee transition targets.
      // Review decisions own COMPLETED and UNDER_REVIEW state changes.
      body: {
        status: status as "TODO" | "IN_PROGRESS" | "BLOCKED" | "CANCELLED",
      },
      headers: headers(),
    },
  );
  if (!data)
    fail(
      response.status,
      error,
      "The status was not changed. Refresh the task and try again.",
    );
  return data;
}

export async function submitTask(id: string) {
  const { data, error, response } = await browserApi.POST(
    "/api/v1/tasks/{id}/submit",
    {
      params: { path: { id } },
      headers: headers(),
    },
  );
  if (!data)
    fail(
      response.status,
      error,
      "The task could not be submitted for review. Try again.",
    );
  return data;
}

export async function reviewTask(
  id: string,
  outcome: "APPROVED" | "CHANGES_REQUESTED",
  note: string,
) {
  const { data, error, response } = await browserApi.POST(
    "/api/v1/tasks/{id}/reviews",
    {
      params: { path: { id } },
      body: { outcome, ...(note.trim() ? { note: note.trim() } : {}) },
      headers: headers(),
    },
  );
  if (!data)
    fail(
      response.status,
      error,
      "The review decision was not saved. Keep the note and try again.",
    );
  return data;
}

export async function uploadTaskFile(id: string, file: File) {
  const {
    data: intent,
    error,
    response,
  } = await browserApi.POST("/api/v1/tasks/{taskId}/files/upload-intents", {
    params: { path: { taskId: id } },
    body: {
      filename: file.name,
      mediaType: file.type,
      sizeBytes: file.size,
    } as never,
    headers: headers(),
  });
  if (!intent)
    fail(
      response.status,
      error,
      "The file upload could not be prepared. Try again.",
    );
  const form = new FormData();
  Object.entries(intent.upload.fields).forEach(([key, value]) =>
    form.append(key, value),
  );
  form.append("file", file);
  const uploaded = await fetch(intent.upload.url, {
    method: "POST",
    body: form,
  });
  if (!uploaded.ok)
    throw new TasksRequestError(
      uploaded.status,
      undefined,
      "The file could not be uploaded. Your selection is still available to retry.",
    );
  const finalized = await browserApi.POST(
    "/api/v1/tasks/{taskId}/files/{fileId}/finalize",
    {
      params: { path: { taskId: id, fileId: intent.id } },
      headers: headers(),
    },
  );
  if (!finalized.data)
    fail(
      finalized.response.status,
      finalized.error,
      "The upload could not be finalized. Your file is still selected to retry.",
    );
  return finalized.data;
}

export async function addTaskAssignee(
  id: string,
  userId: string,
): Promise<Task> {
  const { data, error, response } = await browserApi.PUT(
    "/api/v1/tasks/{id}/assignees/{userId}",
    { params: { path: { id, userId } }, headers: headers() },
  );
  if (!data)
    fail(response.status, error, "The assignee was not added. Try again.");
  return data;
}

export async function removeTaskAssignee(
  id: string,
  userId: string,
): Promise<Task> {
  const { data, error, response } = await browserApi.DELETE(
    "/api/v1/tasks/{id}/assignees/{userId}",
    { params: { path: { id, userId } }, headers: headers() },
  );
  if (!data)
    fail(response.status, error, "The assignee was not removed. Try again.");
  return data;
}

export async function listAssignableTaskUsers(signal?: AbortSignal) {
  const { data, error, response } = await browserApi.GET("/api/v1/users", {
    params: { query: { page: 1, pageSize: 100 } as never },
    ...(signal ? { signal } : {}),
    cache: "no-store",
  });
  if (!data)
    fail(response.status, error, "The user directory could not be loaded.");
  return data.items;
}
