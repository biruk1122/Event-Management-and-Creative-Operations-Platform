import type { PermissionScope } from "../generated/prisma/client.js";

/**
 * `channel.create` is a baseline SELF grant, so every user may create a
 * channel. The scope only decides ownership: a department-owned channel must
 * name the caller's own department (checked in the service); every other
 * channel - workspace-owned, team-owned, or general-purpose - is open to any
 * user. `channel.manage` keeps its own scoped checks.
 */
export function channelOwnerScope(owner: {
  workspaceId?: string | null;
  departmentId?: string | null;
  teamId?: string | null;
}): PermissionScope {
  return owner.departmentId ? "DEPARTMENT" : "ORGANIZATION";
}
