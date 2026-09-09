import type { Workspace, WorkspaceKind } from "./workspaces-types";

export interface CreateWorkspaceValues {
  kind: WorkspaceKind;
  managerId: string | null;
}

/**
 * Result of a create attempt, in UI terms. WSP-05 maps the real
 * `POST /workspaces` Problem Details codes onto these cases; the form only
 * needs to know which state to present.
 */
export type SaveWorkspaceOutcome =
  | { status: "success"; workspace: Workspace }
  | { status: "manager_not_found" }
  | {
      status: "field_errors";
      fieldErrors: Partial<Record<keyof CreateWorkspaceValues, string>>;
    }
  | { status: "permission_denied" }
  | { status: "unexpected" };

export type CreateWorkspace = (
  values: CreateWorkspaceValues,
) => Promise<SaveWorkspaceOutcome>;

/** Result of `PUT /workspaces/:id/manager`. */
export type AssignManagerOutcome =
  | { status: "success"; workspace: Workspace }
  | { status: "manager_not_found" }
  | { status: "not_found" }
  | { status: "permission_denied" }
  | { status: "unexpected" };

export type AssignWorkspaceManager = (
  id: string,
  managerId: string | null,
) => Promise<AssignManagerOutcome>;

/** Result of `PUT` / `DELETE /workspaces/:id/teams/:teamId`. */
export type WorkspaceTeamOutcome =
  | { status: "success"; workspace: Workspace }
  | { status: "team_not_found" }
  | { status: "not_assigned" }
  | { status: "not_found" }
  | { status: "permission_denied" }
  | { status: "unexpected" };

export type AssignWorkspaceTeam = (
  id: string,
  teamId: string,
) => Promise<WorkspaceTeamOutcome>;

export type RemoveWorkspaceTeam = (
  id: string,
  teamId: string,
) => Promise<WorkspaceTeamOutcome>;

/** Result of `PUT` / `DELETE /workspaces/:id/participants/:userId`. */
export type WorkspaceParticipantOutcome =
  | { status: "success"; workspace: Workspace }
  | { status: "user_not_found" }
  | { status: "not_a_participant" }
  | { status: "not_found" }
  | { status: "permission_denied" }
  | { status: "unexpected" };

export type AddWorkspaceParticipant = (
  id: string,
  userId: string,
) => Promise<WorkspaceParticipantOutcome>;

export type RemoveWorkspaceParticipant = (
  id: string,
  userId: string,
) => Promise<WorkspaceParticipantOutcome>;

/** Result of `DELETE /workspaces/:id`. */
export type DeleteWorkspaceOutcome =
  | { status: "success" }
  | { status: "not_found" }
  | { status: "permission_denied" }
  | { status: "unexpected" };

export type DeleteWorkspace = (id: string) => Promise<DeleteWorkspaceOutcome>;

/** Loads one workspace for the detail dialog; resolves `null` when it cannot. */
export type GetWorkspace = (id: string) => Promise<Workspace | null>;
