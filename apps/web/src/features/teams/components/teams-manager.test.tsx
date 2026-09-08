import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import { TeamsManager } from "./teams-manager";
import type { DeleteTeamOutcome, SaveTeamOutcome } from "../lib/teams-outcome";
import type {
  AssignableDepartment,
  AssignableUser,
  PaginatedTeams,
  Team,
} from "../lib/teams-types";

const now = "2026-09-01T09:00:00.000Z";

const DEPARTMENTS: AssignableDepartment[] = [
  { id: "dep-1", name: "Production" },
  { id: "dep-2", name: "Marketing" },
];

const MANAGERS: AssignableUser[] = [
  {
    id: "m1",
    email: "morgan@example.com",
    firstName: "Morgan",
    lastName: "Lead",
  },
];

function makeTeam(overrides: Partial<Team> & Pick<Team, "id" | "name">): Team {
  return {
    description: null,
    department: DEPARTMENTS[0]!,
    manager: null,
    members: [],
    deactivatedAt: null,
    createdAt: now,
    updatedAt: now,
    ...overrides,
  };
}

function page(items: Team[]): PaginatedTeams {
  return { items, page: 1, pageSize: 25, total: items.length };
}

const THREE = [
  makeTeam({ id: "t1", name: "Production Team", department: DEPARTMENTS[0]! }),
  makeTeam({
    id: "t2",
    name: "Promotion Team",
    department: DEPARTMENTS[1]!,
    deactivatedAt: "2026-08-20T12:00:00.000Z",
  }),
  makeTeam({ id: "t3", name: "Marketing Team", department: DEPARTMENTS[1]! }),
];

function setup(overrides: Partial<Parameters<typeof TeamsManager>[0]> = {}) {
  render(
    <TeamsManager
      initialPage={page(THREE)}
      departments={DEPARTMENTS}
      managers={MANAGERS}
      {...overrides}
    />,
  );
}

describe("TeamsManager", () => {
  it("shows the count and lists the initial page", () => {
    setup();
    expect(screen.getByText("3 teams")).toBeVisible();
    expect(screen.getAllByText("Production Team")[0]).toBeVisible();
  });

  it("filters the list by the search term", async () => {
    const user = userEvent.setup();
    setup();
    await user.type(screen.getByLabelText("Search"), "market");
    expect(screen.getAllByText("Marketing Team")[0]).toBeVisible();
    expect(screen.queryByText("Production Team")).not.toBeInTheDocument();
  });

  it("filters by status", async () => {
    const user = userEvent.setup();
    setup();
    await user.click(
      screen.getByRole("combobox", { name: "Filter by status" }),
    );
    await user.click(await screen.findByRole("option", { name: "Inactive" }));
    expect(screen.getAllByText("Promotion Team")[0]).toBeVisible();
    expect(screen.queryByText("Production Team")).not.toBeInTheDocument();
  });

  it("filters by department", async () => {
    const user = userEvent.setup();
    setup();
    await user.click(
      screen.getByRole("combobox", { name: "Filter by department" }),
    );
    await user.click(await screen.findByRole("option", { name: "Production" }));
    expect(screen.getAllByText("Production Team")[0]).toBeVisible();
    expect(screen.queryByText("Marketing Team")).not.toBeInTheDocument();
  });

  it("opens the detail dialog for the selected team", async () => {
    const user = userEvent.setup();
    const getTeam = vi.fn((id: string) =>
      Promise.resolve(THREE.find((team) => team.id === id) ?? null),
    );
    setup({ getTeam });

    await user.click(
      screen.getAllByRole("button", { name: "Production Team" })[0]!,
    );

    expect(getTeam).toHaveBeenCalledWith("t1");
    expect(
      await screen.findByRole("heading", { name: "Production Team" }),
    ).toBeVisible();
  });

  it("adds a team to the list after a successful create", async () => {
    const user = userEvent.setup();
    const created = makeTeam({
      id: "t4",
      name: "New Team",
      department: DEPARTMENTS[0]!,
    });
    const createTeam = vi.fn((): Promise<SaveTeamOutcome> =>
      Promise.resolve({ status: "success", team: created }),
    );
    setup({ createTeam });

    await user.click(screen.getByRole("button", { name: "New team" }));
    await user.type(screen.getByLabelText("Name"), "New Team");
    await user.click(screen.getByRole("combobox", { name: "Department" }));
    await user.click(await screen.findByRole("option", { name: "Production" }));
    await user.click(screen.getByRole("button", { name: "Create team" }));

    await waitFor(() => expect(screen.getByText("4 teams")).toBeVisible());
    expect(screen.getAllByText("New Team")[0]).toBeVisible();
  });

  it("removes a team from the list after a successful delete", async () => {
    const user = userEvent.setup();
    const getTeam = vi.fn((id: string) =>
      Promise.resolve(THREE.find((team) => team.id === id) ?? null),
    );
    const deleteTeam = vi.fn((): Promise<DeleteTeamOutcome> =>
      Promise.resolve({ status: "success" }),
    );
    setup({ getTeam, deleteTeam });

    await user.click(
      screen.getAllByRole("button", { name: "Marketing Team" })[0]!,
    );
    await screen.findByRole("heading", { name: "Marketing Team" });
    await user.click(screen.getByRole("button", { name: "Delete team" }));
    await user.click(screen.getByRole("button", { name: "Confirm delete" }));

    await waitFor(() => expect(screen.getByText("2 teams")).toBeVisible());
  });

  it("paginates when there are more than ten matches", () => {
    const many = Array.from({ length: 12 }, (_, index) =>
      makeTeam({
        id: `p${index}`,
        name: `Team ${index}`,
        department: DEPARTMENTS[0]!,
      }),
    );
    setup({ initialPage: page(many) });
    expect(screen.getByText("Page 1 of 2")).toBeVisible();
  });
});
