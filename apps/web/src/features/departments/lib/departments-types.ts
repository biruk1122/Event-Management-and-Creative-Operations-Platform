import type { components } from "@event-platform/api-client";

export type Department = components["schemas"]["DepartmentResponse"];
export type PaginatedDepartments =
  components["schemas"]["PaginatedDepartmentsResponse"];
export type DepartmentManagerSummary =
  components["schemas"]["DepartmentManagerSummary"];

/**
 * A user the manager control can offer. The department API has no
 * "assignable users" route, so DEP-05 sources this from `GET /users`; the
 * seam returns a small fixture set.
 */
export interface AssignableUser {
  id: string;
  email: string;
  firstName: string | null;
  lastName: string | null;
}

/** ACTIVE = no deactivation marker set. Mirrors the API list `status` filter. */
export type DepartmentActivity = "ACTIVE" | "INACTIVE";

export const DEPARTMENT_ACTIVITIES: readonly DepartmentActivity[] = [
  "ACTIVE",
  "INACTIVE",
];

export const DEPARTMENT_ACTIVITY_LABELS: Record<DepartmentActivity, string> = {
  ACTIVE: "Active",
  INACTIVE: "Inactive",
};

/** The person's name, or their email when no name is on file. */
export function personName(
  person: Pick<AssignableUser, "firstName" | "lastName" | "email">,
): string {
  const parts = [person.firstName, person.lastName].filter(
    (part): part is string => Boolean(part),
  );
  return parts.length > 0 ? parts.join(" ") : person.email;
}

/** Whether a department is currently active (no deactivation marker). */
export function activityOf(
  department: Pick<Department, "deactivatedAt">,
): DepartmentActivity {
  return department.deactivatedAt === null ? "ACTIVE" : "INACTIVE";
}
