import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import { WorkspacesManager } from "./workspaces-manager";
import type {
  DeleteWorkspaceOutcome,
  SaveWorkspaceOutcome,
} from "../lib/workspaces-outcome";
import type {
  AssignableTeam,
  AssignableUser,
  PaginatedWorkspaces,
  Workspace,
} from "../lib/workspaces-types";

const now = "2026-09-01T09:00:00.000Z";

const USERS: AssignableUser[] = [
  {
    id: "u1",
    email: "morgan@example.com",
    firstName: "Morgan",
    lastName: "Lead",
  },
  {
    id: "u2",
    email: "dana@example.com",
    firstName: "Dana",
    lastName: "Okafor",
  },
];
const TEAMS: AssignableTeam[] = [{ id: "t1", name: "Production Team" }];

function makeWorkspace(
  overrides: Partial<Workspace> & Pick<Workspace, "id" | "kind">,
): Workspace {
  return {
    manager: null,
    teams: [],
    participants: [],
    createdAt: now,
    updatedAt: now,
    ...overrides,
  };
}

const THREE: Workspace[] = [
  makeWorkspace({
    id: "ws-event",
    kind: "EVENT",
    manager: {
      id: "u1",
      email: "morgan@example.com",
      firstName: "Morgan",
      lastName: "Lead",
    },
  }),
  makeWorkspace({ id: "ws-project", kind: "PROJECT" }),
  makeWorkspace({
    id: "ws-campaign",
    kind: "CAMPAIGN",
    manager: {
      id: "u2",
      email: "dana@example.com",
      firstName: "Dana",
      lastName: "Okafor",
    },
  }),
];

function page(items: Workspace[]): PaginatedWorkspaces {
  return { items, page: 1, pageSize: 25, total: items.length };
}

function renderManager(
  overrides: Partial<Parameters<typeof WorkspacesManager>[0]> = {},
) {
  return render(
    <WorkspacesManager
      initialPage={page(THREE)}
      assignableUsers={USERS}
      assignableTeams={TEAMS}
      {...overrides}
    />,
  );
}

describe("WorkspacesManager", () => {
  it("shows the count and lists the initial page", () => {
    renderManager();
    expect(screen.getByText("3 workspaces")).toBeVisible();
    expect(screen.getAllByText("Event workspace").length).toBeGreaterThan(0);
  });

  it("filters by kind", async () => {
    const user = userEvent.setup();
    renderManager();

    await user.click(screen.getByRole("combobox", { name: "Filter by kind" }));
    await user.click(await screen.findByRole("option", { name: "Campaign" }));

    expect(screen.getByText("1 workspace match these filters")).toBeVisible();
    expect(screen.queryByText("Project workspace")).not.toBeInTheDocument();
  });

  it("filters by a manager search term", async () => {
    const user = userEvent.setup();
    renderManager();

    await user.type(screen.getByLabelText("Search"), "dana");
    expect(screen.getByText("1 workspace match these filters")).toBeVisible();
    expect(screen.getAllByText("Campaign workspace").length).toBeGreaterThan(0);
  });

  it("adds a workspace to the list on a successful create", async () => {
    const user = userEvent.setup();
    const createWorkspace = vi.fn((): Promise<SaveWorkspaceOutcome> =>
      Promise.resolve({
        status: "success",
        workspace: makeWorkspace({ id: "ws-new", kind: "PRODUCTION" }),
      }),
    );
    renderManager({ createWorkspace });

    await user.click(screen.getByRole("button", { name: "New workspace" }));
    await user.click(screen.getByRole("button", { name: "Create workspace" }));

    await waitFor(() => expect(screen.getByText("4 workspaces")).toBeVisible());
    expect(screen.getAllByText("Production workspace").length).toBeGreaterThan(
      0,
    );
  });

  it("opens the detail dialog for a row and removes it after a delete", async () => {
    const user = userEvent.setup();
    const deleteWorkspace = vi.fn((): Promise<DeleteWorkspaceOutcome> =>
      Promise.resolve({ status: "success" }),
    );
    const getWorkspace = vi.fn((id: string) =>
      Promise.resolve(THREE.find((w) => w.id === id) ?? null),
    );
    renderManager({ deleteWorkspace, getWorkspace });

    await user.click(
      screen.getAllByRole("button", {
        name: "Project workspace, no manager",
      })[0]!,
    );
    const dialog = await screen.findByRole("dialog");
    await within(dialog).findByRole("heading", { name: "Project workspace" });

    await user.click(
      within(dialog).getByRole("button", { name: "Delete workspace" }),
    );
    await user.click(
      within(dialog).getByRole("button", { name: "Confirm delete" }),
    );

    await waitFor(() => expect(screen.getByText("2 workspaces")).toBeVisible());
    expect(deleteWorkspace).toHaveBeenCalledWith("ws-project");
  });
});
