import type { TalentAbilities } from "./lib/talent-access";
import type {
  AssignableEvent,
  AssignableUser,
  PaginatedTalents,
  Talent,
} from "./lib/talent-types";

/** Shared builders for the talent UI tests. Not used by production code. */

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

export const EVENTS: AssignableEvent[] = [
  { id: "e1", name: "Aurora Premiere" },
  { id: "e2", name: "Orbit Launch" },
];

export function makeTalent(overrides: Partial<Talent> = {}): Talent {
  return {
    id: "tal-1",
    fullName: "Amina Tesfaye",
    type: "MUSICIAN",
    profileImageId: null,
    email: "amina@example.com",
    phone: null,
    biography: "Singer and live performer.",
    availability: "AVAILABLE",
    manager: null,
    socialLinks: [],
    schedules: [],
    eventAssignments: [],
    createdAt: now,
    updatedAt: now,
    ...overrides,
  };
}

export function page(items: Talent[]): PaginatedTalents {
  return { items, page: 1, pageSize: 25, total: items.length };
}

/** Every ability granted; tests override the ones they want to take away. */
export const ALL_ABILITIES: TalentAbilities = {
  canCreate: true,
  canUpdate: true,
  canTransition: true,
  canAssign: true,
  canManageActivities: true,
};
