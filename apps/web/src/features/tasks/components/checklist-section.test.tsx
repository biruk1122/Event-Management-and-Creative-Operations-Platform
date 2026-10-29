import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import type { TaskChecklistItem } from "../lib/tasks-types";
import { ChecklistSection, type ChecklistActions } from "./checklist-section";

function makeItem(
  overrides: Partial<TaskChecklistItem> = {},
): TaskChecklistItem {
  return {
    id: "item-1",
    description: "Confirm venue permits",
    completed: false,
    position: 0,
    completedBy: null,
    completedAt: null,
    createdBy: {
      id: "super-admin-1",
      email: "admin@example.com",
      firstName: "Ada",
      lastName: "Admin",
    },
    createdAt: "2026-09-12T09:00:00.000Z",
    updatedAt: "2026-09-12T09:00:00.000Z",
    ...overrides,
  };
}

function makeActions(
  overrides: Partial<ChecklistActions> = {},
): ChecklistActions {
  return {
    canEditItems: true,
    canToggleItems: true,
    currentUserId: "manager-1",
    canManageUnattributedItems: false,
    addItem: vi.fn(),
    removeItem: vi.fn(),
    reorderItems: vi.fn(),
    toggleItem: vi.fn(),
    ...overrides,
  };
}

const task = { status: "IN_PROGRESS", dueAt: null, progress: 50 } as const;

describe("ChecklistSection", () => {
  it("hides remove and move for an item the viewer did not create, but keeps toggle available", () => {
    render(
      <ChecklistSection
        task={task}
        items={[makeItem()]}
        actions={makeActions()}
        busy={false}
      />,
    );

    expect(
      screen.queryByRole("button", {
        name: 'Remove "Confirm venue permits"',
      }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole("button", {
        name: 'Move "Confirm venue permits" up',
      }),
    ).not.toBeInTheDocument();
    expect(
      screen.getByRole("checkbox", {
        name: 'Mark "Confirm venue permits" complete',
      }),
    ).not.toBeDisabled();
    expect(screen.getByText("Added by Ada Admin")).toBeVisible();
  });

  it("shows the remove control for an item the viewer created themselves", () => {
    render(
      <ChecklistSection
        task={task}
        items={[
          makeItem({
            createdBy: {
              id: "manager-1",
              email: "manager@example.com",
              firstName: "Mia",
              lastName: "Manager",
            },
          }),
        ]}
        actions={makeActions()}
        busy={false}
      />,
    );

    expect(
      screen.getByRole("button", {
        name: 'Remove "Confirm venue permits"',
      }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: 'Move "Confirm venue permits" up' }),
    ).toBeInTheDocument();
    expect(screen.queryByText(/Added by/)).not.toBeInTheDocument();
  });

  it("falls back to organization scope for a legacy item with no recorded creator", () => {
    const { rerender } = render(
      <ChecklistSection
        task={task}
        items={[makeItem({ createdBy: null })]}
        actions={makeActions({ canManageUnattributedItems: false })}
        busy={false}
      />,
    );
    expect(
      screen.queryByRole("button", {
        name: 'Remove "Confirm venue permits"',
      }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole("button", {
        name: 'Move "Confirm venue permits" up',
      }),
    ).not.toBeInTheDocument();

    rerender(
      <ChecklistSection
        task={task}
        items={[makeItem({ createdBy: null })]}
        actions={makeActions({ canManageUnattributedItems: true })}
        busy={false}
      />,
    );
    expect(
      screen.getByRole("button", {
        name: 'Remove "Confirm venue permits"',
      }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: 'Move "Confirm venue permits" up' }),
    ).toBeInTheDocument();
  });

  it("only shows the add-checkpoint control to an actor who holds task.update", () => {
    render(
      <ChecklistSection
        task={task}
        items={[]}
        actions={makeActions({ canEditItems: false })}
        busy={false}
      />,
    );
    expect(
      screen.queryByLabelText("New checkpoint description"),
    ).not.toBeInTheDocument();
  });
});
