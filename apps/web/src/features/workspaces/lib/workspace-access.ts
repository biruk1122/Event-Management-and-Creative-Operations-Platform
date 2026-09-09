import type { CurrentAccess } from "@/features/auth/api/access-queries";

import { WORKSPACE_KINDS, type WorkspaceKind } from "./workspaces-types";

/**
 * The connected workspace has no permission key of its own (WSP-02). Every
 * operation is authorized with the existing key of the module that owns the
 * workspace, chosen by its `kind` - the same mapping the API applies in
 * `workspaces.authz.ts`. Reads are allowed at organization or department
 * scope (a department-scoped reader sees only their own, which the API
 * enforces); writes are checked at organization scope.
 */
type ModulePermissions = {
  read: string;
  create: string;
  remove: string;
  assignManager: string;
  assignMembers: string;
};

const EVENT_PERMISSIONS: ModulePermissions = {
  read: "event.read",
  create: "event.create",
  remove: "event.delete",
  assignManager: "event.assign_manager",
  assignMembers: "event.assign_teams",
};

const PROJECT_PERMISSIONS: ModulePermissions = {
  read: "project.read",
  create: "project.create",
  remove: "project.delete",
  assignManager: "project.assign",
  assignMembers: "project.assign",
};

const CAMPAIGN_PERMISSIONS: ModulePermissions = {
  read: "campaign.read",
  create: "campaign.create",
  remove: "campaign.delete",
  assignManager: "campaign.assign",
  assignMembers: "campaign.assign",
};

const PERMISSIONS_BY_KIND: Record<WorkspaceKind, ModulePermissions> = {
  EVENT: EVENT_PERMISSIONS,
  PROJECT: PROJECT_PERMISSIONS,
  PRODUCTION: PROJECT_PERMISSIONS,
  CAMPAIGN: CAMPAIGN_PERMISSIONS,
};

type Grant = CurrentAccess["grants"][number];

function holds(
  grants: readonly Grant[],
  key: string,
  scopes: readonly string[],
): boolean {
  return grants.some(
    (grant) => grant.permissionKey === key && scopes.includes(grant.scope),
  );
}

/**
 * Whether the caller can read workspaces of this kind. `WorkspacesService`
 * checks the module read key at ORGANIZATION scope only - there is no
 * department-scoped workspace read - so the surface follows the same rule and
 * a department-scoped module reader does not get the workspace list.
 */
export function canReadKind(
  access: CurrentAccess,
  kind: WorkspaceKind,
): boolean {
  return holds(access.grants, PERMISSIONS_BY_KIND[kind].read, ["ORGANIZATION"]);
}

/** The kinds the caller can read, in the canonical order. Empty means denied. */
export function readableKinds(access: CurrentAccess): WorkspaceKind[] {
  return WORKSPACE_KINDS.filter((kind) => canReadKind(access, kind));
}

export interface WorkspaceAbilities {
  canCreate: boolean;
  canAssignManager: boolean;
  canAssignMembers: boolean;
  canDelete: boolean;
}

/** The caller's write abilities for a given workspace kind, at org scope. */
export function abilitiesFor(
  access: CurrentAccess,
  kind: WorkspaceKind,
): WorkspaceAbilities {
  const keys = PERMISSIONS_BY_KIND[kind];
  const can = (key: string) => holds(access.grants, key, ["ORGANIZATION"]);
  return {
    canCreate: can(keys.create),
    canAssignManager: can(keys.assignManager),
    canAssignMembers: can(keys.assignMembers),
    canDelete: can(keys.remove),
  };
}
