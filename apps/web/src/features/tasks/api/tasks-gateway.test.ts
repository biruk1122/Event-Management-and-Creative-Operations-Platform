import { afterEach, describe, expect, it, vi } from "vitest";

import {
  TasksRequestError,
  createTaskComment,
  getTaskCollaboration,
  listTasks,
  updateTaskProgress,
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

  it("raises a typed recoverable error for an unavailable list", async () => {
    get.mockResolvedValue({ data: undefined, response: { status: 403 } });
    await expect(listTasks({})).rejects.toBeInstanceOf(TasksRequestError);
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
    patch.mockResolvedValue(ok({ id: "task-1", progress: 55 }));

    await createTaskComment("task-1", "  Updated route map.  ");
    await updateTaskProgress("task-1", 55);

    expect(post).toHaveBeenCalledWith(
      "/api/v1/tasks/{id}/comments",
      expect.objectContaining({
        body: { content: "Updated route map." },
        headers: { "x-csrf-token": "task-token" },
      }),
    );
    expect(patch).toHaveBeenCalledWith(
      "/api/v1/tasks/{id}/progress",
      expect.objectContaining({ body: { progress: 55 } }),
    );
  });
});
