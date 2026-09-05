import type { Permission } from "./rbac-types";

export interface PermissionGroup {
  resource: string;
  permissions: Permission[];
}

/** The segment before the first `.`, e.g. `role.read` groups under `role`. */
function resourceOf(permissionKey: string): string {
  return permissionKey.split(".")[0] ?? permissionKey;
}

/** Turns `role` into `Role`, `campaign` into `Campaign`, for a group heading. */
export function resourceLabel(resource: string): string {
  return resource.length > 0
    ? resource[0]!.toUpperCase() + resource.slice(1)
    : resource;
}

/**
 * Groups permissions by their resource prefix, preserving catalog order both
 * across groups and within each group.
 */
export function groupPermissionsByResource(
  permissions: readonly Permission[],
): PermissionGroup[] {
  const groups = new Map<string, Permission[]>();

  for (const permission of permissions) {
    const resource = resourceOf(permission.key);
    const existing = groups.get(resource);
    if (existing) {
      existing.push(permission);
    } else {
      groups.set(resource, [permission]);
    }
  }

  return Array.from(groups.entries()).map(
    ([resource, resourcePermissions]) => ({
      resource,
      permissions: resourcePermissions,
    }),
  );
}

/** Case-insensitive match against a permission's key or description. */
export function matchesQuery(permission: Permission, query: string): boolean {
  const normalized = query.trim().toLowerCase();
  if (normalized === "") {
    return true;
  }
  return (
    permission.key.toLowerCase().includes(normalized) ||
    permission.description.toLowerCase().includes(normalized)
  );
}
