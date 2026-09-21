import type {
  AssignableEvent,
  AssignableTeam,
  AssignableUser,
  Campaign,
  CampaignActivity,
  PaginatedCampaigns,
} from "./lib/campaigns-types";

/** Shared builders for the campaign UI tests. Not used by production code. */

const now = "2026-09-01T09:00:00.000Z";

export const USERS: AssignableUser[] = [
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

export const TEAMS: AssignableTeam[] = [
  { id: "t1", name: "Marketing Team" },
  { id: "t2", name: "Content Studio" },
];

export const EVENTS: AssignableEvent[] = [
  { id: "e1", name: "Aurora Premiere" },
  { id: "e2", name: "Orbit Launch" },
];

export function makeCampaign(overrides: Partial<Campaign> = {}): Campaign {
  return {
    id: "cmp-1",
    workspaceId: "ws-1",
    name: "Aurora Awareness",
    campaignType: "PROMOTION",
    description: "Awareness push.",
    audience: "Film fans",
    status: "PLANNED",
    startAt: null,
    endAt: null,
    eventId: null,
    productName: null,
    progress: { completedActivities: 0, totalActivities: 0, percent: null },
    manager: null,
    teams: [{ id: "t1", name: "Marketing Team" }],
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

export function makeActivity(
  overrides: Partial<CampaignActivity> = {},
): CampaignActivity {
  return {
    id: "act-1",
    campaignId: "cmp-1",
    name: "Teaser video",
    description: null,
    status: "PLANNED",
    startAt: null,
    endAt: null,
    createdAt: now,
    updatedAt: now,
    ...overrides,
  };
}

export function page(items: Campaign[]): PaginatedCampaigns {
  return { items, page: 1, pageSize: 25, total: items.length };
}
