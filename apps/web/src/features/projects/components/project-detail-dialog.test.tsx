import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

// The dialog default-imports read helpers from the gateway, which pulls in
// the browser client and its validated env. Every read is injected in these
// tests, so a stub client keeps that import chain from throwing.
vi.mock("@/lib/api/browser", () => ({ browserApi: {} }));

import { ProjectDetailDialog } from "./project-detail-dialog";
import type {
  DeleteProjectOutcome,
  TransitionProjectOutcome,
  UpdateProjectOutcome,
} from "../lib/projects-outcome";
import type {
  AssignableEvent,
  AssignableTeam,
  AssignableUser,
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
  {
    id: "u2",
    email: "dana@example.com",
    firstName: "Dana",
    lastName: "Okafor",
  },
];
const TEAMS: AssignableTeam[] = [
  { id: "t1", name: "Design Studio" },
  { id: "t2", name: "Content Studio" },
];
const EVENTS: AssignableEvent[] = [{ id: "evt-1", name: "Orbit Launch" }];

function makeProject(overrides: Partial<Project> = {}): Project {
  return {
    id: "prj-1",
    workspaceId: "ws-1",
    name: "Brand Refresh",
    description: "Redesign the visual identity.",
    status: "PLANNED",
    startAt: null,
    endAt: null,
    eventId: null,
    manager: null,
    teams: [{ id: "t1", name: "Design Studio" }],
    participants: [
      {
        id: "u2",
        email: "dana@example.com",
        firstName: "Dana",
        lastName: "Okafor",
      },
    ],
    createdBy: null,
    createdAt: now,
    updatedAt: now,
    ...overrides,
  };
}

function renderDialog(
  overrides: Partial<Parameters<typeof ProjectDetailDialog>[0]> = {},
) {
  const props = {
    projectId: "prj-1" as string | null,
    onOpenChange: vi.fn(),
    users: USERS,
    teams: TEAMS,
    events: EVENTS,
    canUpdate: true,
    canTransition: true,
    canAssign: true,
    canDelete: true,
    getProject: vi.fn((): Promise<Project | null> =>
      Promise.resolve(makeProject()),
    ),
    onUpdate: vi.fn((): Promise<UpdateProjectOutcome> =>
      Promise.resolve({
        status: "success",
        project: makeProject({ name: "Renamed" }),
      }),
    ),
    onTransition: vi.fn((): Promise<TransitionProjectOutcome> =>
      Promise.resolve({
        status: "success",
        project: makeProject({ status: "ACTIVE" }),
      }),
    ),
    onAssignManager: vi.fn(() =>
      Promise.resolve({ status: "success" as const, project: makeProject() }),
    ),
    onAssignTeam: vi.fn(() =>
      Promise.resolve({ status: "success" as const, project: makeProject() }),
    ),
    onRemoveTeam: vi.fn(() =>
      Promise.resolve({
        status: "success" as const,
        project: makeProject({ teams: [] }),
      }),
    ),
    onDelete: vi.fn((): Promise<DeleteProjectOutcome> =>
      Promise.resolve({ status: "success" }),
    ),
    onChanged: vi.fn(),
    onDeleted: vi.fn(),
    ...overrides,
  };
  render(<ProjectDetailDialog {...props} />);
  return props;
}

async function waitForLoaded() {
  return within(await screen.findByRole("dialog")).findByRole("heading", {
    name: "Brand Refresh",
  });
}

describe("ProjectDetailDialog", () => {
  it("loads the project and shows its details", async () => {
    renderDialog();
    await waitForLoaded();
    expect(screen.getByLabelText("Name")).toHaveValue("Brand Refresh");
    expect(screen.getByText("Design Studio")).toBeVisible();
    expect(screen.getByText("Dana Okafor")).toBeVisible();
  });

  it("shows an error state when the project cannot be loaded", async () => {
    renderDialog({ getProject: vi.fn(() => Promise.resolve(null)) });
    expect(
      await screen.findByText("We could not load this project"),
    ).toBeVisible();
  });

  it("saves edited details, including a related event", async () => {
    const user = userEvent.setup();
    const props = renderDialog();
    await waitForLoaded();

    await user.clear(screen.getByLabelText("Name"));
    await user.type(screen.getByLabelText("Name"), "Renamed");
    await user.click(
      screen.getByRole("combobox", { name: "Related event (optional)" }),
    );
    await user.click(
      await screen.findByRole("option", { name: "Orbit Launch" }),
    );
    await user.click(screen.getByRole("button", { name: "Save details" }));

    await waitFor(() =>
      expect(props.onUpdate).toHaveBeenCalledWith(
        "prj-1",
        expect.objectContaining({ name: "Renamed", eventId: "evt-1" }),
      ),
    );
    expect(props.onChanged).toHaveBeenCalled();
  });

  it("moves the project through an allowed transition", async () => {
    const user = userEvent.setup();
    const props = renderDialog();
    await waitForLoaded();

    await user.click(screen.getByRole("combobox", { name: "Move to" }));
    await user.click(await screen.findByRole("option", { name: "Active" }));

    await waitFor(() =>
      expect(props.onTransition).toHaveBeenCalledWith("prj-1", "ACTIVE"),
    );
  });

  it("hides the transition control for a terminal status", async () => {
    renderDialog({
      getProject: vi.fn(() =>
        Promise.resolve(makeProject({ status: "COMPLETED" })),
      ),
    });
    await waitForLoaded();
    expect(screen.getByText("Completed is a final state.")).toBeVisible();
    expect(
      screen.queryByRole("combobox", { name: "Move to" }),
    ).not.toBeInTheDocument();
  });

  it("unassigns a team", async () => {
    const user = userEvent.setup();
    const props = renderDialog();
    await waitForLoaded();

    await user.click(
      screen.getByRole("button", { name: "Unassign Design Studio" }),
    );
    await waitFor(() =>
      expect(props.onRemoveTeam).toHaveBeenCalledWith("prj-1", "t1"),
    );
  });

  it("confirms then deletes the project", async () => {
    const user = userEvent.setup();
    const props = renderDialog();
    await waitForLoaded();

    await user.click(screen.getByRole("button", { name: "Delete project" }));
    await user.click(screen.getByRole("button", { name: "Confirm delete" }));

    await waitFor(() => expect(props.onDelete).toHaveBeenCalledWith("prj-1"));
    expect(props.onDeleted).toHaveBeenCalledWith("prj-1");
  });

  it("surfaces an action error from a failed transition", async () => {
    const user = userEvent.setup();
    renderDialog({
      onTransition: vi.fn(() =>
        Promise.resolve({ status: "invalid_transition" as const }),
      ),
    });
    await waitForLoaded();

    await user.click(screen.getByRole("combobox", { name: "Move to" }));
    await user.click(await screen.findByRole("option", { name: "Active" }));

    expect(
      await screen.findByText(
        "That move is not allowed from the current status.",
      ),
    ).toBeVisible();
  });

  it("is read-only for a caller with only the read grant", async () => {
    renderDialog({
      canUpdate: false,
      canTransition: false,
      canAssign: false,
      canDelete: false,
    });
    await waitForLoaded();

    expect(
      screen.queryByRole("button", { name: "Save details" }),
    ).not.toBeInTheDocument();
    expect(screen.getByText(/read-only access to this project/)).toBeVisible();
    expect(
      screen.queryByRole("combobox", { name: "Move to" }),
    ).not.toBeInTheDocument();
    expect(screen.getByText("Current status: Planned.")).toBeVisible();
    expect(
      screen.queryByRole("button", { name: "Unassign Design Studio" }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "Delete project" }),
    ).not.toBeInTheDocument();
  });
});
