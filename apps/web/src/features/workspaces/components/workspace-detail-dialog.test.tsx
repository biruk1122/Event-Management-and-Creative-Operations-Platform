import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import { WorkspaceDetailDialog } from "./workspace-detail-dialog";
import type {
  AssignManagerOutcome,
  DeleteWorkspaceOutcome,
  WorkspaceParticipantOutcome,
  WorkspaceTeamOutcome,
} from "../lib/workspaces-outcome";
import type {
  AssignableTeam,
  AssignableUser,
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
const TEAMS: AssignableTeam[] = [
  { id: "t1", name: "Production Team" },
  { id: "t2", name: "Marketing Team" },
];

function makeWorkspace(overrides: Partial<Workspace> = {}): Workspace {
  return {
    id: "ws-1",
    kind: "EVENT",
    manager: {
      id: "u1",
      email: "morgan@example.com",
      firstName: "Morgan",
      lastName: "Lead",
    },
    teams: [{ id: "t1", name: "Production Team" }],
    participants: [
      {
        id: "u2",
        email: "dana@example.com",
        firstName: "Dana",
        lastName: "Okafor",
      },
    ],
    createdAt: now,
    updatedAt: now,
    ...overrides,
  };
}

function baseProps(workspace: Workspace) {
  return {
    workspaceId: workspace.id,
    onOpenChange: vi.fn(),
    users: USERS,
    teams: TEAMS,
    getWorkspace: vi.fn((): Promise<Workspace | null> =>
      Promise.resolve(workspace),
    ),
    onAssignManager: vi.fn((): Promise<AssignManagerOutcome> =>
      Promise.resolve({ status: "success", workspace }),
    ),
    onAssignTeam: vi.fn((): Promise<WorkspaceTeamOutcome> =>
      Promise.resolve({ status: "success", workspace }),
    ),
    onRemoveTeam: vi.fn((): Promise<WorkspaceTeamOutcome> =>
      Promise.resolve({ status: "success", workspace }),
    ),
    onAddParticipant: vi.fn((): Promise<WorkspaceParticipantOutcome> =>
      Promise.resolve({ status: "success", workspace }),
    ),
    onRemoveParticipant: vi.fn((): Promise<WorkspaceParticipantOutcome> =>
      Promise.resolve({ status: "success", workspace }),
    ),
    onDelete: vi.fn((): Promise<DeleteWorkspaceOutcome> =>
      Promise.resolve({ status: "success" }),
    ),
    onChanged: vi.fn(),
    onDeleted: vi.fn(),
  };
}

describe("WorkspaceDetailDialog", () => {
  it("shows a loading state before the workspace resolves", () => {
    const props = baseProps(makeWorkspace());
    props.getWorkspace = vi.fn(() => new Promise<Workspace>(() => {}));
    render(<WorkspaceDetailDialog {...props} />);
    expect(screen.getByText("Loading workspace…")).toBeVisible();
  });

  it("renders the error state when the workspace cannot be loaded", async () => {
    const props = baseProps(makeWorkspace());
    props.getWorkspace = vi.fn(() => Promise.resolve(null));
    render(<WorkspaceDetailDialog {...props} />);
    expect(
      await screen.findByText("We could not load this workspace"),
    ).toBeVisible();
  });

  it("loads and lists the kind, assigned team, and participant", async () => {
    render(<WorkspaceDetailDialog {...baseProps(makeWorkspace())} />);
    expect(
      await screen.findByRole("heading", { name: "Event workspace" }),
    ).toBeVisible();
    expect(screen.getByText("Production Team")).toBeVisible();
    expect(screen.getByText("Dana Okafor")).toBeVisible();
  });

  it("assigns a team from the addable list and reports the change", async () => {
    const user = userEvent.setup();
    const props = baseProps(makeWorkspace());
    render(<WorkspaceDetailDialog {...props} />);
    await screen.findByRole("heading", { name: "Event workspace" });

    await user.click(screen.getByRole("combobox", { name: "Assign a team" }));
    await user.click(
      await screen.findByRole("option", { name: "Marketing Team" }),
    );

    await waitFor(() =>
      expect(props.onAssignTeam).toHaveBeenCalledWith("ws-1", "t2"),
    );
    expect(props.onChanged).toHaveBeenCalled();
  });

  it("removes an assigned team", async () => {
    const user = userEvent.setup();
    const props = baseProps(makeWorkspace());
    render(<WorkspaceDetailDialog {...props} />);
    await screen.findByRole("heading", { name: "Event workspace" });

    await user.click(
      screen.getByRole("button", { name: "Unassign Production Team" }),
    );
    await waitFor(() =>
      expect(props.onRemoveTeam).toHaveBeenCalledWith("ws-1", "t1"),
    );
  });

  it("confirms before deleting and reports success", async () => {
    const user = userEvent.setup();
    const props = baseProps(makeWorkspace());
    render(<WorkspaceDetailDialog {...props} />);
    await screen.findByRole("heading", { name: "Event workspace" });

    await user.click(screen.getByRole("button", { name: "Delete workspace" }));
    expect(props.onDelete).not.toHaveBeenCalled();

    await user.click(screen.getByRole("button", { name: "Confirm delete" }));
    await waitFor(() => expect(props.onDeleted).toHaveBeenCalledWith("ws-1"));
  });

  it("surfaces an action failure without closing", async () => {
    const user = userEvent.setup();
    const props = baseProps(makeWorkspace());
    props.onAssignManager = vi.fn(() =>
      Promise.resolve({ status: "manager_not_found" as const }),
    );
    render(<WorkspaceDetailDialog {...props} />);
    await screen.findByRole("heading", { name: "Event workspace" });

    await user.click(screen.getByRole("combobox", { name: "Manager" }));
    await user.click(
      await screen.findByRole("option", { name: "Dana Okafor" }),
    );

    expect(
      await screen.findByText("That user no longer exists."),
    ).toBeVisible();
  });
});
