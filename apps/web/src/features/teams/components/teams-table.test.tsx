import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import { TeamsTable } from "./teams-table";
import type { Team } from "../lib/teams-types";

const now = "2026-09-01T09:00:00.000Z";

function makeTeam(overrides: Partial<Team> & Pick<Team, "id" | "name">): Team {
  return {
    description: null,
    department: { id: "dep-1", name: "Production" },
    manager: null,
    members: [],
    deactivatedAt: null,
    createdAt: now,
    updatedAt: now,
    ...overrides,
  };
}

const TEAMS: Team[] = [
  makeTeam({
    id: "t1",
    name: "Production Team",
    department: { id: "dep-1", name: "Production" },
    manager: {
      id: "m1",
      email: "morgan@example.com",
      firstName: "Morgan",
      lastName: "Lead",
    },
    members: [
      { id: "m1", email: "morgan@example.com", firstName: "M", lastName: "L" },
      { id: "u2", email: "u2@example.com", firstName: "U", lastName: "Two" },
    ],
  }),
  makeTeam({
    id: "t2",
    name: "Promotion Team",
    department: { id: "dep-2", name: "Marketing" },
    deactivatedAt: "2026-08-20T12:00:00.000Z",
  }),
];

function noop() {
  /* no-op */
}

describe("TeamsTable", () => {
  it("shows the plain empty state with no teams", () => {
    render(
      <TeamsTable
        teams={[]}
        onSelect={noop}
        page={1}
        pageCount={1}
        onPageChange={noop}
        filtered={false}
      />,
    );
    expect(screen.getByText("No teams yet")).toBeVisible();
  });

  it("shows a filter-specific empty state", () => {
    render(
      <TeamsTable
        teams={[]}
        onSelect={noop}
        page={1}
        pageCount={1}
        onPageChange={noop}
        filtered
      />,
    );
    expect(screen.getByText("No teams match these filters")).toBeVisible();
  });

  it("renders name, department, manager, member count, and status", () => {
    render(
      <TeamsTable
        teams={TEAMS}
        onSelect={noop}
        page={1}
        pageCount={1}
        onPageChange={noop}
        filtered={false}
      />,
    );
    expect(screen.getAllByText("Production Team")[0]).toBeVisible();
    expect(screen.getAllByText("Production")[0]).toBeVisible();
    expect(screen.getAllByText("Morgan Lead")[0]).toBeVisible();
    expect(screen.getAllByText("2")[0]).toBeVisible();
    expect(screen.getAllByText("Active")[0]).toBeVisible();
    expect(screen.getAllByText("Inactive")[0]).toBeVisible();
    expect(screen.getAllByText("Unassigned")[0]).toBeVisible();
  });

  it("selects a team when its name is activated", async () => {
    const user = userEvent.setup();
    const onSelect = vi.fn();
    render(
      <TeamsTable
        teams={TEAMS}
        onSelect={onSelect}
        page={1}
        pageCount={1}
        onPageChange={noop}
        filtered={false}
      />,
    );
    await user.click(
      screen.getAllByRole("button", { name: "Production Team" })[0]!,
    );
    expect(onSelect).toHaveBeenCalledWith("t1");
  });

  it("shows pagination only when there is more than one page", () => {
    const { rerender } = render(
      <TeamsTable
        teams={TEAMS}
        onSelect={noop}
        page={1}
        pageCount={1}
        onPageChange={noop}
        filtered={false}
      />,
    );
    expect(
      screen.queryByRole("navigation", { name: "Teams pagination" }),
    ).not.toBeInTheDocument();

    rerender(
      <TeamsTable
        teams={TEAMS}
        onSelect={noop}
        page={1}
        pageCount={3}
        onPageChange={noop}
        filtered={false}
      />,
    );
    expect(screen.getByText("Page 1 of 3")).toBeVisible();
  });
});
