import { progressOf } from "../lib/campaigns-types";
import type {
  AssignableEvent,
  AssignableTeam,
  AssignableUser,
  Campaign,
  CampaignActivity,
  CampaignBudget,
  PaginatedCampaigns,
} from "../lib/campaigns-types";

/**
 * Placeholder content for the campaign platform UI. CAM-05 replaces every seam
 * in this feature with real `@event-platform/api-client` calls and TanStack
 * Query wiring; nothing here is a production dependency.
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
    id: "user-noname",
    email: "no.name@example.com",
    firstName: null,
    lastName: null,
  },
];

export const FIXTURE_TEAMS: readonly AssignableTeam[] = [
  { id: "team-marketing", name: "Marketing Team" },
  { id: "team-content", name: "Content Studio" },
  { id: "team-social", name: "Social Media Desk" },
  { id: "team-production", name: "Production Team" },
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

function activity(
  campaignId: string,
  overrides: Partial<CampaignActivity> & Pick<CampaignActivity, "id" | "name">,
): CampaignActivity {
  return {
    campaignId,
    description: null,
    status: "PLANNED",
    startAt: null,
    endAt: null,
    createdAt: now,
    updatedAt: now,
    ...overrides,
  };
}

/** Activities are keyed by campaign id; a missing entry means "no activities". */
export const FIXTURE_ACTIVITIES: Record<string, CampaignActivity[]> = {
  "cmp-aurora-awareness": [
    activity("cmp-aurora-awareness", {
      id: "act-teaser",
      name: "Teaser video release",
      description: "Publish the 30-second teaser across channels.",
      status: "COMPLETED",
      startAt: "2026-09-10T09:00:00.000Z",
      endAt: "2026-09-12T09:00:00.000Z",
    }),
    activity("cmp-aurora-awareness", {
      id: "act-influencers",
      name: "Influencer seeding",
      status: "IN_PROGRESS",
      startAt: "2026-09-15T09:00:00.000Z",
    }),
    activity("cmp-aurora-awareness", {
      id: "act-radio",
      name: "Radio spots",
      status: "PLANNED",
    }),
    activity("cmp-aurora-awareness", {
      id: "act-tv",
      name: "Television placement",
      status: "CANCELLED",
    }),
  ],
  "cmp-orbit-launch-push": [
    activity("cmp-orbit-launch-push", {
      id: "act-landing",
      name: "Landing page",
      status: "COMPLETED",
    }),
    activity("cmp-orbit-launch-push", {
      id: "act-email",
      name: "Launch email series",
      status: "COMPLETED",
    }),
  ],
};

function campaign(
  overrides: Partial<Campaign> & Pick<Campaign, "id" | "name" | "campaignType">,
): Campaign {
  const activities = FIXTURE_ACTIVITIES[overrides.id] ?? [];
  return {
    workspaceId: `ws-${overrides.id}`,
    description: null,
    audience: null,
    status: "PLANNED",
    startAt: null,
    endAt: null,
    eventId: null,
    productName: null,
    progress: progressOf(activities),
    manager: null,
    teams: [],
    participants: [],
    createdBy: summaryOf(FIXTURE_USERS[0]!),
    createdAt: now,
    updatedAt: now,
    ...overrides,
  };
}

export const FIXTURE_CAMPAIGNS: Campaign[] = [
  campaign({
    id: "cmp-aurora-awareness",
    name: "Aurora Premiere Awareness",
    campaignType: "PROMOTION",
    status: "ACTIVE",
    description: "Multi-channel awareness push ahead of the premiere.",
    audience: "Film enthusiasts aged 18–35",
    startAt: "2026-09-10T00:00:00.000Z",
    endAt: "2026-10-04T00:00:00.000Z",
    eventId: "event-aurora-premiere",
    manager: summaryOf(FIXTURE_USERS[0]!),
    teams: [teamSummaryOf(FIXTURE_TEAMS[0]!), teamSummaryOf(FIXTURE_TEAMS[2]!)],
    participants: [summaryOf(FIXTURE_USERS[1]!)],
  }),
  campaign({
    id: "cmp-orbit-launch-push",
    name: "Orbit Launch Push",
    campaignType: "MARKETING",
    status: "ACTIVE",
    audience: "Existing customers and tech press",
    productName: "Orbit Smart Speaker",
    startAt: "2026-09-01T00:00:00.000Z",
    manager: summaryOf(FIXTURE_USERS[2]!),
    teams: [teamSummaryOf(FIXTURE_TEAMS[1]!)],
  }),
  campaign({
    id: "cmp-holiday-brand",
    name: "Holiday Brand Story",
    campaignType: "MARKETING",
    status: "PLANNED",
    description: "Seasonal storytelling across owned channels.",
  }),
  campaign({
    id: "cmp-harvest-recap",
    name: "Harvest Gala Recap",
    campaignType: "PROMOTION",
    status: "COMPLETED",
    eventId: "event-harvest-gala",
    startAt: "2026-05-02T00:00:00.000Z",
    endAt: "2026-05-20T00:00:00.000Z",
    manager: summaryOf(FIXTURE_USERS[1]!),
  }),
  campaign({
    id: "cmp-spring-refresh",
    name: "Spring Refresh",
    campaignType: "MARKETING",
    status: "CANCELLED",
  }),
];

/** Budgets are keyed by campaign id; a missing entry means "no budget set". */
export const FIXTURE_BUDGETS: Record<string, CampaignBudget> = {
  "cmp-aurora-awareness": { amount: "25000.00", currency: "USD" },
  "cmp-harvest-recap": { amount: "6500.00", currency: "EUR" },
};

export const FIXTURE_PAGE: PaginatedCampaigns = {
  items: [...FIXTURE_CAMPAIGNS],
  page: 1,
  pageSize: 25,
  total: FIXTURE_CAMPAIGNS.length,
};

export function fixtureCampaign(id: string): Campaign | null {
  return FIXTURE_CAMPAIGNS.find((item) => item.id === id) ?? null;
}

export function fixtureBudget(id: string): CampaignBudget {
  return FIXTURE_BUDGETS[id] ?? { amount: null, currency: null };
}

export function fixtureActivities(id: string): CampaignActivity[] {
  return [...(FIXTURE_ACTIVITIES[id] ?? [])];
}
