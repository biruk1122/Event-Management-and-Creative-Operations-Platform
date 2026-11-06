import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

import {
  assignEventTeam,
  listAssignableTeams,
  listEventTeams,
  removeEventTeam,
} from "../../api/events-gateway";

import { EventTeamsTab } from "./event-teams-tab";

const workspace = vi.hoisted(() => ({
  value: null as unknown,
}));

vi.mock("./event-workspace-shell", () => ({
  useEventWorkspace: () => workspace.value,
}));

vi.mock("../../api/events-gateway", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../../api/events-gateway")>()),
  listEventTeams: vi.fn(),
  listAssignableTeams: vi.fn(),
  assignEventTeam: vi.fn(),
  removeEventTeam: vi.fn(),
}));

const EVENT_ID = "11111111-1111-4111-8111-111111111111";
const TEAM_ID = "22222222-2222-4222-8222-222222222222";

function team(overrides: Record<string, unknown> = {}) {
  return {
    id: TEAM_ID,
    name: "Creative Team",
    description: "Briefs and visuals",
    department: { id: "d1", name: "Creative" },
    manager: {
      id: "m1",
      email: "manager@example.com",
      firstName: "Maya",
      lastName: "Lee",
    },
    membersVisible: true,
    members: [
      {
        id: "u1",
        email: "ada@example.com",
        firstName: "Ada",
        lastName: "Bell",
      },
    ],
    ...overrides,
  };
}

function setWorkspace(canAssignTeams: boolean) {
  workspace.value = {
    event: { id: EVENT_ID, name: "Launch night" },
    access: { userId: "me", grants: [] },
    abilities: { canAssignTeams },
  };
}

function renderTab() {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return render(
    <QueryClientProvider client={client}>
      <EventTeamsTab />
    </QueryClientProvider>,
  );
}

describe("EventTeamsTab", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(listAssignableTeams).mockResolvedValue([]);
  });

  it("shows an assigned team with its manager and members", async () => {
    setWorkspace(true);
    vi.mocked(listEventTeams).mockResolvedValue([team()] as never);

    renderTab();

    expect(await screen.findByText("Creative Team")).toBeInTheDocument();
    expect(screen.getByText("Maya Lee")).toBeInTheDocument();
    expect(screen.getByText("Ada Bell")).toBeInTheDocument();
  });

  it("hides member names when the caller cannot read teams", async () => {
    setWorkspace(false);
    vi.mocked(listEventTeams).mockResolvedValue([
      team({ membersVisible: false, members: [], manager: null }),
    ] as never);

    renderTab();

    expect(await screen.findByText("Creative Team")).toBeInTheDocument();
    expect(
      screen.getByText("Visible to team managers and the department"),
    ).toBeInTheDocument();
    expect(screen.queryByText("Ada Bell")).not.toBeInTheDocument();
  });

  it("offers no assign or remove actions without team assignment rights", async () => {
    setWorkspace(false);
    vi.mocked(listEventTeams).mockResolvedValue([team()] as never);

    renderTab();

    await screen.findByText("Creative Team");
    expect(screen.queryByRole("button", { name: /assign team/i })).toBeNull();
    expect(screen.queryByRole("button", { name: /remove/i })).toBeNull();
  });

  it("removes only the event link after confirmation", async () => {
    setWorkspace(true);
    vi.mocked(listEventTeams).mockResolvedValue([team()] as never);
    vi.mocked(removeEventTeam).mockResolvedValue({
      status: "success",
    } as never);
    const user = userEvent.setup();

    renderTab();
    await user.click(
      await screen.findByRole("button", { name: /remove creative team/i }),
    );
    const dialog = await screen.findByRole("dialog");
    expect(
      within(dialog).getByText(/stay on the teams page/i),
    ).toBeInTheDocument();
    await user.click(
      within(dialog).getByRole("button", { name: /remove from event/i }),
    );

    await waitFor(() =>
      expect(removeEventTeam).toHaveBeenCalledWith(EVENT_ID, TEAM_ID),
    );
  });

  it("assigns a selected team and does not offer teams already assigned", async () => {
    setWorkspace(true);
    vi.mocked(listEventTeams).mockResolvedValue([team()] as never);
    vi.mocked(listAssignableTeams).mockResolvedValue([
      { id: TEAM_ID, name: "Creative Team" },
      { id: "33333333-3333-4333-8333-333333333333", name: "Ops Team" },
    ]);
    vi.mocked(assignEventTeam).mockResolvedValue({
      status: "success",
    } as never);
    const user = userEvent.setup();

    renderTab();
    await user.click(
      await screen.findByRole("button", { name: /assign team/i }),
    );
    const dialog = await screen.findByRole("dialog");
    const assigned = await within(dialog).findByRole("option", {
      name: /creative team/i,
    });
    expect(assigned).toBeDisabled();
    await user.click(within(dialog).getByRole("option", { name: /ops team/i }));
    await user.click(
      within(dialog).getByRole("button", { name: /assign team/i }),
    );

    await waitFor(() =>
      expect(assignEventTeam).toHaveBeenCalledWith(
        EVENT_ID,
        "33333333-3333-4333-8333-333333333333",
      ),
    );
  });
});
