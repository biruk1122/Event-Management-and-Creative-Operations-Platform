import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import { WorkspacesTable } from "./workspaces-table";
import type { Workspace } from "../lib/workspaces-types";

const now = "2026-09-01T09:00:00.000Z";

function makeWorkspace(
  overrides: Partial<Workspace> & Pick<Workspace, "id">,
): Workspace {
  return {
    kind: "EVENT",
    manager: null,
    teams: [],
    participants: [],
    createdAt: now,
    updatedAt: now,
    ...overrides,
  };
}

describe("WorkspacesTable", () => {
  it("renders the empty state, distinguishing filtered from initial", () => {
    const { rerender } = render(
      <WorkspacesTable
        workspaces={[]}
        onSelect={vi.fn()}
        page={1}
        pageCount={1}
        onPageChange={vi.fn()}
        filtered={false}
      />,
    );
    expect(screen.getByText("No workspaces yet")).toBeVisible();

    rerender(
      <WorkspacesTable
        workspaces={[]}
        onSelect={vi.fn()}
        page={1}
        pageCount={1}
        onPageChange={vi.fn()}
        filtered
      />,
    );
    expect(screen.getByText("No workspaces match these filters")).toBeVisible();
  });

  it("shows kind, manager, and counts, and selects a row on click", async () => {
    const user = userEvent.setup();
    const onSelect = vi.fn();
    render(
      <WorkspacesTable
        workspaces={[
          makeWorkspace({
            id: "ws-1",
            kind: "CAMPAIGN",
            manager: {
              id: "u1",
              email: "dana@example.com",
              firstName: "Dana",
              lastName: "Okafor",
            },
            teams: [{ id: "t1", name: "Marketing" }],
            participants: [
              { id: "u2", email: "x@y.z", firstName: null, lastName: null },
              { id: "u3", email: "a@b.c", firstName: null, lastName: null },
            ],
          }),
        ]}
        onSelect={onSelect}
        page={1}
        pageCount={1}
        onPageChange={vi.fn()}
        filtered={false}
      />,
    );

    expect(screen.getAllByText("Campaign workspace").length).toBeGreaterThan(0);
    expect(screen.getAllByText("Dana Okafor").length).toBeGreaterThan(0);

    // The row trigger folds in the manager so same-kind rows are distinct.
    await user.click(
      screen.getAllByRole("button", {
        name: "Campaign workspace managed by Dana Okafor",
      })[0]!,
    );
    expect(onSelect).toHaveBeenCalledWith("ws-1");
  });

  it("gives two same-kind rows distinct accessible names", () => {
    render(
      <WorkspacesTable
        workspaces={[
          makeWorkspace({
            id: "ws-1",
            kind: "EVENT",
            manager: {
              id: "u1",
              email: "morgan@example.com",
              firstName: "Morgan",
              lastName: "Lead",
            },
          }),
          makeWorkspace({ id: "ws-2", kind: "EVENT" }),
        ]}
        onSelect={vi.fn()}
        page={1}
        pageCount={1}
        onPageChange={vi.fn()}
        filtered={false}
      />,
    );

    expect(
      screen.getAllByRole("button", {
        name: "Event workspace managed by Morgan Lead",
      }).length,
    ).toBeGreaterThan(0);
    expect(
      screen.getAllByRole("button", { name: "Event workspace, no manager" })
        .length,
    ).toBeGreaterThan(0);
  });

  it("shows pagination only when there is more than one page", () => {
    const onPageChange = vi.fn();
    const { rerender } = render(
      <WorkspacesTable
        workspaces={[makeWorkspace({ id: "ws-1" })]}
        onSelect={vi.fn()}
        page={1}
        pageCount={1}
        onPageChange={onPageChange}
        filtered={false}
      />,
    );
    expect(
      screen.queryByRole("navigation", { name: "Workspaces pagination" }),
    ).not.toBeInTheDocument();

    rerender(
      <WorkspacesTable
        workspaces={[makeWorkspace({ id: "ws-1" })]}
        onSelect={vi.fn()}
        page={1}
        pageCount={3}
        onPageChange={onPageChange}
        filtered={false}
      />,
    );
    expect(screen.getByText("Page 1 of 3")).toBeVisible();
    expect(screen.getByRole("button", { name: "Previous" })).toBeDisabled();
  });
});
