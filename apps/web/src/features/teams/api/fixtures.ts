import type {
  AssignableDepartment,
  AssignableUser,
  PaginatedTeams,
  Team,
  TeamUserSummary,
} from "../lib/teams-types";

/**
 * Placeholder content for the team administration UI. TEAM-05 replaces every
 * seam in this feature with real `@event-platform/api-client` calls; nothing
 * here is a production dependency.
 */

const now = "2026-09-01T09:00:00.000Z";

export const FIXTURE_DEPARTMENTS: readonly AssignableDepartment[] = [
  { id: "dep-events", name: "Event Management" },
  { id: "dep-production", name: "Production" },
  { id: "dep-marketing", name: "Marketing" },
  { id: "dep-creative", name: "Creative Department" },
];

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
    id: "user-robin",
    email: "robin.doer@example.com",
    firstName: "Robin",
    lastName: "Doer",
  },
  {
    id: "user-noname",
    email: "no.name@example.com",
    firstName: null,
    lastName: null,
  },
];

function summaryOf(user: AssignableUser): TeamUserSummary {
  return {
    id: user.id,
    email: user.email,
    firstName: user.firstName,
    lastName: user.lastName,
  };
}

function team(
  overrides: Partial<Team> & Pick<Team, "id" | "name" | "department">,
): Team {
  return {
    description: null,
    manager: null,
    members: [],
    deactivatedAt: null,
    createdAt: now,
    updatedAt: now,
    ...overrides,
  };
}

export const FIXTURE_TEAMS: readonly Team[] = [
  team({
    id: "team-001",
    name: "Production Team",
    department: FIXTURE_DEPARTMENTS[1]!,
    description: "Delivers on-site production for events and campaigns.",
    manager: summaryOf(FIXTURE_USERS[1]!),
    members: [
      summaryOf(FIXTURE_USERS[1]!),
      summaryOf(FIXTURE_USERS[2]!),
      summaryOf(FIXTURE_USERS[4]!),
    ],
  }),
  team({
    id: "team-002",
    name: "Event Team",
    department: FIXTURE_DEPARTMENTS[0]!,
    description: "Plans and runs the event calendar.",
    manager: summaryOf(FIXTURE_USERS[0]!),
    members: [summaryOf(FIXTURE_USERS[0]!), summaryOf(FIXTURE_USERS[3]!)],
  }),
  team({
    id: "team-003",
    name: "Marketing Team",
    department: FIXTURE_DEPARTMENTS[2]!,
    description: "Owns campaigns and audience growth.",
    manager: summaryOf(FIXTURE_USERS[2]!),
    members: [summaryOf(FIXTURE_USERS[2]!)],
  }),
  team({
    id: "team-004",
    name: "Creative Team",
    department: FIXTURE_DEPARTMENTS[3]!,
    description: "Design, copy, and creative direction.",
    members: [],
  }),
  team({
    id: "team-005",
    name: "Promotion Team",
    department: FIXTURE_DEPARTMENTS[2]!,
    description: "Retired working group, kept for historical reference.",
    deactivatedAt: "2026-08-20T12:00:00.000Z",
    members: [],
  }),
];

/** A single fixture page: the seam ignores filters and always returns this. */
export const FIXTURE_PAGE: PaginatedTeams = {
  items: [...FIXTURE_TEAMS],
  page: 1,
  pageSize: 25,
  total: FIXTURE_TEAMS.length,
};
