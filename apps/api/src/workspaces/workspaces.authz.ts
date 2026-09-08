import { WorkspaceKind } from "../generated/prisma/client.js";

/**
 * WSP-02 introduces no new permission keys. The connected workspace has no
 * catalog key of its own (the entity-manager key set is open in PC-07), so
 * every workspace operation is authorized with the *existing* key of the
 * module that owns the workspace, selected by its `kind`. `PRODUCTION` shares
 * the project keys: Production Management owns production projects but they
 * follow the common project lifecycle and authorization.
 *
 * This map is the single place that translation lives. The application service
 * is the authoritative boundary for these checks because the required key
 * depends on the persisted `kind`, which the static transport guard cannot
 * see; every check runs at ORGANIZATION scope, matching the seeded matrix
 * where these write keys and the module read keys are organization-scoped.
 */
export interface WorkspacePermissionSet {
  /** View a workspace of this kind and its composition. */
  readonly read: string;
  /** Create a workspace root of this kind. */
  readonly create: string;
  /** Remove a workspace root of this kind. */
  readonly remove: string;
  /** Set or clear the workspace manager. */
  readonly assignManager: string;
  /**
   * Assign or unassign a team, and add or remove an individual participant.
   * The catalog has no separate participant key, so participant management
   * rides the same key as team assignment for the owning module.
   */
  readonly assignMembers: string;
}

const EVENT_PERMISSIONS: WorkspacePermissionSet = {
  read: "event.read",
  create: "event.create",
  remove: "event.delete",
  assignManager: "event.assign_manager",
  assignMembers: "event.assign_teams",
};

const PROJECT_PERMISSIONS: WorkspacePermissionSet = {
  read: "project.read",
  create: "project.create",
  remove: "project.delete",
  assignManager: "project.assign",
  assignMembers: "project.assign",
};

const CAMPAIGN_PERMISSIONS: WorkspacePermissionSet = {
  read: "campaign.read",
  create: "campaign.create",
  remove: "campaign.delete",
  assignManager: "campaign.assign",
  assignMembers: "campaign.assign",
};

const PERMISSIONS_BY_KIND: Record<WorkspaceKind, WorkspacePermissionSet> = {
  [WorkspaceKind.EVENT]: EVENT_PERMISSIONS,
  [WorkspaceKind.PROJECT]: PROJECT_PERMISSIONS,
  [WorkspaceKind.PRODUCTION]: PROJECT_PERMISSIONS,
  [WorkspaceKind.CAMPAIGN]: CAMPAIGN_PERMISSIONS,
};

export function permissionsForKind(
  kind: WorkspaceKind,
): WorkspacePermissionSet {
  return PERMISSIONS_BY_KIND[kind];
}
