import type { components } from "@event-platform/api-client";

export type Team = components["schemas"]["TeamResponse"];
export type PaginatedTeams = components["schemas"]["PaginatedTeamsResponse"];
export type TeamUserSummary = components["schemas"]["TeamUserSummary"];
export type TeamDepartmentSummary =
  components["schemas"]["TeamDepartmentSummary"];

/**
 * A user the manager / member controls can offer. The team API has no
 * "assignable users" route, so TEAM-05 sources this from `GET /users`; the
 * seam returns a small fixture set.
 */
export interface AssignableUser {
  id: string;
  email: string;
  firstName: string | null;
  lastName: string | null;
}

/**
 * A department the create dialog can offer as the owner of a new team. A
 * team's department is fixed at creation, so this is only needed there;
 * TEAM-05 sources it from `GET /departments`.
 */
export interface AssignableDepartment {
  id: string;
  name: string;
}

/** ACTIVE = no deactivation marker set. Mirrors the API list `status` filter. */
export type TeamActivity = "ACTIVE" | "INACTIVE";

export const TEAM_ACTIVITIES: readonly TeamActivity[] = ["ACTIVE", "INACTIVE"];

export const TEAM_ACTIVITY_LABELS: Record<TeamActivity, string> = {
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

/** Whether a team is currently active (no deactivation marker). */
export function activityOf(team: Pick<Team, "deactivatedAt">): TeamActivity {
  return team.deactivatedAt === null ? "ACTIVE" : "INACTIVE";
}
