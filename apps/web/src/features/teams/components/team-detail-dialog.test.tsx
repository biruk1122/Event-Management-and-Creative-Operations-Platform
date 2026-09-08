import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

// The dialog default-imports the gateway for its `getTeam` fallback; stub the
// browser client so the env schema does not run at import time.
vi.mock("@/lib/api/browser", () => ({ browserApi: {} }));

import { TeamDetailDialog } from "./team-detail-dialog";
import type {
  AssignManagerOutcome,
  DeactivateTeamOutcome,
  DeleteTeamOutcome,
  MembershipOutcome,
  ReactivateTeamOutcome,
  SaveTeamOutcome,
} from "../lib/teams-outcome";
import type { AssignableUser, Team } from "../lib/teams-types";

const now = "2026-09-01T09:00:00.000Z";

const MANAGERS: AssignableUser[] = [
  {
    id: "user-1",
    email: "morgan@example.com",
    firstName: "Morgan",
    lastName: "Lead",
  },
  {
    id: "user-2",
    email: "dana@example.com",
    firstName: "Dana",
    lastName: "Okafor",
  },
  {
    id: "user-3",
    email: "robin@example.com",
    firstName: "Robin",
    lastName: "Doer",
  },
];

function makeTeam(overrides: Partial<Team> = {}): Team {
  return {
    id: "team-1",
    name: "Production Team",
    description: "Delivers production.",
    department: { id: "dep-1", name: "Production" },
    manager: {
      id: "user-1",
      email: "morgan@example.com",
      firstName: "Morgan",
      lastName: "Lead",
    },
    members: [
      {
        id: "user-1",
        email: "morgan@example.com",
        firstName: "Morgan",
        lastName: "Lead",
      },
    ],
    deactivatedAt: null,
    createdAt: now,
    updatedAt: now,
    ...overrides,
  };
}

function baseProps(team: Team) {
  return {
    teamId: team.id,
    onOpenChange: vi.fn(),
    managers: MANAGERS,
    getTeam: vi.fn((): Promise<Team | null> => Promise.resolve(team)),
    onUpdate: vi.fn((): Promise<SaveTeamOutcome> =>
      Promise.resolve({ status: "success", team }),
    ),
    onAssignManager: vi.fn((): Promise<AssignManagerOutcome> =>
      Promise.resolve({ status: "success", team }),
    ),
    onAddMember: vi.fn((): Promise<MembershipOutcome> =>
      Promise.resolve({ status: "success", team }),
    ),
    onRemoveMember: vi.fn((): Promise<MembershipOutcome> =>
      Promise.resolve({ status: "success", team }),
    ),
    onDeactivate: vi.fn((): Promise<DeactivateTeamOutcome> =>
      Promise.resolve({
        status: "success",
        team: { ...team, deactivatedAt: now },
      }),
    ),
    onReactivate: vi.fn((): Promise<ReactivateTeamOutcome> =>
      Promise.resolve({
        status: "success",
        team: { ...team, deactivatedAt: null },
      }),
    ),
    onDelete: vi.fn((): Promise<DeleteTeamOutcome> =>
      Promise.resolve({ status: "success" }),
    ),
    onChanged: vi.fn(),
    onDeleted: vi.fn(),
  };
}

describe("TeamDetailDialog", () => {
  it("shows a loading state before the team resolves", () => {
    const props = baseProps(makeTeam());
    let resolve: (() => void) | undefined;
    props.getTeam = vi.fn(
      () =>
        new Promise<Team>((r) => {
          resolve = () => r(makeTeam());
        }),
    );
    render(<TeamDetailDialog {...props} />);
    expect(screen.getByText("Loading team…")).toBeVisible();
    resolve?.();
  });

  it("loads name, description, department, status, and member count", async () => {
    render(<TeamDetailDialog {...baseProps(makeTeam())} />);
    expect(await screen.findByDisplayValue("Production Team")).toBeVisible();
    expect(screen.getByDisplayValue("Delivers production.")).toBeVisible();
    expect(screen.getByText("Active")).toBeVisible();
    expect(screen.getByText(/Production · 1 member/)).toBeVisible();
  });

  it("keeps Save disabled until a field changes, then sends only the change", async () => {
    const user = userEvent.setup();
    const props = baseProps(makeTeam());
    render(<TeamDetailDialog {...props} />);

    const name = await screen.findByLabelText("Name");
    const save = screen.getByRole("button", { name: "Save changes" });
    expect(save).toBeDisabled();

    await user.clear(name);
    await user.type(name, "Prod Team");
    expect(save).toBeEnabled();
    await user.click(save);

    await waitFor(() =>
      expect(props.onUpdate).toHaveBeenCalledWith("team-1", {
        name: "Prod Team",
      }),
    );
    expect(props.onChanged).toHaveBeenCalled();
  });

  it("lists members and removes one on request", async () => {
    const user = userEvent.setup();
    const base = makeTeam({
      members: [
        {
          id: "user-1",
          email: "morgan@example.com",
          firstName: "Morgan",
          lastName: "Lead",
        },
        {
          id: "user-3",
          email: "robin@example.com",
          firstName: "Robin",
          lastName: "Doer",
        },
      ],
    });
    const onRemoveMember = vi.fn(
      (id: string, userId: string): Promise<MembershipOutcome> =>
        Promise.resolve({
          status: "success",
          team: {
            ...base,
            id,
            members: base.members.filter((member) => member.id !== userId),
          },
        }),
    );
    const props = { ...baseProps(base), onRemoveMember };
    render(<TeamDetailDialog {...props} />);

    await screen.findByDisplayValue("Production Team");
    const list = screen.getByRole("list", { name: "Team members" });
    expect(within(list).getByText("Morgan Lead")).toBeVisible();
    expect(within(list).getByText("Robin Doer")).toBeVisible();

    await user.click(screen.getByRole("button", { name: "Remove Robin Doer" }));
    await waitFor(() =>
      expect(onRemoveMember).toHaveBeenCalledWith("team-1", "user-3"),
    );
  });

  it("adds a member through the picker, offering only non-members", async () => {
    const user = userEvent.setup();
    const base = makeTeam({
      members: [
        {
          id: "user-1",
          email: "morgan@example.com",
          firstName: "Morgan",
          lastName: "Lead",
        },
      ],
    });
    const onAddMember = vi.fn(
      (id: string, userId: string): Promise<MembershipOutcome> =>
        Promise.resolve({
          status: "success",
          team: {
            ...base,
            id,
            members: [
              ...base.members,
              MANAGERS.find((manager) => manager.id === userId)!,
            ],
          },
        }),
    );
    const props = { ...baseProps(base), onAddMember };
    render(<TeamDetailDialog {...props} />);

    await screen.findByDisplayValue("Production Team");
    await user.click(screen.getByRole("combobox", { name: "Add member" }));
    // The current member is not offered.
    expect(
      screen.queryByRole("option", { name: "Morgan Lead" }),
    ).not.toBeInTheDocument();
    await user.click(
      await screen.findByRole("option", { name: "Dana Okafor" }),
    );
    await waitFor(() =>
      expect(onAddMember).toHaveBeenCalledWith("team-1", "user-2"),
    );
  });

  it("disables the add picker when everyone available is already a member", async () => {
    const everyone = MANAGERS.map((manager) => ({ ...manager }));
    render(
      <TeamDetailDialog {...baseProps(makeTeam({ members: everyone }))} />,
    );
    await screen.findByDisplayValue("Production Team");
    expect(screen.getByRole("combobox", { name: "Add member" })).toBeDisabled();
    expect(
      screen.getByText("Everyone available is already a member"),
    ).toBeVisible();
  });

  it("shows the empty-members hint when the team has no members", async () => {
    render(<TeamDetailDialog {...baseProps(makeTeam({ members: [] }))} />);
    await screen.findByDisplayValue("Production Team");
    expect(screen.getByText("No members yet. Add one below.")).toBeVisible();
  });

  it("confirms before deactivating and reports success", async () => {
    const user = userEvent.setup();
    const props = baseProps(makeTeam());
    render(<TeamDetailDialog {...props} />);

    await screen.findByDisplayValue("Production Team");
    await user.click(screen.getByRole("button", { name: "Deactivate team" }));
    expect(props.onDeactivate).not.toHaveBeenCalled();

    await user.click(
      screen.getByRole("button", { name: "Confirm deactivate" }),
    );
    await waitFor(() =>
      expect(props.onDeactivate).toHaveBeenCalledWith("team-1"),
    );
  });

  it("offers reactivate for an inactive team and shows the date", async () => {
    const user = userEvent.setup();
    const props = baseProps(
      makeTeam({ deactivatedAt: "2026-08-15T00:00:00Z" }),
    );
    render(<TeamDetailDialog {...props} />);

    await screen.findByDisplayValue("Production Team");
    expect(screen.getByText(/deactivated/)).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Reactivate team" }));
    await waitFor(() =>
      expect(props.onReactivate).toHaveBeenCalledWith("team-1"),
    );
  });

  it("assigns the manager through the select", async () => {
    const user = userEvent.setup();
    const base = makeTeam({ manager: null, members: [] });
    const onAssignManager = vi.fn(
      (id: string, managerId: string | null): Promise<AssignManagerOutcome> =>
        Promise.resolve({
          status: "success",
          team: {
            ...base,
            id,
            manager: managerId
              ? MANAGERS.find((manager) => manager.id === managerId)!
              : null,
          },
        }),
    );
    const props = { ...baseProps(base), onAssignManager };
    render(<TeamDetailDialog {...props} />);

    await screen.findByDisplayValue("Production Team");
    await user.click(screen.getByRole("combobox", { name: "Manager" }));
    await user.click(
      await screen.findByRole("option", { name: "Dana Okafor" }),
    );
    await waitFor(() =>
      expect(onAssignManager).toHaveBeenCalledWith("team-1", "user-2"),
    );
  });

  it("confirms before deleting and reports the removal", async () => {
    const user = userEvent.setup();
    const props = baseProps(makeTeam());
    render(<TeamDetailDialog {...props} />);

    await screen.findByDisplayValue("Production Team");
    await user.click(screen.getByRole("button", { name: "Delete team" }));
    expect(props.onDelete).not.toHaveBeenCalled();

    await user.click(screen.getByRole("button", { name: "Confirm delete" }));
    await waitFor(() => expect(props.onDelete).toHaveBeenCalledWith("team-1"));
    expect(props.onDeleted).toHaveBeenCalledWith("team-1");
  });

  it("surfaces an in-use error when a delete is refused", async () => {
    const user = userEvent.setup();
    const props = baseProps(makeTeam());
    props.onDelete = vi.fn((): Promise<DeleteTeamOutcome> =>
      Promise.resolve({ status: "in_use" }),
    );
    render(<TeamDetailDialog {...props} />);

    await screen.findByDisplayValue("Production Team");
    await user.click(screen.getByRole("button", { name: "Delete team" }));
    await user.click(screen.getByRole("button", { name: "Confirm delete" }));

    expect(
      await screen.findByText(
        "This team still has members and cannot be removed.",
      ),
    ).toBeVisible();
    expect(props.onDeleted).not.toHaveBeenCalled();
  });

  it("shows an error state when the team cannot be loaded", async () => {
    const props = baseProps(makeTeam());
    props.getTeam = vi.fn(() => Promise.resolve(null));
    render(<TeamDetailDialog {...props} />);
    expect(
      await screen.findByText("We could not load this team"),
    ).toBeVisible();
  });
});
