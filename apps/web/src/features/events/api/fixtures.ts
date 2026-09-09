import type {
  AssignableTeam,
  AssignableUser,
  Event,
  EventBudget,
  PaginatedEvents,
} from "../lib/events-types";

/**
 * Placeholder content for the event management UI. EVT-05 (EVE-85) replaces
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

function event(
  overrides: Partial<Event> & Pick<Event, "id" | "name" | "eventType">,
): Event {
  return {
    workspaceId: `ws-${overrides.id}`,
    description: null,
    status: "PLANNING",
    startAt: null,
    endAt: null,
    location: null,
    organizerName: null,
    manager: null,
    teams: [],
    participants: [],
    createdBy: summaryOf(FIXTURE_USERS[0]!),
    createdAt: now,
    updatedAt: now,
    ...overrides,
  };
}

export const FIXTURE_EVENTS: Event[] = [
  event({
    id: "evt-aurora-premiere",
    name: "Aurora Film Premiere",
    eventType: "FILM_PREMIERE",
    status: "READY",
    description: "Red-carpet premiere with press and partners.",
    startAt: "2026-10-04T18:00:00.000Z",
    endAt: "2026-10-04T23:00:00.000Z",
    location: "Grand Hall",
    organizerName: "City Arts Council",
    manager: summaryOf(FIXTURE_USERS[0]!),
    teams: [teamSummaryOf(FIXTURE_TEAMS[0]!), teamSummaryOf(FIXTURE_TEAMS[2]!)],
    participants: [summaryOf(FIXTURE_USERS[1]!), summaryOf(FIXTURE_USERS[3]!)],
  }),
  event({
    id: "evt-midnight-concert",
    name: "Midnight Concert Series",
    eventType: "CONCERT",
    status: "IN_PROGRESS",
    startAt: "2026-09-20T20:00:00.000Z",
    location: "Riverside Amphitheatre",
    manager: summaryOf(FIXTURE_USERS[2]!),
    teams: [teamSummaryOf(FIXTURE_TEAMS[2]!)],
  }),
  event({
    id: "evt-orbit-launch",
    name: "Orbit Product Launch",
    eventType: "PRODUCT_LAUNCH",
    status: "PLANNING",
    description: "Flagship announcement livestream.",
    organizerName: "In-house Marketing",
  }),
  event({
    id: "evt-harvest-gala",
    name: "Harvest Corporate Gala",
    eventType: "CORPORATE_EVENT",
    status: "COMPLETED",
    startAt: "2026-05-02T17:00:00.000Z",
    endAt: "2026-05-02T22:00:00.000Z",
    location: "The Atrium",
    manager: summaryOf(FIXTURE_USERS[1]!),
  }),
  event({
    id: "evt-spring-promo",
    name: "Spring Promotional Pop-up",
    eventType: "PROMOTIONAL_EVENT",
    status: "CANCELLED",
  }),
  event({
    id: "evt-echo-album",
    name: "Echo Album Release",
    eventType: "ALBUM_RELEASE",
    status: "READY",
    startAt: "2026-11-11T12:00:00.000Z",
    manager: summaryOf(FIXTURE_USERS[3]!),
    teams: [teamSummaryOf(FIXTURE_TEAMS[3]!)],
  }),
  event({
    id: "evt-community-day",
    name: "Community Open Day",
    eventType: "OTHER",
    status: "PLANNING",
    location: "Main Campus",
  }),
];

/** Budgets are keyed by event id; a missing entry means "no budget set". */
export const FIXTURE_BUDGETS: Record<string, EventBudget> = {
  "evt-aurora-premiere": { amount: "45000.00", currency: "USD" },
  "evt-harvest-gala": { amount: "18000.00", currency: "EUR" },
};

export const FIXTURE_PAGE: PaginatedEvents = {
  items: [...FIXTURE_EVENTS],
  page: 1,
  pageSize: 25,
  total: FIXTURE_EVENTS.length,
};

export function fixtureEvent(id: string): Event | null {
  return FIXTURE_EVENTS.find((item) => item.id === id) ?? null;
}

export function fixtureBudget(id: string): EventBudget {
  return FIXTURE_BUDGETS[id] ?? { amount: null, currency: null };
}
