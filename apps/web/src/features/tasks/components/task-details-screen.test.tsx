import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";

import type { CurrentAccess } from "@/features/auth/api/access-queries";

import * as gateway from "../api/tasks-gateway";
import { TASK_WORKSPACE_FIXTURE } from "../lib/task-fixtures";
import {
  TASK_STATUS_LABELS,
  type Task,
  type TaskActivity,
  type TaskPerson,
} from "../lib/tasks-types";

import { TaskDetailsScreen, activityLine } from "./task-details-screen";

const access = vi.hoisted(() => ({ current: null as unknown }));

vi.mock("@/features/auth/api/access-queries", () => ({
  accessKey: ["access"],
  useCurrentAccess: () => ({
    isPending: false,
    isError: false,
    data: access.current,
  }),
}));

vi.mock("../api/tasks-gateway", () => ({
  getTaskCollaboration: vi.fn(),
  getTaskReviewHistory: vi.fn(),
  listTasks: vi.fn(),
  getTaskFileDownloadGrant: vi.fn(),
  reviewTask: vi.fn(),
  transitionTask: vi.fn(),
  submitTask: vi.fn(),
  createTaskComment: vi.fn(),
  updateTask: vi.fn(),
  setTaskReportTo: vi.fn(),
  listEligibleRecipients: vi.fn(),
  uploadTaskFile: vi.fn(),
}));

vi.mock("@/features/events/api/events-gateway", () => ({
  listEvents: () =>
    Promise.resolve({ items: [{ id: "event-1", name: "Addis Live 2026" }] }),
}));

vi.mock("@/features/campaigns/api/campaigns-gateway", () => ({
  listCampaigns: () =>
    Promise.resolve({ items: [{ id: "campaign-1", name: "Citywide launch" }] }),
}));

afterEach(() => vi.resetAllMocks());

const person = (id: string, first: string, last: string): TaskPerson => ({
  id,
  email: `${first.toLowerCase()}@example.com`,
  firstName: first,
  lastName: last,
});
const CREATOR = person("creator-1", "Alex", "Coordinator");
const ASSIGNEE = {
  ...person("member-1", "Robin", "Doer"),
  assignedAt: "2026-09-12T09:00:00.000Z",
};

function taskWith(overrides: Partial<Task> = {}): Task {
  return {
    ...TASK_WORKSPACE_FIXTURE.tasks[0]!,
    identifier: "TSK-042",
    status: "TODO",
    createdBy: CREATOR,
    reportTo: CREATOR,
    assignees: [ASSIGNEE],
    reviewerUnresolved: false,
    parentTask: null,
    relatedEvent: null,
    relatedCampaign: null,
    ...overrides,
  };
}

function givenAccess(
  role: string,
  grants: Array<[string, string]>,
  userId: string,
) {
  access.current = {
    userId,
    role,
    department: null,
    grants: grants.map(([permissionKey, scope]) => ({ permissionKey, scope })),
  } as CurrentAccess;
}

function renderDetails(task: Task, activity: TaskActivity[] = []) {
  vi.mocked(gateway.getTaskCollaboration).mockResolvedValue({
    task,
    comments: [],
    activity,
    reviews: [],
    files: [],
  } as never);
  vi.mocked(gateway.getTaskReviewHistory).mockResolvedValue([]);
  vi.mocked(gateway.listTasks).mockResolvedValue({
    items: [],
    page: 1,
    pageSize: 100,
    total: 0,
  } as never);
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  render(
    <QueryClientProvider client={client}>
      <TaskDetailsScreen taskId={task.id} />
    </QueryClientProvider>,
  );
}

describe("task details page", () => {
  it("shows the task read-only by default with its identifier, and offers Edit only to people who may edit", async () => {
    givenAccess(
      "SUPER_ADMIN",
      [
        ["task.read", "ORGANIZATION"],
        ["task.update", "ORGANIZATION"],
      ],
      "creator-1",
    );
    renderDetails(taskWith());
    expect(
      await screen.findByRole("heading", { name: taskWith().title }),
    ).toBeVisible();
    expect(screen.getByText("TSK-042")).toBeVisible();
    expect(screen.getByRole("button", { name: "Edit" })).toBeVisible();
    expect(
      screen.queryByRole("form", { name: "Edit task" }),
    ).not.toBeInTheDocument();
  });

  it("hides Edit from a Department Member who is only assigned", async () => {
    givenAccess("DEPARTMENT_MEMBER", [["task.read", "SELF"]], "member-1");
    renderDetails(taskWith());
    await screen.findByRole("heading", { name: taskWith().title });
    expect(
      screen.queryByRole("button", { name: "Edit" }),
    ).not.toBeInTheDocument();
  });

  it("links a subtask to its parent by identifier and title", async () => {
    givenAccess("SUPER_ADMIN", [["task.read", "ORGANIZATION"]], "creator-1");
    renderDetails(
      taskWith({
        parentTask: {
          id: "parent-1",
          identifier: "TSK-007",
          title: "Launch plan",
          status: "IN_PROGRESS",
        },
      }),
    );
    const link = await screen.findByRole("link", {
      name: "TSK-007 · Launch plan",
    });
    expect(link).toHaveAttribute("href", "/tasks/parent-1");
  });

  it("gives review only to the designated reviewer, and needs feedback to request changes", async () => {
    givenAccess(
      "DEPARTMENT_MANAGER",
      [
        ["task.read", "DEPARTMENT"],
        ["task.review", "DEPARTMENT"],
      ],
      "creator-1",
    );
    renderDetails(taskWith({ status: "UNDER_REVIEW" }));
    expect(
      await screen.findByRole("button", { name: "Approve" }),
    ).toBeVisible();
    expect(
      screen.getByRole("button", { name: "Request changes" }),
    ).toBeDisabled();
  });

  it("does not offer approval to Super Admin when someone else is the designated reviewer", async () => {
    givenAccess(
      "SUPER_ADMIN",
      [
        ["task.read", "ORGANIZATION"],
        ["task.review", "ORGANIZATION"],
      ],
      "super-1",
    );
    renderDetails(taskWith({ status: "UNDER_REVIEW" }));
    await screen.findByRole("heading", { name: taskWith().title });
    expect(
      screen.queryByRole("button", { name: "Approve" }),
    ).not.toBeInTheDocument();
    expect(screen.getByText(/Awaiting review by/)).toBeVisible();
  });
});

describe("activity sentences", () => {
  const entry = (
    type: TaskActivity["type"],
    details: Record<string, unknown> = {},
  ): TaskActivity =>
    ({
      id: "a",
      type,
      actor: null,
      occurredAt: "2026-10-01T00:00:00.000Z",
      details,
    }) as TaskActivity;

  it("states the review note that was recorded with a decision", () => {
    expect(
      activityLine(
        entry("REVIEW_RECORDED", {
          outcome: "CHANGES_REQUESTED",
          note: "Add the permit",
        }),
      ),
    ).toBe('requested changes: "Add the permit"');
  });

  it("describes a status change with its real from and to values", () => {
    expect(
      activityLine(
        entry("STATUS_CHANGED", { from: "TODO", to: "IN_PROGRESS" }),
      ),
    ).toBe(
      `changed the status from ${TASK_STATUS_LABELS.TODO} to ${TASK_STATUS_LABELS.IN_PROGRESS}`,
    );
  });

  it("keeps an unknown recorded type truthful instead of inventing text", () => {
    expect(activityLine(entry("SOMETHING_NEW" as TaskActivity["type"]))).toBe(
      "something new",
    );
  });
});

describe("stage 1 - reviewer change, status moves, edit, attachments", () => {
  const TASK_ID = taskWith().id;
  const SA: [string, Array<[string, string]>, string] = [
    "SUPER_ADMIN",
    [
      ["task.read", "ORGANIZATION"],
      ["task.update", "ORGANIZATION"],
      ["task.update_status", "ORGANIZATION"],
      ["task.review", "ORGANIZATION"],
      ["task.attachment.create", "ORGANIZATION"],
    ],
    "super-1",
  ];

  it("lets only Super Admin change the reviewer, and requires a reason before it is enabled", async () => {
    vi.mocked(gateway.listEligibleRecipients).mockResolvedValue([
      person("admin-2", "Ola", "Other"),
    ]);
    vi.mocked(gateway.setTaskReportTo).mockResolvedValue(taskWith());
    givenAccess(...SA);
    renderDetails(taskWith({ departmentId: "dept-1" }));
    expect(
      await screen.findByRole("heading", { name: "Change reviewer" }),
    ).toBeVisible();
    expect(screen.getByText(/Current reviewer:/)).toHaveTextContent(
      "Alex Coordinator",
    );
    const submit = screen.getByRole("button", { name: "Change reviewer" });
    expect(submit).toBeDisabled();
    const user = userEvent.setup();
    await user.click(screen.getByRole("combobox", { name: "New reviewer" }));
    await user.click(await screen.findByRole("option", { name: "Ola Other" }));
    expect(submit).toBeDisabled();
    await user.type(
      screen.getByLabelText("Reason (required)"),
      "Covering leave",
    );
    await user.click(submit);
    await waitFor(() =>
      expect(gateway.setTaskReportTo).toHaveBeenCalledWith(
        TASK_ID,
        "admin-2",
        "Covering leave",
      ),
    );
  });

  it("does not show the reviewer change to anyone but Super Admin", async () => {
    givenAccess(
      "ADMIN",
      [
        ["task.read", "ORGANIZATION"],
        ["task.update", "ORGANIZATION"],
      ],
      "admin-1",
    );
    renderDetails(taskWith());
    await screen.findByRole("heading", { name: taskWith().title });
    expect(
      screen.queryByRole("heading", { name: "Change reviewer" }),
    ).not.toBeInTheDocument();
  });

  it("offers only the status moves valid from the current status", async () => {
    givenAccess(...SA);
    renderDetails(taskWith({ status: "TODO" }));
    expect(
      await screen.findByRole("button", { name: "Move to In progress" }),
    ).toBeVisible();
    expect(
      screen.getByRole("button", { name: "Move to Blocked" }),
    ).toBeVisible();
    expect(
      screen.queryByRole("button", { name: "Move to Completed" }),
    ).not.toBeInTheDocument();
  });

  it("offers no status moves once a task is under review", async () => {
    givenAccess(...SA);
    renderDetails(taskWith({ status: "UNDER_REVIEW" }));
    await screen.findByRole("heading", { name: taskWith().title });
    expect(
      screen.queryByRole("button", { name: /^Move to/ }),
    ).not.toBeInTheDocument();
  });

  it("opens the edit form with related pickers and saves the chosen related event", async () => {
    vi.mocked(gateway.updateTask).mockResolvedValue(taskWith());
    givenAccess(...SA);
    renderDetails(taskWith());
    const user = userEvent.setup();
    await user.click(await screen.findByRole("button", { name: "Edit" }));
    expect(screen.getByRole("form", { name: "Edit task" })).toBeVisible();
    await user.click(screen.getByRole("combobox", { name: "Related event" }));
    await user.click(
      await screen.findByRole("option", { name: "Addis Live 2026" }),
    );
    await user.click(screen.getByRole("button", { name: "Save changes" }));
    await waitFor(() =>
      expect(gateway.updateTask).toHaveBeenCalledWith(
        TASK_ID,
        expect.objectContaining({
          relatedEventId: "event-1",
          relatedCampaignId: null,
        }),
      ),
    );
  });

  it("refuses an unsupported attachment before sending it, and uploads a valid one", async () => {
    vi.mocked(gateway.uploadTaskFile).mockResolvedValue({} as never);
    givenAccess(...SA);
    renderDetails(taskWith());
    const input = await screen.findByLabelText("Choose files");
    const user = userEvent.setup();
    await user.upload(
      input,
      new File(["x"], "tool.exe", { type: "application/x-msdownload" }),
    );
    expect(await screen.findByText(/unsupported file type/)).toBeVisible();
    expect(gateway.uploadTaskFile).not.toHaveBeenCalled();
    await user.upload(
      input,
      new File(["brief"], "brief.pdf", { type: "application/pdf" }),
    );
    await waitFor(() =>
      expect(gateway.uploadTaskFile).toHaveBeenCalledWith(
        TASK_ID,
        expect.any(File),
      ),
    );
  });
});
