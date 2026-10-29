import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";

import type { CurrentAccess } from "@/features/auth/api/access-queries";

import { TASK_WORKSPACE_FIXTURE } from "../lib/task-fixtures";
import { TasksManager } from "./tasks-manager";

const { get, post } = vi.hoisted(() => ({ get: vi.fn(), post: vi.fn() }));
vi.mock("@/lib/api/browser", () => ({
  browserApi: {
    GET: get,
    POST: post,
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

  it("toggles My Tasks and Overdue and sends the matching assignee/overdue filters", async () => {
    get.mockResolvedValue({
      data: { items: [], page: 1, pageSize: 25, total: 0 },
      response: { ok: true, status: 200 },
    });
    const user = userEvent.setup();
    setup();

    await screen.findByText("No tasks yet");
    await user.click(screen.getByRole("button", { name: "My Tasks" }));

    expect(get).toHaveBeenLastCalledWith(
      "/api/v1/tasks",
      expect.objectContaining({
        params: {
          query: { page: 1, pageSize: 25, assigneeId: access.userId },
        },
      }),
    );

    await user.click(screen.getByRole("button", { name: "Overdue" }));
    expect(get).toHaveBeenLastCalledWith(
      "/api/v1/tasks",
      expect.objectContaining({
        params: {
          query: {
            page: 1,
            pageSize: 25,
            assigneeId: access.userId,
            overdue: true,
          },
        },
      }),
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

  it("offers a New task action to a Department Manager and opens the create dialog", async () => {
    get.mockImplementation((url: string) => {
      if (url === "/api/v1/tasks") {
        return Promise.resolve({
          data: { items: [], page: 1, pageSize: 25, total: 0 },
          response: { status: 200 },
        });
      }
      if (url === "/api/v1/departments") {
        return Promise.resolve({
          data: { items: [{ id: "dept-1", name: "Event Management" }] },
          response: { status: 200 },
        });
      }
      return Promise.resolve({
        data: { items: [] },
        response: { status: 200 },
      });
    });
    const user = userEvent.setup();
    const managerAccess = {
      userId: "account-2",
      grants: [
        { permissionKey: "task.read", scope: "DEPARTMENT" },
        { permissionKey: "task.create", scope: "DEPARTMENT" },
        { permissionKey: "task.assign", scope: "DEPARTMENT" },
      ],
    } as CurrentAccess;
    const client = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    });
    render(
      <QueryClientProvider client={client}>
        <TasksManager access={managerAccess} />
      </QueryClientProvider>,
    );

    await screen.findByText("No tasks yet");
    await user.click(screen.getByRole("button", { name: "New task" }));

    expect(
      await screen.findByRole("heading", { name: "New task" }),
    ).toBeVisible();
    // Locked to their own department - only one option, and it is not editable.
    expect(screen.getByRole("combobox", { name: "Department" })).toBeDisabled();
  });

  it("shows a top-level task's subtasks and lets an assigner open the add-subtask dialog", async () => {
    const task = TASK_WORKSPACE_FIXTURE.tasks[0]!;
    const emptyPage = {
      data: { items: [], page: 1, pageSize: 100, total: 0 },
      response: { status: 200 },
    };
    get.mockImplementation(
      (
        url: string,
        options?: { params?: { query?: { parentTaskId?: string } } },
      ) => {
        if (url === "/api/v1/tasks") {
          if (options?.params?.query?.parentTaskId) {
            return Promise.resolve(emptyPage);
          }
          return Promise.resolve({
            data: { items: [task], page: 1, pageSize: 25, total: 1 },
            response: { status: 200 },
          });
        }
        if (url === "/api/v1/tasks/{id}") {
          return Promise.resolve({ data: task, response: { status: 200 } });
        }
        return Promise.resolve(emptyPage);
      },
    );
    const user = userEvent.setup();
    const managerAccess = {
      userId: "account-2",
      grants: [
        { permissionKey: "task.read", scope: "DEPARTMENT" },
        { permissionKey: "task.assign", scope: "DEPARTMENT" },
      ],
    } as CurrentAccess;
    render(
      <QueryClientProvider
        client={
          new QueryClient({ defaultOptions: { queries: { retry: false } } })
        }
      >
        <TasksManager access={managerAccess} />
      </QueryClientProvider>,
    );

    await user.click(await screen.findByRole("button", { name: task.title }));

    expect(
      await screen.findByRole("heading", { name: "Subtasks" }),
    ).toBeVisible();
    expect(screen.getByText("No subtasks yet.")).toBeVisible();

    await user.click(screen.getByRole("button", { name: "Add subtask" }));

    expect(
      await screen.findByRole("heading", { name: "New subtask" }),
    ).toBeVisible();
    expect(screen.getByRole("combobox", { name: "Department" })).toBeDisabled();
  });

  it("hides the assignee-only self-report controls from a Manager who created but is not assigned to the task", async () => {
    const managerAccess = {
      userId: "manager-1",
      grants: [
        { permissionKey: "task.read", scope: "DEPARTMENT" },
        { permissionKey: "task.update", scope: "DEPARTMENT" },
        { permissionKey: "task.update_status", scope: "SELF" },
        { permissionKey: "task.update_progress", scope: "SELF" },
        { permissionKey: "task.submit", scope: "SELF" },
      ],
    } as CurrentAccess;
    const task = {
      ...TASK_WORKSPACE_FIXTURE.tasks[0]!,
      status: "IN_PROGRESS",
      createdBy: {
        id: managerAccess.userId,
        email: "manager@example.com",
        firstName: "Manager",
        lastName: "One",
      },
      assignees: [
        {
          id: "someone-else",
          email: "other@example.com",
          firstName: "Other",
          lastName: "Person",
          assignedAt: "2026-09-12T09:00:00.000Z",
        },
      ],
      checklistItems: [
        {
          id: "item-1",
          description: "Confirm venue permits",
          completed: false,
          position: 0,
          completedBy: null,
          completedAt: null,
          createdBy: null,
          createdAt: "2026-09-12T09:00:00.000Z",
          updatedAt: "2026-09-12T09:00:00.000Z",
        },
      ],
    };
    const emptyPage = {
      data: { items: [], page: 1, pageSize: 100, total: 0 },
      response: { status: 200 },
    };
    get.mockImplementation((url: string) => {
      if (url === "/api/v1/tasks") {
        return Promise.resolve({
          data: { items: [task], page: 1, pageSize: 25, total: 1 },
          response: { status: 200 },
        });
      }
      if (url === "/api/v1/tasks/{id}") {
        return Promise.resolve({ data: task, response: { status: 200 } });
      }
      return Promise.resolve(emptyPage);
    });
    const user = userEvent.setup();
    render(
      <QueryClientProvider
        client={
          new QueryClient({ defaultOptions: { queries: { retry: false } } })
        }
      >
        <TasksManager access={managerAccess} />
      </QueryClientProvider>,
    );

    await user.click(await screen.findByRole("button", { name: task.title }));
    const dialog = await screen.findByRole("dialog");
    expect(dialog).toBeVisible();

    // The Manager created this task but is not its assignee - the
    // assignee-only self-report controls must not be usable.
    expect(
      screen.queryByRole("button", { name: /Move to/ }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "Submit for review" }),
    ).not.toBeInTheDocument();
    expect(
      screen.getByRole("checkbox", {
        name: 'Mark "Confirm venue permits" complete',
      }),
    ).toBeDisabled();
  });

  it("hides assignee management from a Manager who is only this task's assignee, not its creator", async () => {
    const managerAccess = {
      userId: "manager-1",
      grants: [
        { permissionKey: "task.read", scope: "DEPARTMENT" },
        { permissionKey: "task.assign", scope: "DEPARTMENT" },
      ],
    } as CurrentAccess;
    const task = {
      ...TASK_WORKSPACE_FIXTURE.tasks[0]!,
      createdBy: {
        id: "super-admin-1",
        email: "admin@example.com",
        firstName: "Ada",
        lastName: "Admin",
      },
      assignees: [
        {
          id: managerAccess.userId,
          email: "manager@example.com",
          firstName: "Manager",
          lastName: "One",
          assignedAt: "2026-09-12T09:00:00.000Z",
        },
      ],
    };
    const emptyPage = {
      data: { items: [], page: 1, pageSize: 100, total: 0 },
      response: { status: 200 },
    };
    get.mockImplementation((url: string) => {
      if (url === "/api/v1/tasks") {
        return Promise.resolve({
          data: { items: [task], page: 1, pageSize: 25, total: 1 },
          response: { status: 200 },
        });
      }
      if (url === "/api/v1/tasks/{id}") {
        return Promise.resolve({ data: task, response: { status: 200 } });
      }
      return Promise.resolve(emptyPage);
    });
    const user = userEvent.setup();
    render(
      <QueryClientProvider
        client={
          new QueryClient({ defaultOptions: { queries: { retry: false } } })
        }
      >
        <TasksManager access={managerAccess} />
      </QueryClientProvider>,
    );

    await user.click(await screen.findByRole("button", { name: task.title }));
    await screen.findByRole("dialog");

    // Super Admin created and assigned this task to the Manager already -
    // the Manager manages assignment only through subtasks, not by
    // editing who else is assigned to a task someone else created.
    expect(
      screen.queryByRole("button", { name: "Remove" }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole("combobox", { name: "Add assignee" }),
    ).not.toBeInTheDocument();
  });

  it("still shows assignee management to a Manager on a task they created themselves", async () => {
    const managerAccess = {
      userId: "manager-1",
      grants: [
        { permissionKey: "task.read", scope: "DEPARTMENT" },
        { permissionKey: "task.assign", scope: "DEPARTMENT" },
      ],
    } as CurrentAccess;
    const task = {
      ...TASK_WORKSPACE_FIXTURE.tasks[0]!,
      createdBy: {
        id: managerAccess.userId,
        email: "manager@example.com",
        firstName: "Manager",
        lastName: "One",
      },
      assignees: [],
    };
    const emptyPage = {
      data: { items: [], page: 1, pageSize: 100, total: 0 },
      response: { status: 200 },
    };
    get.mockImplementation((url: string) => {
      if (url === "/api/v1/tasks") {
        return Promise.resolve({
          data: { items: [task], page: 1, pageSize: 25, total: 1 },
          response: { status: 200 },
        });
      }
      if (url === "/api/v1/tasks/{id}") {
        return Promise.resolve({ data: task, response: { status: 200 } });
      }
      return Promise.resolve(emptyPage);
    });
    const user = userEvent.setup();
    render(
      <QueryClientProvider
        client={
          new QueryClient({ defaultOptions: { queries: { retry: false } } })
        }
      >
        <TasksManager access={managerAccess} />
      </QueryClientProvider>,
    );

    await user.click(await screen.findByRole("button", { name: task.title }));
    await screen.findByRole("dialog");

    expect(
      screen.getByRole("combobox", { name: "Add assignee" }),
    ).toBeInTheDocument();
  });

  it("hides checklist-add and review controls from a Manager who is only this task's assignee, not its creator", async () => {
    const managerAccess = {
      userId: "manager-1",
      grants: [
        { permissionKey: "task.read", scope: "DEPARTMENT" },
        { permissionKey: "task.update", scope: "DEPARTMENT" },
        { permissionKey: "task.review", scope: "DEPARTMENT" },
      ],
    } as CurrentAccess;
    const task = {
      ...TASK_WORKSPACE_FIXTURE.tasks[0]!,
      status: "UNDER_REVIEW" as const,
      createdBy: {
        id: "super-admin-1",
        email: "admin@example.com",
        firstName: "Ada",
        lastName: "Admin",
      },
      assignees: [
        {
          id: managerAccess.userId,
          email: "manager@example.com",
          firstName: "Manager",
          lastName: "One",
          assignedAt: "2026-09-12T09:00:00.000Z",
        },
      ],
    };
    const emptyPage = {
      data: { items: [], page: 1, pageSize: 100, total: 0 },
      response: { status: 200 },
    };
    get.mockImplementation((url: string) => {
      if (url === "/api/v1/tasks") {
        return Promise.resolve({
          data: { items: [task], page: 1, pageSize: 25, total: 1 },
          response: { status: 200 },
        });
      }
      if (url === "/api/v1/tasks/{id}") {
        return Promise.resolve({ data: task, response: { status: 200 } });
      }
      return Promise.resolve(emptyPage);
    });
    const user = userEvent.setup();
    render(
      <QueryClientProvider
        client={
          new QueryClient({ defaultOptions: { queries: { retry: false } } })
        }
      >
        <TasksManager access={managerAccess} />
      </QueryClientProvider>,
    );

    await user.click(await screen.findByRole("button", { name: task.title }));
    await screen.findByRole("dialog");

    // Super Admin created this task and assigned it to the Manager - the
    // Manager is merely its assignee, not its creator, so neither adding a
    // checkpoint nor recording a review decision is theirs to do, even
    // though they hold task.update/task.review at DEPARTMENT scope.
    expect(
      screen.queryByLabelText("New checkpoint description"),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "Add checkpoint" }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "Approve" }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "Request changes" }),
    ).not.toBeInTheDocument();
  });

  it("still shows checklist-add and review controls to a Manager on a task they created themselves", async () => {
    const managerAccess = {
      userId: "manager-1",
      grants: [
        { permissionKey: "task.read", scope: "DEPARTMENT" },
        { permissionKey: "task.update", scope: "DEPARTMENT" },
        { permissionKey: "task.review", scope: "DEPARTMENT" },
      ],
    } as CurrentAccess;
    const task = {
      ...TASK_WORKSPACE_FIXTURE.tasks[0]!,
      status: "UNDER_REVIEW" as const,
      createdBy: {
        id: managerAccess.userId,
        email: "manager@example.com",
        firstName: "Manager",
        lastName: "One",
      },
      assignees: [],
    };
    const emptyPage = {
      data: { items: [], page: 1, pageSize: 100, total: 0 },
      response: { status: 200 },
    };
    get.mockImplementation((url: string) => {
      if (url === "/api/v1/tasks") {
        return Promise.resolve({
          data: { items: [task], page: 1, pageSize: 25, total: 1 },
          response: { status: 200 },
        });
      }
      if (url === "/api/v1/tasks/{id}") {
        return Promise.resolve({ data: task, response: { status: 200 } });
      }
      return Promise.resolve(emptyPage);
    });
    const user = userEvent.setup();
    render(
      <QueryClientProvider
        client={
          new QueryClient({ defaultOptions: { queries: { retry: false } } })
        }
      >
        <TasksManager access={managerAccess} />
      </QueryClientProvider>,
    );

    await user.click(await screen.findByRole("button", { name: task.title }));
    await screen.findByRole("dialog");

    expect(
      screen.getByLabelText("New checkpoint description"),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Add checkpoint" }),
    ).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Approve" })).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Request changes" }),
    ).toBeInTheDocument();
  });

  it("cancels a task from the list row's Action column after confirming", async () => {
    const managerAccess = {
      userId: "manager-1",
      grants: [
        { permissionKey: "task.read", scope: "DEPARTMENT" },
        { permissionKey: "task.update_status", scope: "SELF" },
      ],
    } as CurrentAccess;
    const task = {
      ...TASK_WORKSPACE_FIXTURE.tasks[0]!,
      status: "TODO" as const,
      assignees: [
        {
          id: managerAccess.userId,
          email: "manager@example.com",
          firstName: "Manager",
          lastName: "One",
          assignedAt: "2026-09-12T09:00:00.000Z",
        },
      ],
    };
    get.mockImplementation((url: string) => {
      if (url === "/api/v1/tasks") {
        return Promise.resolve({
          data: { items: [task], page: 1, pageSize: 25, total: 1 },
          response: { status: 200 },
        });
      }
      return Promise.resolve({
        data: { items: [], page: 1, pageSize: 100, total: 0 },
        response: { status: 200 },
      });
    });
    post.mockImplementation((url: string) => {
      if (url === "/api/v1/tasks/{id}/transition") {
        return Promise.resolve({
          data: { ...task, status: "CANCELLED" },
          response: { status: 200 },
        });
      }
      return Promise.resolve({ data: undefined, response: { status: 404 } });
    });
    const user = userEvent.setup();
    render(
      <QueryClientProvider
        client={
          new QueryClient({ defaultOptions: { queries: { retry: false } } })
        }
      >
        <TasksManager access={managerAccess} />
      </QueryClientProvider>,
    );

    await user.click(
      await screen.findByRole("button", { name: `Cancel ${task.title}` }),
    );
    await screen.findByRole("heading", { name: "Cancel task?" });
    await user.click(screen.getByRole("button", { name: "Cancel task" }));

    expect(post).toHaveBeenCalledWith(
      "/api/v1/tasks/{id}/transition",
      expect.objectContaining({
        params: { path: { id: task.id } },
        body: { status: "CANCELLED" },
      }),
    );
  });

});
