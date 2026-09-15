import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";

import type { CurrentAccess } from "@/features/auth/api/access-queries";

import { TASK_WORKSPACE_FIXTURE } from "../lib/task-fixtures";
import { TasksManager } from "./tasks-manager";

const { get } = vi.hoisted(() => ({ get: vi.fn() }));
vi.mock("@/lib/api/browser", () => ({
  browserApi: {
    GET: get,
    POST: vi.fn(),
    PATCH: vi.fn(),
    PUT: vi.fn(),
    DELETE: vi.fn(),
  },
}));

const access = {
  userId: "account-1",
  grants: [{ permissionKey: "task.read", scope: "WORKSPACE" }],
} as CurrentAccess;

afterEach(() => vi.resetAllMocks());

function setup() {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  render(
    <QueryClientProvider client={client}>
      <TasksManager access={access} />
    </QueryClientProvider>,
  );
}

describe("TasksManager", () => {
  it("uses the API page response and requests the next page", async () => {
    get.mockResolvedValue({
      data: {
        items: TASK_WORKSPACE_FIXTURE.tasks,
        page: 1,
        pageSize: 1,
        total: 2,
      },
      response: { ok: true, status: 200 },
    });
    const user = userEvent.setup();
    setup();

    expect(
      await screen.findByRole("button", {
        name: "Confirm venue accessibility plan",
      }),
    ).toBeVisible();
    await user.click(screen.getByRole("button", { name: "Next" }));

    expect(get).toHaveBeenLastCalledWith(
      "/api/v1/tasks",
      expect.objectContaining({ params: { query: { page: 2, pageSize: 25 } } }),
    );
  });

  it("keeps filters in the API query instead of using fixture-only data", async () => {
    get.mockResolvedValue({
      data: { items: [], page: 1, pageSize: 25, total: 0 },
      response: { ok: true, status: 200 },
    });
    const user = userEvent.setup();
    setup();

    await screen.findByText("No tasks yet");
    await user.type(screen.getByLabelText("Search tasks"), "venue");

    expect(get).toHaveBeenLastCalledWith(
      "/api/v1/tasks",
      expect.objectContaining({
        params: { query: { page: 1, pageSize: 25, search: "venue" } },
      }),
    );
  });
});
