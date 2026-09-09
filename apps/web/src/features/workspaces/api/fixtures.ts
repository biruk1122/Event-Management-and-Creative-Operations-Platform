import type {
  AssignableTeam,
  AssignableUser,
  PaginatedWorkspaces,
  Workspace,
} from "../lib/workspaces-types";

/**
 * Placeholder content for the connected workspace ownership UI. WSP-05 (EVE-73)
 * replaces every seam in this feature with real `@event-platform/api-client`
 * calls and TanStack Query wiring; nothing here is a production dependency.
 *
 * The real `GET /workspaces` requires a `kind` filter and paginates per kind.
 * This fixture page carries all four kinds so the surface, its client-side
 * kind filter, and its pagination can be built and tested; WSP-05 owns the
 * real per-kind fetch strategy.
 */

const now = "2026-09-01T09:00:00.000Z";

export const FIXTURE_USERS: readonly AssignableUser[] = [
  {
    id: "user-morgan",
    email: "morgan.lead@example.com",
    firstName: "Morgan",
    lastName: "Lead",
  },
  {
    id: "user-dana",
    email: "dana.okafor@example.com",
    firstName: "Dana",
    lastName: "Okafor",
  },
  {
    id: "user-tal",
    email: "tal.ferreira@example.com",
    firstName: "Tal",
    lastName: "Ferreira",
  },
  {
    id: "user-sydney",
    email: "sydney.root@example.com",
    firstName: "Sydney",
    lastName: "Root",
  },
  {
    id: "user-noname",
    email: "no.name@example.com",
    firstName: null,
    lastName: null,
  },
];

export const FIXTURE_TEAMS: readonly AssignableTeam[] = [
  { id: "team-production", name: "Production Team" },
  { id: "team-marketing", name: "Marketing Team" },
  { id: "team-stage", name: "Stage Crew" },
  { id: "team-content", name: "Content Studio" },
];

function summaryOf(user: AssignableUser) {
  return {
    id: user.id,
    email: user.email,
    firstName: user.firstName,
    lastName: user.lastName,
  };
}

function teamSummaryOf(team: AssignableTeam) {
  return { id: team.id, name: team.name };
}

function workspace(
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

export const FIXTURE_WORKSPACES: readonly Workspace[] = [
  workspace({
    id: "ws-summer-festival",
    kind: "EVENT",
    manager: summaryOf(FIXTURE_USERS[0]!),
    teams: [teamSummaryOf(FIXTURE_TEAMS[0]!), teamSummaryOf(FIXTURE_TEAMS[2]!)],
    participants: [summaryOf(FIXTURE_USERS[1]!), summaryOf(FIXTURE_USERS[3]!)],
  }),
  workspace({
    id: "ws-brand-refresh",
    kind: "PROJECT",
    manager: summaryOf(FIXTURE_USERS[2]!),
    teams: [teamSummaryOf(FIXTURE_TEAMS[3]!)],
  }),
  workspace({
    id: "ws-mainstage-build",
    kind: "PRODUCTION",
    participants: [summaryOf(FIXTURE_USERS[4]!)],
  }),
  workspace({
    id: "ws-autumn-campaign",
    kind: "CAMPAIGN",
    manager: summaryOf(FIXTURE_USERS[1]!),
    teams: [teamSummaryOf(FIXTURE_TEAMS[1]!)],
    participants: [summaryOf(FIXTURE_USERS[0]!)],
  }),
  workspace({ id: "ws-product-launch", kind: "EVENT" }),
];

export const FIXTURE_PAGE: PaginatedWorkspaces = {
  items: [...FIXTURE_WORKSPACES],
  page: 1,
  pageSize: 25,
  total: FIXTURE_WORKSPACES.length,
};

export function fixtureWorkspace(id: string): Workspace | null {
  return FIXTURE_WORKSPACES.find((item) => item.id === id) ?? null;
}
