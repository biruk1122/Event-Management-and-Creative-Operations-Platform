import type { PermissionScope } from "../generated/prisma/client.js";

/**
 * `channel.create`/`channel.manage` are the only Discuss keys with real scope
 * structure in the seeded matrix: Management/Administrator holds them at
 * `ORGANIZATION`, Department Manager at `DEPARTMENT` (permission catalogue).
 * Unlike `workspaces.authz.ts`'s `permissionsForKind`, the key never changes
 * here - only the scope a caller must hold does, resolved from which owner
 * field (if any) the channel names.
 *
 * A department-owned channel checks at `DEPARTMENT`, matched against the
 * caller's own department. Every other case - workspace-owned, team-owned,
 * or general-purpose (no owner; product vocabulary) - checks at
 * `ORGANIZATION`. Team ownership is deliberately not escalated to the team's
 * own department: the seeded matrix gives Department Manager `DEPARTMENT`
 * scope over department-owned records, not transitively over every team
 * inside their department, and nothing in the permission catalogue extends
 * `channel.create`/`channel.manage` that way. A future issue can add that
 * escalation explicitly if the product decision is made; this slice does not
 * invent it.
 */
export function channelOwnerScope(owner: {
  workspaceId?: string | null;
  departmentId?: string | null;
  teamId?: string | null;
}): PermissionScope {
  return owner.departmentId ? "DEPARTMENT" : "ORGANIZATION";
}
