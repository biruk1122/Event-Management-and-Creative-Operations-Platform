import { afterEach, describe, expect, it, vi } from "vitest";

import {
  TasksRequestError,
  addTaskChecklistItem,
  createTaskComment,
  getTaskCollaboration,
  getTaskFileDownloadGrant,
  listTasks,
  removeTaskChecklistItem,
  reorderTaskChecklistItems,
  toggleTaskChecklistItem,
  updateTaskChecklistItem,
} from "./tasks-gateway";

const { get, post, patch, put, del } = vi.hoisted(() => ({
  get: vi.fn(),
  post: vi.fn(),
  patch: vi.fn(),
  put: vi.fn(),
  del: vi.fn(),
}));

vi.mock("@/lib/api/browser", () => ({
  browserApi: { GET: get, POST: post, PATCH: patch, PUT: put, DELETE: del },
}));

const ok = (data: unknown, status = 200) => ({
  data,
  response: { ok: true, status },
});

afterEach(() => {
  vi.resetAllMocks();
  document.cookie = "csrf_token=; Max-Age=0; path=/";
});

describe("tasks gateway", () => {
  it("uses a scoped paginated query and omits blank filters", async () => {
    get.mockResolvedValue(ok({ items: [], page: 2, pageSize: 10, total: 0 }));
    await listTasks({
      status: "IN_PROGRESS",
      search: "  venue  ",
      page: 2,
      pageSize: 10,
    });
    expect(get).toHaveBeenCalledWith(
      "/api/v1/tasks",
      expect.objectContaining({
        params: {
          query: {
            page: 2,
            pageSize: 10,
            status: "IN_PROGRESS",
            search: "venue",
          },
        },
      }),
    );
  });

  it("forwards the newly-supported assignee, department, created-by, and overdue filters", async () => {
    get.mockResolvedValue(ok({ items: [], page: 1, pageSize: 25, total: 0 }));
    await listTasks({
      assigneeId: "user-1",
      departmentId: "dept-1",
      createdById: "user-2",
      overdue: true,
    });
    expect(get).toHaveBeenCalledWith(
      "/api/v1/tasks",
      expect.objectContaining({
        params: {
          query: {
            page: 1,
            pageSize: 25,
            assigneeId: "user-1",
            departmentId: "dept-1",
            createdById: "user-2",
            overdue: true,
          },
        },
      }),
    );
  });

  it("raises a typed recoverable error for an unavailable list", async () => {
    get.mockResolvedValue({ data: undefined, response: { status: 403 } });
    await expect(listTasks({})).rejects.toBeInstanceOf(TasksRequestError);
  });

  it("requests a short-lived download grant for one attachment", async () => {
    get.mockResolvedValue(
      ok({
        url: "https://storage.test/download",
        filename: "report.pdf",
        mediaType: "application/pdf",
        expiresAt: "2030-01-01T00:05:00.000Z",
      }),
    );
    const grant = await getTaskFileDownloadGrant("task-1", "file-1");
    expect(get).toHaveBeenCalledWith(
      "/api/v1/tasks/{taskId}/files/{fileId}/download",
      expect.objectContaining({
        params: { path: { taskId: "task-1", fileId: "file-1" } },
      }),
    );
    expect(grant.url).toBe("https://storage.test/download");
  });

  it("raises a typed recoverable error when a download grant cannot be issued", async () => {
    get.mockResolvedValue({ data: undefined, response: { status: 404 } });
    await expect(
      getTaskFileDownloadGrant("task-1", "missing"),
    ).rejects.toBeInstanceOf(TasksRequestError);
  });

  it("loads each collaboration feed from the task API", async () => {
    get.mockImplementation(async (path: string) => {
      if (path === "/api/v1/tasks/{id}")
        return ok({ id: "task-1", title: "Venue plan" });
      return ok({ items: [] });
    });
    const details = await getTaskCollaboration("task-1");
    expect(details.task).toMatchObject({ id: "task-1" });
    expect(get.mock.calls.map(([path]) => path)).toEqual(
      expect.arrayContaining([
        "/api/v1/tasks/{id}",
        "/api/v1/tasks/{id}/comments",
        "/api/v1/tasks/{id}/activity",
        "/api/v1/tasks/{id}/reviews",
        "/api/v1/tasks/{taskId}/files",
      ]),
    );
  });

  it("sends CSRF-protected collaboration mutations", async () => {
    document.cookie = "csrf_token=task-token";
    post.mockResolvedValue(ok({ id: "comment-1" }, 201));

    await createTaskComment("task-1", "  Updated route map.  ");

    expect(post).toHaveBeenCalledWith(
      "/api/v1/tasks/{id}/comments",
      expect.objectContaining({
        body: { content: "Updated route map." },
        headers: { "x-csrf-token": "task-token" },
      }),
    );
  });

  it("sends CSRF-protected checklist mutations", async () => {
    document.cookie = "csrf_token=task-token";
    post.mockResolvedValue(
      ok({ id: "item-1", description: "Confirm venue permits" }, 201),
    );
    patch.mockResolvedValue(
      ok({ id: "item-1", description: "Updated description" }),
    );
    del.mockResolvedValue({ response: { ok: true, status: 204 } });

    await addTaskChecklistItem("task-1", "Confirm venue permits");
    expect(post).toHaveBeenCalledWith(
      "/api/v1/tasks/{id}/checklist-items",
      expect.objectContaining({
        body: { description: "Confirm venue permits" },
        headers: { "x-csrf-token": "task-token" },
      }),
    );

    await updateTaskChecklistItem("task-1", "item-1", "Updated description");
    expect(patch).toHaveBeenCalledWith(
      "/api/v1/tasks/{id}/checklist-items/{itemId}",
      expect.objectContaining({
        body: { description: "Updated description" },
        headers: { "x-csrf-token": "task-token" },
      }),
    );

    await removeTaskChecklistItem("task-1", "item-1");
    expect(del).toHaveBeenCalledWith(
      "/api/v1/tasks/{id}/checklist-items/{itemId}",
      expect.objectContaining({
        headers: { "x-csrf-token": "task-token" },
      }),
    );

    post.mockResolvedValue(
      ok([{ id: "item-1", description: "Confirm venue permits" }]),
    );
    await reorderTaskChecklistItems("task-1", ["item-1"]);
    expect(post).toHaveBeenCalledWith(
      "/api/v1/tasks/{id}/checklist-items/reorder",
      expect.objectContaining({
        body: { orderedItemIds: ["item-1"] },
        headers: { "x-csrf-token": "task-token" },
      }),
    );

    patch.mockResolvedValue(ok({ id: "task-1", progress: 100 }));
    await toggleTaskChecklistItem("task-1", "item-1", true);
    expect(patch).toHaveBeenCalledWith(
      "/api/v1/tasks/{id}/checklist-items/{itemId}/completion",
      expect.objectContaining({
        body: { completed: true },
        headers: { "x-csrf-token": "task-token" },
      }),
    );
  });
});
