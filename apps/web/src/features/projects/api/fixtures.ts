import type {
  AssignableEvent,
  AssignableTeam,
  AssignableUser,
  PaginatedProjects,
  Project,
} from "../lib/projects-types";

/**
 * Placeholder content for the general project management UI. PRJ-05 replaces
 * every seam in this feature with real `@event-platform/api-client` calls and
 * TanStack Query wiring; nothing here is a production dependency.
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
  { id: "team-design", name: "Design Studio" },
  { id: "team-content", name: "Content Studio" },
];

export const FIXTURE_EVENTS: readonly AssignableEvent[] = [
  { id: "event-aurora-premiere", name: "Aurora Film Premiere" },
  { id: "event-orbit-launch", name: "Orbit Product Launch" },
  { id: "event-harvest-gala", name: "Harvest Corporate Gala" },
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

function project(
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
    createdBy: summaryOf(FIXTURE_USERS[0]!),
    createdAt: now,
    updatedAt: now,
    ...overrides,
  };
}

export const FIXTURE_PROJECTS: Project[] = [
  project({
    id: "prj-brand-refresh",
    name: "Brand Refresh",
    status: "ACTIVE",
    description: "Redesign the visual identity across all channels.",
    startAt: "2026-09-15T09:00:00.000Z",
    endAt: "2026-11-30T17:00:00.000Z",
    eventId: "event-aurora-premiere",
    manager: summaryOf(FIXTURE_USERS[0]!),
    teams: [teamSummaryOf(FIXTURE_TEAMS[2]!)],
    participants: [summaryOf(FIXTURE_USERS[1]!)],
  }),
  project({
    id: "prj-venue-partnership",
    name: "Venue Partnership Program",
    status: "PLANNED",
    description: "Negotiate recurring venue agreements for the season.",
    manager: summaryOf(FIXTURE_USERS[2]!),
    teams: [teamSummaryOf(FIXTURE_TEAMS[0]!)],
  }),
  project({
    id: "prj-launch-microsite",
    name: "Launch Microsite",
    status: "ACTIVE",
    startAt: "2026-08-01T09:00:00.000Z",
    eventId: "event-orbit-launch",
    manager: summaryOf(FIXTURE_USERS[1]!),
    teams: [teamSummaryOf(FIXTURE_TEAMS[1]!), teamSummaryOf(FIXTURE_TEAMS[3]!)],
  }),
  project({
    id: "prj-gala-retrospective",
    name: "Gala Retrospective Report",
    status: "COMPLETED",
    startAt: "2026-05-03T09:00:00.000Z",
    endAt: "2026-05-20T17:00:00.000Z",
    eventId: "event-harvest-gala",
    manager: summaryOf(FIXTURE_USERS[3]!),
  }),
  project({
    id: "prj-archived-sponsorship",
    name: "Archived Sponsorship Deck",
    status: "CANCELLED",
  }),
  project({
    id: "prj-community-outreach",
    name: "Community Outreach Plan",
    status: "PLANNED",
    description: "Quarterly plan for community engagement.",
  }),
];

export const FIXTURE_PAGE: PaginatedProjects = {
  items: [...FIXTURE_PROJECTS],
  page: 1,
  pageSize: 25,
  total: FIXTURE_PROJECTS.length,
};

export function fixtureProject(id: string): Project | null {
  return FIXTURE_PROJECTS.find((item) => item.id === id) ?? null;
}
