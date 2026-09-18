import { fireEvent, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";

import { TodoManager } from "./todo-manager";
import type { TodoItem } from "../lib/todo-types";

const TODAY = "2026-09-16";

function items(): TodoItem[] {
  return [
    {
      id: "todo-1",
      title: "Confirm venue availability",
      description: null,
      type: "WORK",
      priority: "HIGH",
      status: "NOT_STARTED",
      dueDate: TODAY,
      dueTime: "09:00:00",
      relatedEventId: null,
      relatedProjectId: null,
      reminderEnabled: false,
      reminderAt: null,
      createdAt: "2026-09-01T00:00:00.000Z",
      updatedAt: "2026-09-01T00:00:00.000Z",
    },
    {
      id: "todo-2",
      title: "Buy anniversary gift",
      description: null,
      type: "PERSONAL",
      priority: "LOW",
      status: "NOT_STARTED",
      dueDate: "2026-09-20",
      dueTime: null,
      relatedEventId: null,
      relatedProjectId: null,
      reminderEnabled: false,
      reminderAt: null,
      createdAt: "2026-09-01T00:00:00.000Z",
      updatedAt: "2026-09-01T00:00:00.000Z",
    },
  ];
}

function setup() {
  const user = userEvent.setup();
  render(<TodoManager initialItems={items()} initialToday={TODAY} />);
  return user;
}

describe("TodoManager", () => {
  it("shows the My Day view by default with only today's item", () => {
    setup();
    expect(screen.getByText("Confirm venue availability")).toBeVisible();
    expect(screen.queryByText("Buy anniversary gift")).not.toBeInTheDocument();
  });

  it("switches to Upcoming and shows the future, not-yet-completed item", async () => {
    const user = setup();

    await user.click(screen.getByRole("button", { name: "Upcoming" }));

    expect(screen.getByText("Buy anniversary gift")).toBeVisible();
    expect(
      screen.queryByText("Confirm venue availability"),
    ).not.toBeInTheDocument();
  });

  it("switches to Important and shows only high/urgent-priority items", async () => {
    const user = setup();

    await user.click(screen.getByRole("button", { name: "Important" }));

    expect(screen.getByText("Confirm venue availability")).toBeVisible();
    expect(screen.queryByText("Buy anniversary gift")).not.toBeInTheDocument();
  });

  it("shows an empty state when a view has nothing to show", async () => {
    const user = setup();

    await user.click(screen.getByRole("button", { name: "Completed" }));

    expect(screen.getByText("Nothing completed yet.")).toBeVisible();
  });

  it("toggles an item's status without opening the edit dialog", async () => {
    const user = setup();

    await user.click(
      screen.getByRole("button", {
        name: 'Mark "Confirm venue availability" as completed',
      }),
    );

    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Completed" }));
    expect(screen.getByText("Confirm venue availability")).toBeVisible();
  });

  it("edits an item and reflects the change immediately", async () => {
    const user = setup();

    await user.click(screen.getByText("Confirm venue availability"));
    const dialog = screen.getByRole("dialog");
    const title = within(dialog).getByLabelText("Title");
    await user.clear(title);
    await user.type(title, "Confirm venue and catering");
    await user.click(
      within(dialog).getByRole("button", { name: "Save changes" }),
    );

    expect(await screen.findByText("Confirm venue and catering")).toBeVisible();
    expect(
      screen.queryByText("Confirm venue availability"),
    ).not.toBeInTheDocument();
  });

  it("deletes an item", async () => {
    const user = setup();

    await user.click(screen.getByText("Confirm venue availability"));
    const dialog = screen.getByRole("dialog");
    await user.click(within(dialog).getByRole("button", { name: "Delete" }));

    expect(
      screen.queryByText("Confirm venue availability"),
    ).not.toBeInTheDocument();
  });

  it("creates a new to-do through the toolbar's Add to-do action", async () => {
    const user = setup();

    await user.click(screen.getByRole("button", { name: "Add to-do" }));
    const dialog = screen.getByRole("dialog");
    await user.type(within(dialog).getByLabelText("Title"), "Book caterer");
    fireEvent.change(within(dialog).getByLabelText("Due date (optional)"), {
      target: { value: TODAY },
    });
    await user.click(
      within(dialog).getByRole("button", { name: "Create to-do" }),
    );

    expect(await screen.findByText("Book caterer")).toBeVisible();
  });
});
