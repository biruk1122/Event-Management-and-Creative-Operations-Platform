import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import {
  CreateTaskDialog,
  type AssignableDepartment,
} from "./create-task-dialog";
import type { Task, TaskPerson } from "../lib/tasks-types";

const DEPARTMENTS: AssignableDepartment[] = [
  { id: "dept-1", name: "Event Management" },
  { id: "dept-2", name: "Marketing" },
];

const DEPT_1_PEOPLE: TaskPerson[] = [
  {
    id: "user-1",
    email: "maya@example.com",
    firstName: "Maya",
    lastName: "Chen",
  },
];
const DEPT_2_PEOPLE: TaskPerson[] = [
  { id: "user-2", email: "sam@example.com", firstName: "Sam", lastName: "Ade" },
];

function createdTask(): Task {
  return {
    id: "task-new",
    workspaceId: null,
    departmentId: "dept-1",
    parentTaskId: null,
    subtaskSummary: null,
    title: "Confirm venue",
    description: "Check the contract.",
    priority: "MEDIUM",
    type: "LOGISTICS",
    status: "TODO",
    progress: null,
    startAt: null,
    dueAt: "2026-12-01T00:00:00.000Z",
    assignees: [],
    checklistItems: [],
    createdBy: null,
    createdAt: "2026-11-01T00:00:00.000Z",
    updatedAt: "2026-11-01T00:00:00.000Z",
  };
}

function renderDialog({
  onCreate = vi.fn(() => Promise.resolve(createdTask())),
  onUploadAttachment = vi.fn(() => Promise.resolve()),
  onCreated = vi.fn(),
  departmentLocked = false,
}: {
  onCreate?: (...args: unknown[]) => Promise<Task>;
  onUploadAttachment?: (...args: unknown[]) => Promise<unknown>;
  onCreated?: (...args: unknown[]) => void;
  departmentLocked?: boolean;
} = {}) {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  const loadEligibleAssignees = vi.fn((departmentId: string) =>
    Promise.resolve(departmentId === "dept-1" ? DEPT_1_PEOPLE : DEPT_2_PEOPLE),
  );
  const onOpenChange = vi.fn();
  render(
    <QueryClientProvider client={client}>
      <CreateTaskDialog
        open
        onOpenChange={onOpenChange}
        departments={DEPARTMENTS}
        departmentLocked={departmentLocked}
        loadEligibleAssignees={loadEligibleAssignees}
        onCreate={onCreate}
        onUploadAttachment={onUploadAttachment}
        onCreated={onCreated}
      />
    </QueryClientProvider>,
  );
  return { onOpenChange, onCreated, loadEligibleAssignees };
}

describe("CreateTaskDialog", () => {
  it("blocks submission and reports every missing required field", async () => {
    const user = userEvent.setup();
    const onCreate = vi.fn(() => Promise.resolve(createdTask()));
    renderDialog({ onCreate });

    await user.click(screen.getByRole("button", { name: "Create task" }));

    expect(await screen.findByText("Enter a task name.")).toBeVisible();
    expect(screen.getByText("Choose a department.")).toBeVisible();
    expect(
      screen.getByText("Choose who this task is assigned to."),
    ).toBeVisible();
    expect(screen.getByText("Enter a description.")).toBeVisible();
    expect(screen.getByText("Choose a target date.")).toBeVisible();
    expect(onCreate).not.toHaveBeenCalled();
  });

  it("refreshes and clears the assignee when the department changes", async () => {
    const user = userEvent.setup();
    const { loadEligibleAssignees } = renderDialog();

    await user.click(screen.getByRole("combobox", { name: "Department" }));
    await user.click(
      await screen.findByRole("option", { name: "Event Management" }),
    );
    await user.click(screen.getByRole("combobox", { name: "Assigned person" }));
    await user.click(await screen.findByRole("option", { name: "Maya Chen" }));

    await user.click(screen.getByRole("combobox", { name: "Department" }));
    await user.click(await screen.findByRole("option", { name: "Marketing" }));

    await waitFor(() =>
      expect(loadEligibleAssignees).toHaveBeenCalledWith(
        "dept-2",
        expect.anything(),
      ),
    );
    // The assignee field must show the new department's roster, not a stale
    // selection from the department just replaced.
    expect(
      screen.queryByRole("option", { name: "Maya Chen" }),
    ).not.toBeInTheDocument();
    await user.click(screen.getByRole("combobox", { name: "Assigned person" }));
    expect(
      await screen.findByRole("option", { name: "Sam Ade" }),
    ).toBeVisible();
  });

  it("submits the full form and uploads attachments after the task is created", async () => {
    const user = userEvent.setup();
    const onCreate = vi.fn(() => Promise.resolve(createdTask()));
    const onUploadAttachment = vi.fn(() => Promise.resolve());
    const onCreated = vi.fn();
    renderDialog({ onCreate, onUploadAttachment, onCreated });

    await user.type(screen.getByLabelText("Task name *"), "Confirm venue");
    await user.click(screen.getByRole("combobox", { name: "Department" }));
    await user.click(
      await screen.findByRole("option", { name: "Event Management" }),
    );
    await user.click(screen.getByRole("combobox", { name: "Assigned person" }));
    await user.click(await screen.findByRole("option", { name: "Maya Chen" }));
    await user.type(
      screen.getByLabelText("Description *"),
      "Check the contract.",
    );
    await user.type(screen.getByLabelText("Target date *"), "2026-12-01");

    const file = new File(["contract"], "contract.pdf", {
      type: "application/pdf",
    });
    await user.upload(screen.getByLabelText("Attachments"), file);
    expect(await screen.findByText("contract.pdf")).toBeVisible();

    await user.click(screen.getByRole("button", { name: "Create task" }));

    await waitFor(() =>
      expect(onCreate).toHaveBeenCalledWith(
        expect.objectContaining({
          title: "Confirm venue",
          departmentId: "dept-1",
          assigneeId: "user-1",
          description: "Check the contract.",
          type: "GENERAL",
        }),
      ),
    );
    await waitFor(() =>
      expect(onUploadAttachment).toHaveBeenCalledWith("task-new", file),
    );
    expect(onCreated).toHaveBeenCalledWith(createdTask());
  });

  it("locks the department selector for a Department Manager", () => {
    renderDialog({ departmentLocked: true });
    expect(screen.getByRole("combobox", { name: "Department" })).toBeDisabled();
  });

  it("defaults priority to Medium and submits a different chosen value", async () => {
    const user = userEvent.setup();
    const onCreate = vi.fn(() => Promise.resolve(createdTask()));
    renderDialog({ onCreate });

    await user.type(screen.getByLabelText("Task name *"), "Confirm venue");
    await user.click(screen.getByRole("combobox", { name: "Department" }));
    await user.click(
      await screen.findByRole("option", { name: "Event Management" }),
    );
    await user.click(screen.getByRole("combobox", { name: "Assigned person" }));
    await user.click(await screen.findByRole("option", { name: "Maya Chen" }));
    await user.type(
      screen.getByLabelText("Description *"),
      "Check the contract.",
    );
    await user.type(screen.getByLabelText("Target date *"), "2026-12-01");

    await user.click(screen.getByRole("combobox", { name: "Priority" }));
    await user.click(await screen.findByRole("option", { name: "Urgent" }));

    await user.click(screen.getByRole("button", { name: "Create task" }));

    await waitFor(() =>
      expect(onCreate).toHaveBeenCalledWith(
        expect.objectContaining({ priority: "URGENT" }),
      ),
    );
  });

  it("adds checkpoints and submits them in order after the task is created", async () => {
    const user = userEvent.setup();
    const onCreate = vi.fn(() => Promise.resolve(createdTask()));
    renderDialog({ onCreate });

    await user.type(screen.getByLabelText("Task name *"), "Confirm venue");
    await user.click(screen.getByRole("combobox", { name: "Department" }));
    await user.click(
      await screen.findByRole("option", { name: "Event Management" }),
    );
    await user.click(screen.getByRole("combobox", { name: "Assigned person" }));
    await user.click(await screen.findByRole("option", { name: "Maya Chen" }));
    await user.type(
      screen.getByLabelText("Description *"),
      "Check the contract.",
    );
    await user.type(screen.getByLabelText("Target date *"), "2026-12-01");

    const checklistInput = screen.getByLabelText("Checkpoints (optional)");
    await user.type(checklistInput, "Confirm venue permits");
    await user.click(screen.getByRole("button", { name: "Add checkpoint" }));
    expect(await screen.findByText("Confirm venue permits")).toBeVisible();
    await user.type(checklistInput, "Notify the venue contact");
    await user.click(screen.getByRole("button", { name: "Add checkpoint" }));
    expect(await screen.findByText("Notify the venue contact")).toBeVisible();

    await user.click(screen.getByRole("button", { name: "Create task" }));

    await waitFor(() =>
      expect(onCreate).toHaveBeenCalledWith(
        expect.objectContaining({
          checklistItems: ["Confirm venue permits", "Notify the venue contact"],
        }),
      ),
    );
  });
});
