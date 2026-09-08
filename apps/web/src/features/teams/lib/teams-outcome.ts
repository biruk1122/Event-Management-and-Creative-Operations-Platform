import type { Team } from "./teams-types";

export interface CreateTeamValues {
  name: string;
  departmentId: string | null;
  description: string;
  managerId: string | null;
}

export interface TeamProfileValues {
  name: string;
  description: string;
}

/**
 * Result of a create/update attempt, in UI terms. TEAM-05 maps the real
 * `POST /teams` / `PATCH /teams/:id` Problem Details codes onto these cases;
 * the form only needs to know which state to present.
 */
export type SaveTeamOutcome =
  | { status: "success"; team: Team }
  | { status: "name_conflict" }
  | { status: "manager_not_found" }
  | { status: "department_not_found" }
  | { status: "not_found" }
  | {
      status: "field_errors";
      fieldErrors: Partial<Record<keyof CreateTeamValues, string>>;
    }
  | { status: "permission_denied" }
  | { status: "unexpected" };

export type CreateTeam = (values: CreateTeamValues) => Promise<SaveTeamOutcome>;

export type UpdateTeam = (
  id: string,
  values: Partial<TeamProfileValues>,
) => Promise<SaveTeamOutcome>;

/** Result of `POST /teams/:id/deactivate`. */
export type DeactivateTeamOutcome =
  | { status: "success"; team: Team }
  | { status: "already_inactive" }
  | { status: "not_found" }
  | { status: "permission_denied" }
  | { status: "unexpected" };

export type DeactivateTeam = (id: string) => Promise<DeactivateTeamOutcome>;

/** Result of `POST /teams/:id/reactivate`. */
export type ReactivateTeamOutcome =
  | { status: "success"; team: Team }
  | { status: "already_active" }
  | { status: "not_found" }
  | { status: "permission_denied" }
  | { status: "unexpected" };

export type ReactivateTeam = (id: string) => Promise<ReactivateTeamOutcome>;

/** Result of `PUT /teams/:id/manager`. */
export type AssignManagerOutcome =
  | { status: "success"; team: Team }
  | { status: "manager_not_found" }
  | { status: "not_found" }
  | { status: "permission_denied" }
  | { status: "unexpected" };

export type AssignManager = (
  id: string,
  managerId: string | null,
) => Promise<AssignManagerOutcome>;

/** Result of `PUT` / `DELETE /teams/:id/members/:userId`. */
export type MembershipOutcome =
  | { status: "success"; team: Team }
  | { status: "not_found" }
  | { status: "user_not_found" }
  | { status: "not_a_member" }
  | { status: "permission_denied" }
  | { status: "unexpected" };

export type AddTeamMember = (
  id: string,
  userId: string,
) => Promise<MembershipOutcome>;

export type RemoveTeamMember = (
  id: string,
  userId: string,
) => Promise<MembershipOutcome>;

/** Result of `DELETE /teams/:id`. */
export type DeleteTeamOutcome =
  | { status: "success" }
  | { status: "in_use" }
  | { status: "not_found" }
  | { status: "permission_denied" }
  | { status: "unexpected" };

export type DeleteTeam = (id: string) => Promise<DeleteTeamOutcome>;

/** Loads one team for the detail dialog; resolves `null` when it cannot. */
export type GetTeam = (id: string) => Promise<Team | null>;
