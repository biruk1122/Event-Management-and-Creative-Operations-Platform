import type { PaginatedUsers, User, UserRoleSummary } from "../lib/users-types";

/**
 * Placeholder content for the user administration UI. USR-05 replaces every
 * seam in this feature with real `@event-platform/api-client` calls; nothing
 * here is a production dependency.
 */

const now = "2026-09-01T09:00:00.000Z";

export const FIXTURE_ROLES: readonly UserRoleSummary[] = [
  { id: "role-super-admin", name: "Super Admin" },
  { id: "role-management", name: "Management/Administrator" },
  { id: "role-department-manager", name: "Department Manager" },
  { id: "role-team-member", name: "Team Member" },
  { id: "role-talent-manager", name: "Talent Manager" },
];

function user(overrides: Partial<User> & Pick<User, "id" | "email">): User {
  return {
    firstName: null,
    lastName: null,
    phone: null,
    profileImage: null,
    status: "ACTIVE",
    deactivatedAt: null,
    role: null,
    mustChangePassword: false,
    createdAt: now,
    updatedAt: now,
    ...overrides,
  };
}

export const FIXTURE_USERS: readonly User[] = [
  user({
    id: "user-001",
    email: "sydney.root@example.com",
    firstName: "Sydney",
    lastName: "Root",
    phone: "+1 (555) 000-0001",
    role: FIXTURE_ROLES[0]!,
  }),
  user({
    id: "user-002",
    email: "morgan.lead@example.com",
    firstName: "Morgan",
    lastName: "Lead",
    phone: "+1 (555) 000-0002",
    role: FIXTURE_ROLES[1]!,
  }),
  user({
    id: "user-003",
    email: "dana.dept@example.com",
    firstName: "Dana",
    lastName: "Okafor",
    role: FIXTURE_ROLES[2]!,
  }),
  user({
    id: "user-004",
    email: "robin.doer@example.com",
    firstName: "Robin",
    lastName: "Doer",
    role: FIXTURE_ROLES[3]!,
    mustChangePassword: true,
  }),
  user({
    id: "user-005",
    email: "tal.manager@example.com",
    firstName: "Tal",
    lastName: "Ferreira",
    role: FIXTURE_ROLES[4]!,
  }),
  user({
    id: "user-006",
    email: "jules.pending@example.com",
    firstName: "Jules",
    lastName: "Nkemelu",
    mustChangePassword: true,
  }),
  user({
    id: "user-007",
    email: "former.staff@example.com",
    firstName: "Former",
    lastName: "Staff",
    status: "INACTIVE",
    deactivatedAt: "2026-08-15T12:00:00.000Z",
    role: FIXTURE_ROLES[3]!,
  }),
  user({
    id: "user-008",
    email: "no.name@example.com",
  }),
];

/** A single fixture page: the seam ignores filters and always returns this. */
export const FIXTURE_PAGE: PaginatedUsers = {
  items: [...FIXTURE_USERS],
  page: 1,
  pageSize: 25,
  total: FIXTURE_USERS.length,
};
