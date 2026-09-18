import { fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import { TodoDialog, type TodoFormOutcome } from "./todo-dialog";
import type { RelatedOption, TodoItem } from "../lib/todo-types";

const EVENT_OPTIONS: RelatedOption[] = [{ id: "event-1", name: "Launch" }];
const PROJECT_OPTIONS: RelatedOption[] = [{ id: "project-1", name: "Rebrand" }];

function personalItem(): TodoItem {
  return {
    id: "todo-1",
    title: "Call the venue",
    description: "Confirm the October date.",
    type: "WORK",
    priority: "HIGH",
    status: "NOT_STARTED",
    dueDate: "2026-09-16",
    dueTime: "09:00:00",
    relatedEventId: null,
    relatedProjectId: null,
    reminderEnabled: false,
    reminderAt: null,
    createdAt: "2026-09-01T00:00:00.000Z",
    updatedAt: "2026-09-01T00:00:00.000Z",
  };
}

describe("TodoDialog", () => {
  it("requires a title before submitting", async () => {
    const user = userEvent.setup();
    const onSubmit = vi.fn();
    render(
      <TodoDialog
        open
        onOpenChange={() => {}}
        eventOptions={EVENT_OPTIONS}
        projectOptions={PROJECT_OPTIONS}
        onSubmit={onSubmit}
      />,
    );

    await user.click(screen.getByRole("button", { name: "Create to-do" }));

    expect(await screen.findByText("Title is required.")).toBeVisible();
    expect(onSubmit).not.toHaveBeenCalled();
  });

  it("disables the due time until a due date is set, and clears it if the date is removed", () => {
    render(
      <TodoDialog
        open
        onOpenChange={() => {}}
        eventOptions={EVENT_OPTIONS}
        projectOptions={PROJECT_OPTIONS}
        onSubmit={vi.fn()}
      />,
    );

    expect(screen.getByLabelText("Due time (optional)")).toBeDisabled();

    fireEvent.change(screen.getByLabelText("Due date (optional)"), {
      target: { value: "2026-09-20" },
    });
    expect(screen.getByLabelText("Due time (optional)")).not.toBeDisabled();
    fireEvent.change(screen.getByLabelText("Due time (optional)"), {
      target: { value: "09:00" },
    });

    fireEvent.change(screen.getByLabelText("Due date (optional)"), {
      target: { value: "" },
    });
    expect(screen.getByLabelText("Due time (optional)")).toBeDisabled();
    expect(screen.getByLabelText("Due time (optional)")).toHaveValue("");
  });

  it("requires a reminder time once 'Remind me' is checked", async () => {
    const user = userEvent.setup();
    const onSubmit = vi.fn();
    render(
      <TodoDialog
        open
        onOpenChange={() => {}}
        eventOptions={EVENT_OPTIONS}
        projectOptions={PROJECT_OPTIONS}
        onSubmit={onSubmit}
      />,
    );

    await user.type(screen.getByLabelText("Title"), "Follow up");
    await user.click(screen.getByRole("checkbox", { name: "Remind me" }));
    await user.click(screen.getByRole("button", { name: "Create to-do" }));

    expect(
      await screen.findByText("Set a reminder time, or turn the reminder off."),
    ).toBeVisible();
    expect(onSubmit).not.toHaveBeenCalled();
  });

  it("submits valid values, including a related event, and closes on success", async () => {
    const user = userEvent.setup();
    const onOpenChange = vi.fn();
    const outcome: TodoFormOutcome = {
      status: "success",
      item: personalItem(),
    };
    const onSubmit = vi.fn().mockResolvedValue(outcome);
    render(
      <TodoDialog
        open
        onOpenChange={onOpenChange}
        eventOptions={EVENT_OPTIONS}
        projectOptions={PROJECT_OPTIONS}
        onSubmit={onSubmit}
      />,
    );

    await user.type(screen.getByLabelText("Title"), "Call the venue");
    await user.click(screen.getByLabelText("Related event (optional)"));
    await user.click(screen.getByRole("option", { name: "Launch" }));
    await user.click(screen.getByRole("button", { name: "Create to-do" }));

    expect(
      await screen.findByRole("button", { name: "Create to-do" }),
    ).not.toBeDisabled();
    expect(onSubmit).toHaveBeenCalledWith(
      expect.objectContaining({
        title: "Call the venue",
        type: "PERSONAL",
        relatedEventId: "event-1",
      }),
    );
    expect(onOpenChange).toHaveBeenCalledWith(false);
  });

  it("pre-fills the form and offers delete when editing an existing item", async () => {
    const user = userEvent.setup();
    const onDelete = vi.fn().mockResolvedValue(undefined);
    render(
      <TodoDialog
        open
        onOpenChange={() => {}}
        item={personalItem()}
        eventOptions={EVENT_OPTIONS}
        projectOptions={PROJECT_OPTIONS}
        onSubmit={vi.fn()}
        onDelete={onDelete}
      />,
    );

    expect(screen.getByLabelText("Title")).toHaveValue("Call the venue");
    expect(screen.getByLabelText("Due time (optional)")).toHaveValue("09:00");
    await user.click(screen.getByRole("button", { name: "Delete" }));

    expect(onDelete).toHaveBeenCalledWith("todo-1");
  });

  it("shows a generic error when the save outcome is unexpected", async () => {
    const user = userEvent.setup();
    const onSubmit = vi
      .fn()
      .mockResolvedValue({ status: "unexpected" } satisfies TodoFormOutcome);
    render(
      <TodoDialog
        open
        onOpenChange={() => {}}
        eventOptions={EVENT_OPTIONS}
        projectOptions={PROJECT_OPTIONS}
        onSubmit={onSubmit}
      />,
    );

    await user.type(screen.getByLabelText("Title"), "Follow up");
    await user.click(screen.getByRole("button", { name: "Create to-do" }));

    expect(
      await screen.findByText("We could not save this to-do. Try again."),
    ).toBeVisible();
  });
});
