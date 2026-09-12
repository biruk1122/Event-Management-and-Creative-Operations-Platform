import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import { ProjectsManager } from "./projects-manager";
import type {
  DeleteProjectOutcome,
  SaveProjectOutcome,
} from "../lib/projects-outcome";
import type {
  AssignableEvent,
  AssignableTeam,
  AssignableUser,
  PaginatedProjects,
  Project,
} from "../lib/projects-types";

const now = "2026-09-01T09:00:00.000Z";

const USERS: AssignableUser[] = [
  {
    id: "u1",
    email: "morgan@example.com",
    firstName: "Morgan",
    lastName: "Lead",
  },
];
const TEAMS: AssignableTeam[] = [{ id: "t1", name: "Design Studio" }];
const EVENTS: AssignableEvent[] = [{ id: "evt-1", name: "Orbit Launch" }];

function makeProject(
  overrides: Partial<Project> & Pick<Project, "id" | "name">,
): Project {
  return {
    workspaceId: `ws-${overrides.id}`,
    description: null,
    status: "PLANNED",
    startAt: null,
    endAt: null,
    eventId: null,
    manager: null,
    teams: [],
    participants: [],
    createdBy: null,
    createdAt: now,
    updatedAt: now,
    ...overrides,
  };
}

const PROJECTS: Project[] = [
  makeProject({ id: "p1", name: "Brand Refresh", status: "ACTIVE" }),
  makeProject({ id: "p2", name: "Venue Partnership", status: "PLANNED" }),
  makeProject({ id: "p3", name: "Launch Microsite", status: "ACTIVE" }),
];

function page(items: Project[]): PaginatedProjects {
  return { items, page: 1, pageSize: 25, total: items.length };
}

function renderManager(
  overrides: Partial<Parameters<typeof ProjectsManager>[0]> = {},
) {
  return render(
    <ProjectsManager
      initialPage={page(PROJECTS)}
      assignableUsers={USERS}
      assignableTeams={TEAMS}
      assignableEvents={EVENTS}
      {...overrides}
    />,
  );
}

describe("ProjectsManager", () => {
  it("shows the count and lists the initial page", () => {
    renderManager();
    expect(screen.getByText("3 projects")).toBeVisible();
    expect(
      screen.getAllByRole("button", { name: "Brand Refresh" }).length,
    ).toBeGreaterThan(0);
  });

  it("filters by status", async () => {
    const user = userEvent.setup();
    renderManager();

    await user.click(
      screen.getByRole("combobox", { name: "Filter by status" }),
    );
    await user.click(await screen.findByRole("option", { name: "Planned" }));

    expect(screen.getByText("1 project match these filters")).toBeVisible();
    expect(
      screen.queryByRole("button", { name: "Brand Refresh" }),
    ).not.toBeInTheDocument();
  });

  it("filters by a name search term", async () => {
    const user = userEvent.setup();
    renderManager();

    await user.type(screen.getByLabelText("Search"), "microsite");
    expect(screen.getByText("1 project match these filters")).toBeVisible();
    expect(
      screen.getAllByRole("button", { name: "Launch Microsite" }).length,
    ).toBeGreaterThan(0);
  });

  it("adds a project to the list on a successful create", async () => {
    const user = userEvent.setup();
    const createProject = vi.fn((): Promise<SaveProjectOutcome> =>
      Promise.resolve({
        status: "success",
        project: makeProject({ id: "p4", name: "New Initiative" }),
      }),
    );
    renderManager({ createProject });

    await user.click(screen.getByRole("button", { name: "New project" }));
    await user.type(
      within(await screen.findByRole("dialog")).getByLabelText("Name"),
      "New Initiative",
    );
    await user.click(screen.getByRole("button", { name: "Create project" }));

    await waitFor(() => expect(screen.getByText("4 projects")).toBeVisible());
  });

  it("opens the detail dialog for a row and removes it after a delete", async () => {
    const user = userEvent.setup();
    const deleteProject = vi.fn((): Promise<DeleteProjectOutcome> =>
      Promise.resolve({ status: "success" }),
    );
    const getProject = vi.fn((id: string) =>
      Promise.resolve(PROJECTS.find((p) => p.id === id) ?? null),
    );
    renderManager({ deleteProject, getProject });

    await user.click(
      screen.getAllByRole("button", { name: "Launch Microsite" })[0]!,
    );
    const dialog = await screen.findByRole("dialog");
    await within(dialog).findByRole("heading", { name: "Launch Microsite" });

    await user.click(
      within(dialog).getByRole("button", { name: "Delete project" }),
    );
    await user.click(
      within(dialog).getByRole("button", { name: "Confirm delete" }),
    );

    await waitFor(() => expect(screen.getByText("2 projects")).toBeVisible());
    expect(deleteProject).toHaveBeenCalledWith("p3");
  });
});
