import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";

import type { CurrentAccess } from "@/features/auth/api/access-queries";

import { TASK_WORKSPACE_FIXTURE } from "../lib/task-fixtures";
import type { Task, TaskPerson } from "../lib/tasks-types";
import {
  CreateTaskDialog,
  type AssignableDepartment,
} from "./create-task-dialog";
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

afterEach(() => vi.resetAllMocks());

const person = (id: string, first: string, last: string): TaskPerson => ({
  id,
  email: `${first.toLowerCase()}@example.com`,
  firstName: first,
  lastName: last,
});

const ADMIN = person("admin-1", "Alex", "Coordinator");
const OTHER_ADMIN = person("admin-2", "Ola", "Other");
const MANAGER = person("manager-1", "Dana", "Okafor");
const SUPER_ADMIN = person("super-1", "Sydney", "Root");
const MEMBER = {
  ...person("member-1", "Robin", "Doer"),
  assignedAt: "2026-09-12T09:00:00.000Z",
};

function underReview(overrides: Partial<Task> = {}): Task {
  return {
    ...TASK_WORKSPACE_FIXTURE.tasks[0]!,
    status: "UNDER_REVIEW",
    createdBy: ADMIN,
    reportTo: ADMIN,
    assignees: [MEMBER],
    ...overrides,
  };
}

function renderManager(access: CurrentAccess, task: Task) {
  get.mockImplementation((url: string) => {
    if (url === "/api/v1/tasks")
      return Promise.resolve({
        data: { items: [task], page: 1, pageSize: 25, total: 1 },
        response: { status: 200 },
      });
    if (url === "/api/v1/tasks/{id}")
      return Promise.resolve({ data: task, response: { status: 200 } });
    return Promise.resolve({
      data: { items: [], page: 1, pageSize: 100, total: 0 },
      response: { status: 200 },
    });
  });
  render(
    <QueryClientProvider
      client={
        new QueryClient({ defaultOptions: { queries: { retry: false } } })
      }
    >
      <TasksManager access={access} />
    </QueryClientProvider>,
  );
}

async function openDetail(task: Task) {
  const user = userEvent.setup();
  await user.click(
    await screen.findByRole("button", { name: `Open ${task.title}` }),
  );
  await screen.findByRole("dialog");
  return user;
}

const adminAccess = {
  userId: ADMIN.id,
  role: "ADMIN",
  grants: [
    { permissionKey: "task.read", scope: "ORGANIZATION" },
    { permissionKey: "task.update", scope: "ORGANIZATION" },
    { permissionKey: "task.assign", scope: "ORGANIZATION" },
    { permissionKey: "task.review", scope: "ORGANIZATION" },
  ],
} as CurrentAccess;

describe("review authority follows the task's reporting recipient", () => {
  it("lets the recipient Admin approve work reporting to them", async () => {
    const task = underReview();
    renderManager(adminAccess, task);
    await openDetail(task);
    expect(screen.getByRole("button", { name: "Approve" })).toBeVisible();
  });

  it("hides the review panel from an Admin who is not the recipient, despite organization scope", async () => {
    const task = underReview({ createdBy: SUPER_ADMIN, reportTo: SUPER_ADMIN });
    renderManager(adminAccess, task);
    await openDetail(task);
    expect(
      screen.queryByRole("button", { name: "Approve" }),
    ).not.toBeInTheDocument();
  });

  it("does not widen review of tasks that predate recipients to Admin", async () => {
    const task = underReview({ reportTo: null, createdBy: SUPER_ADMIN });
    renderManager(adminAccess, task);
    await openDetail(task);
    expect(
      screen.queryByRole("button", { name: "Approve" }),
    ).not.toBeInTheDocument();
  });

  it("keeps a Department Manager out of work reporting to Admin, even for their own department's task", async () => {
    const managerAccess = {
      userId: MANAGER.id,
      role: "DEPARTMENT_MANAGER",
      grants: [
        { permissionKey: "task.read", scope: "DEPARTMENT" },
        { permissionKey: "task.review", scope: "DEPARTMENT" },
      ],
    } as CurrentAccess;
    const task = underReview({ createdBy: MANAGER, reportTo: ADMIN });
    renderManager(managerAccess, task);
    await openDetail(task);
    expect(
      screen.queryByRole("button", { name: "Approve" }),
    ).not.toBeInTheDocument();
  });

  it("lets a Department Manager review work that reports to them", async () => {
    const managerAccess = {
      userId: MANAGER.id,
      role: "DEPARTMENT_MANAGER",
      grants: [
        { permissionKey: "task.read", scope: "DEPARTMENT" },
        { permissionKey: "task.review", scope: "DEPARTMENT" },
      ],
    } as CurrentAccess;
    const task = underReview({ createdBy: MANAGER, reportTo: MANAGER });
    renderManager(managerAccess, task);
    await openDetail(task);
    expect(screen.getByRole("button", { name: "Approve" })).toBeVisible();
  });

  it("does not let Super Admin approve a task it does not designate", async () => {
    const superAccess = {
      userId: SUPER_ADMIN.id,
      role: "SUPER_ADMIN",
      grants: [
        { permissionKey: "task.read", scope: "ORGANIZATION" },
        { permissionKey: "task.review", scope: "ORGANIZATION" },
      ],
    } as CurrentAccess;
    const task = underReview({ reportTo: OTHER_ADMIN });
    renderManager(superAccess, task);
    await openDetail(task);
    expect(
      screen.queryByRole("button", { name: "Approve" }),
    ).not.toBeInTheDocument();
  });
  it("never offers an assignee the review of their own work", async () => {
    const selfAccess = {
      ...adminAccess,
      userId: MEMBER.id,
    } as CurrentAccess;
    const task = underReview({ reportTo: MEMBER });
    renderManager(selfAccess, task);
    await openDetail(task);
    expect(
      screen.queryByRole("button", { name: "Approve" }),
    ).not.toBeInTheDocument();
  });
});

describe("task people section and recipient filter", () => {
  it("shows who created the task and who it reports to, marking the viewer", async () => {
    const task = underReview();
    renderManager(adminAccess, task);
    await openDetail(task);
    expect(screen.getByRole("heading", { name: "People" })).toBeVisible();
    expect(screen.getByText("Reports to")).toBeVisible();
    expect(screen.getByText(/Alex Coordinator \(you\)/)).toBeVisible();
  });

  it("labels tasks that predate recipients instead of guessing one", async () => {
    const task = underReview({ reportTo: null });
    renderManager(adminAccess, task);
    await openDetail(task);
    expect(
      screen.getByText(/Not set \(task from before recipients\)/),
    ).toBeVisible();
  });

  it("sends the viewer's id when filtering to tasks reporting to them", async () => {
    const task = underReview();
    renderManager(adminAccess, task);
    const user = userEvent.setup();
    await screen.findByRole("button", { name: `Open ${task.title}` });
    await user.click(screen.getByRole("button", { name: "Reporting to Me" }));
    await waitFor(() =>
      expect(get).toHaveBeenLastCalledWith(
        "/api/v1/tasks",
        expect.objectContaining({
          params: {
            query: expect.objectContaining({ reportToId: ADMIN.id }),
          },
        }),
      ),
    );
  });
});

describe("create task dialog - Reports to", () => {
  const departments: AssignableDepartment[] = [
    { id: "dept-1", name: "Production" },
  ];

  function renderDialog(withRecipients: boolean) {
    const onCreate = vi.fn(() => Promise.resolve(underReview()));
    const loadEligibleRecipients = vi.fn(() =>
      Promise.resolve([ADMIN, OTHER_ADMIN]),
    );
    render(
      <QueryClientProvider
        client={
          new QueryClient({ defaultOptions: { queries: { retry: false } } })
        }
      >
        <CreateTaskDialog
          open
          onOpenChange={vi.fn()}
          departments={departments}
          departmentLocked={false}
          loadEligibleAssignees={() => Promise.resolve([MEMBER])}
          {...(withRecipients ? { loadEligibleRecipients } : {})}
          onCreate={onCreate}
          onUploadAttachment={() => Promise.resolve()}
          onCreated={vi.fn()}
        />
      </QueryClientProvider>,
    );
    return { onCreate, loadEligibleRecipients };
  }

  async function fillRequired(user: ReturnType<typeof userEvent.setup>) {
    await user.type(screen.getByLabelText("Task name *"), "Plan the launch");
    await user.click(screen.getByRole("combobox", { name: "Department" }));
    await user.click(await screen.findByRole("option", { name: "Production" }));
    await user.click(screen.getByRole("combobox", { name: "Assigned person" }));
    await user.click(await screen.findByRole("option", { name: "Robin Doer" }));
    await user.type(screen.getByLabelText("Description *"), "Details.");
    await user.type(screen.getByLabelText("Target date *"), "2026-12-01");
  }

  it("is not offered to anyone but Super Admin", () => {
    renderDialog(false);
    expect(
      screen.queryByRole("combobox", { name: "Reports to" }),
    ).not.toBeInTheDocument();
  });

  it("defaults to the creator and sends no recipient unless one is chosen", async () => {
    const user = userEvent.setup();
    const { onCreate } = renderDialog(true);
    await fillRequired(user);
    expect(
      screen.getByRole("combobox", { name: "Reports to" }),
    ).toHaveTextContent("Me (default)");
    await user.click(screen.getByRole("button", { name: "Create task" }));
    await waitFor(() => expect(onCreate).toHaveBeenCalled());
    const [values] = onCreate.mock.calls[0] as unknown as [
      { reportToId?: string },
    ];
    expect(values.reportToId ?? "").toBe("");
  });

  it("sends the chosen recipient", async () => {
    const user = userEvent.setup();
    const { onCreate, loadEligibleRecipients } = renderDialog(true);
    await fillRequired(user);
    await waitFor(() =>
      expect(loadEligibleRecipients).toHaveBeenCalledWith(
        "dept-1",
        expect.anything(),
      ),
    );
    await user.click(screen.getByRole("combobox", { name: "Reports to" }));
    await user.click(await screen.findByRole("option", { name: "Ola Other" }));
    await user.click(screen.getByRole("button", { name: "Create task" }));
    await waitFor(() =>
      expect(onCreate).toHaveBeenCalledWith(
        expect.objectContaining({ reportToId: OTHER_ADMIN.id }),
      ),
    );
  });
});

describe("task list - details links and the reviewer-needed filter", () => {
  it("links a task title to its details page instead of opening the popup", async () => {
    const task = underReview();
    renderManager(adminAccess, task);
    const link = await screen.findByRole("link", { name: task.title });
    expect(link).toHaveAttribute("href", `/tasks/${task.id}`);
  });

  it("sends the reviewer-needed filter to the server when it is turned on", async () => {
    const task = underReview();
    renderManager(adminAccess, task);
    const user = userEvent.setup();
    await screen.findByRole("link", { name: task.title });
    await user.click(screen.getByRole("button", { name: "Reviewer needed" }));
    await waitFor(() =>
      expect(get).toHaveBeenLastCalledWith(
        "/api/v1/tasks",
        expect.objectContaining({
          params: {
            query: expect.objectContaining({ reviewerUnresolved: true }),
          },
        }),
      ),
    );
  });
});
