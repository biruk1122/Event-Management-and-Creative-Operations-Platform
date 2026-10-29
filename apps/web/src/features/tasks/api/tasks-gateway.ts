import type { operations } from "@event-platform/api-client";

import { browserApi } from "@/lib/api/browser";
import { readCsrfToken } from "@/lib/api/csrf";
import { isProblemDetails } from "@/lib/api/problem-details";

import type {
  Task,
  TaskChecklistItem,
  TaskCollaborationPreview,
  TaskPerson,
  TaskPriority,
  TaskStatus,
  TaskType,
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
  workspaceId?: string | null;
  departmentId?: string | null;
  /** Restricts to the subtasks of one top-level task (Manager -> Team
   * Member delegation); the server scopes this the same as any other read. */
  parentTaskId?: string | null;
  assigneeId?: string | null;
  /** "Created by Me". */
  createdById?: string | null;
  overdue?: boolean | null;
  page?: number;
  pageSize?: number;
}

type ListQuery = NonNullable<
  operations["Tasks_list_v1"]["parameters"]["query"]
>;

export async function listTasks(params: ListTasksParams, signal?: AbortSignal) {
  const query: Record<string, string | number | boolean> = {
    page: params.page ?? 1,
    pageSize: params.pageSize ?? 25,
  };
  if (params.status) query.status = params.status;
  if (params.priority) query.priority = params.priority;
  if (params.search?.trim()) query.search = params.search.trim();
  if (params.workspaceId) query.workspaceId = params.workspaceId;
  if (params.departmentId) query.departmentId = params.departmentId;
  if (params.parentTaskId) query.parentTaskId = params.parentTaskId;
  if (params.assigneeId) query.assigneeId = params.assigneeId;
  if (params.createdById) query.createdById = params.createdById;
  if (params.overdue) query.overdue = params.overdue;

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

export async function addTaskChecklistItem(
  id: string,
  description: string,
): Promise<TaskChecklistItem> {
  const { data, error, response } = await browserApi.POST(
    "/api/v1/tasks/{id}/checklist-items",
    {
      params: { path: { id } },
      body: { description },
      headers: headers(),
    },
  );
  if (!data)
    fail(
      response.status,
      error,
      "The checkpoint was not added. Keep the text and try again.",
    );
  return data;
}

export async function updateTaskChecklistItem(
  id: string,
  itemId: string,
  description: string,
): Promise<TaskChecklistItem> {
  const { data, error, response } = await browserApi.PATCH(
    "/api/v1/tasks/{id}/checklist-items/{itemId}",
    {
      params: { path: { id, itemId } },
      body: { description },
      headers: headers(),
    },
  );
  if (!data)
    fail(
      response.status,
      error,
      "The checkpoint was not updated. Keep the text and try again.",
    );
  return data;
}

export async function removeTaskChecklistItem(
  id: string,
  itemId: string,
): Promise<void> {
  const { error, response } = await browserApi.DELETE(
    "/api/v1/tasks/{id}/checklist-items/{itemId}",
    {
      params: { path: { id, itemId } },
      headers: headers(),
    },
  );
  if (!response.ok)
    fail(response.status, error, "The checkpoint was not removed. Try again.");
}

export async function reorderTaskChecklistItems(
  id: string,
  orderedItemIds: string[],
): Promise<TaskChecklistItem[]> {
  const { data, error, response } = await browserApi.POST(
    "/api/v1/tasks/{id}/checklist-items/reorder",
    {
      params: { path: { id } },
      body: { orderedItemIds },
      headers: headers(),
    },
  );
  if (!data)
    fail(response.status, error, "The reorder was not saved. Try again.");
  return data;
}

export async function toggleTaskChecklistItem(
  id: string,
  itemId: string,
  completed: boolean,
): Promise<Task> {
  const { data, error, response } = await browserApi.PATCH(
    "/api/v1/tasks/{id}/checklist-items/{itemId}/completion",
    {
      params: { path: { id, itemId } },
      body: { completed },
      headers: headers(),
    },
  );
  if (!data)
    fail(response.status, error, "The checkpoint was not saved. Try again.");
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

/** A short-lived, private signed URL for one attachment - the file is never
 * served directly by this app's own origin. */
export async function getTaskFileDownloadGrant(
  id: string,
  fileId: string,
): Promise<{ url: string }> {
  const { data, error, response } = await browserApi.GET(
    "/api/v1/tasks/{taskId}/files/{fileId}/download",
    { params: { path: { taskId: id, fileId } } },
  );
  if (!data)
    fail(
      response.status,
      error,
      "The file could not be downloaded. Try again.",
    );
  return data;
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

export interface AssignableDepartment {
  id: string;
  name: string;
}

/** Departments the "department" control can offer, from the first page of
 * `GET /api/v1/departments` (already scope-resolved server-side: Super Admin
 * sees every department, a Department Manager only their own). */
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

export interface CreateTaskParams {
  title: string;
  description: string;
  type: TaskType;
  priority: TaskPriority;
  departmentId: string;
  assigneeId?: string;
  dueAt: string;
  /** Links the task to a connected workspace (e.g. a production's schedule)
   * in addition to its department - both may be set at once. */
  workspaceId?: string;
  /** Breaks this down as a subtask of an existing task (Manager -> Team
   * Member delegation). The server derives department/workspace from the
   * parent and ignores this call's own `departmentId`/`workspaceId` when
   * set - only the parent's own assignee (or an organization-scoped
   * caller) may create one. */
  parentTaskId?: string;
  /** Checkpoints authored up front; added one at a time, in order, after
   * the task itself is created (no checklist-item field on create). */
  checklistItems?: readonly string[];
}

export async function createTask(params: CreateTaskParams): Promise<Task> {
  const { data, error, response } = await browserApi.POST("/api/v1/tasks", {
    body: {
      title: params.title.trim(),
      description: params.description.trim(),
      type: params.type,
      priority: params.priority,
      departmentId: params.departmentId,
      dueAt: params.dueAt,
      ...(params.assigneeId ? { assigneeId: params.assigneeId } : {}),
      ...(params.workspaceId ? { workspaceId: params.workspaceId } : {}),
      ...(params.parentTaskId ? { parentTaskId: params.parentTaskId } : {}),
    },
    headers: headers(),
  });
  if (!data)
    fail(response.status, error, "The task could not be created. Try again.");
  // Checklist items have no create-time field of their own - post them
  // sequentially, in order, so `position` is deterministic (the same
  // pattern this dialog already uses for sequential attachment uploads).
  for (const description of params.checklistItems ?? []) {
    const trimmed = description.trim();
    if (trimmed) await addTaskChecklistItem(data.id, trimmed);
  }
  return data;
}

/** Active staff of one department, for the create-task assignee picker.
 * Unlike `listAssignableTaskUsers`, this is scoped to `task.create` rather
 * than `user.read`, so a Department Manager (who cannot browse the full
 * user directory) can still see their own department's eligible staff. */
export async function listEligibleAssignees(
  departmentId: string,
  signal?: AbortSignal,
): Promise<TaskPerson[]> {
  const { data, error, response } = await browserApi.GET(
    "/api/v1/tasks/eligible-assignees",
    {
      params: { query: { departmentId } },
      ...(signal ? { signal } : {}),
      cache: "no-store",
    },
  );
  if (!data)
    fail(response.status, error, "The eligible assignees could not be loaded.");
  return data.items;
}
