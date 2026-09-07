import type {
  AssignableUser,
  Department,
  DepartmentManagerSummary,
  PaginatedDepartments,
} from "../lib/departments-types";

/**
 * Placeholder content for the department administration UI. DEP-05 replaces
 * every seam in this feature with real `@event-platform/api-client` calls;
 * nothing here is a production dependency.
 */

const now = "2026-09-01T09:00:00.000Z";

export const FIXTURE_MANAGERS: readonly AssignableUser[] = [
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

function summaryOf(user: AssignableUser): DepartmentManagerSummary {
  return {
    id: user.id,
    email: user.email,
    firstName: user.firstName,
    lastName: user.lastName,
  };
}

function department(
  overrides: Partial<Department> & Pick<Department, "id" | "name">,
): Department {
  return {
    description: null,
    manager: null,
    employeeCount: 0,
    deactivatedAt: null,
    createdAt: now,
    updatedAt: now,
    ...overrides,
  };
}

export const FIXTURE_DEPARTMENTS: readonly Department[] = [
  department({
    id: "dep-001",
    name: "Event Management",
    description: "Owns planning and delivery for all events.",
    manager: summaryOf(FIXTURE_MANAGERS[0]!),
    employeeCount: 14,
  }),
  department({
    id: "dep-002",
    name: "Production",
    description: "Runs on-site production and technical delivery.",
    manager: summaryOf(FIXTURE_MANAGERS[1]!),
    employeeCount: 9,
  }),
  department({
    id: "dep-003",
    name: "Marketing",
    description: "Brand, campaigns, and audience growth.",
    manager: summaryOf(FIXTURE_MANAGERS[2]!),
    employeeCount: 6,
  }),
  department({
    id: "dep-004",
    name: "Creative Department",
    description: "Design, copy, and creative direction.",
    employeeCount: 4,
  }),
  department({
    id: "dep-005",
    name: "Talent Management",
    description: "Talent records, schedules, and assignments.",
    manager: summaryOf(FIXTURE_MANAGERS[3]!),
    employeeCount: 3,
  }),
  department({
    id: "dep-006",
    name: "Promotion",
    description: "Retired unit, kept for historical reference.",
    deactivatedAt: "2026-08-20T12:00:00.000Z",
    employeeCount: 0,
  }),
];

/** A single fixture page: the seam ignores filters and always returns this. */
export const FIXTURE_PAGE: PaginatedDepartments = {
  items: [...FIXTURE_DEPARTMENTS],
  page: 1,
  pageSize: 25,
  total: FIXTURE_DEPARTMENTS.length,
};
