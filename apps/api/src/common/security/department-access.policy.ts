import type { PermissionScope } from "../../generated/prisma/client.js";

export const PLATFORM_ROLES = [
  "SUPER_ADMIN",
  "DEPARTMENT_MANAGER",
  "DEPARTMENT_MEMBER",
] as const;
export type PlatformRole = (typeof PLATFORM_ROLES)[number];

export const PLATFORM_DEPARTMENTS = [
  "Production",
  "Marketing",
  "Promotion",
  "Manager / Event & Office Manager",
] as const;

/** Legacy row names remain readable during the staged, non-destructive migration. */
export function platformRole(name: string): PlatformRole | null {
  switch (name) {
    case "Super Admin":
    case "SUPER_ADMIN":
      return "SUPER_ADMIN";
    case "Department Manager":
    case "DEPARTMENT_MANAGER":
      return "DEPARTMENT_MANAGER";
    case "Team Member":
    case "Department Member":
    case "DEPARTMENT_MEMBER":
      return "DEPARTMENT_MEMBER";
    default:
      return null;
  }
}

export function supportedDepartment(name: string): boolean {
  return PLATFORM_DEPARTMENTS.some((department) => department === name);
}

export interface DepartmentAccessContext {
  role: PlatformRole | null;
  department: { id: string; name: string; active: boolean } | null;
}

interface Grant {
  permissionKey: string;
  scope: PermissionScope;
}

/** A permission row cannot turn a department account into an organization administrator. */
export function constrainDepartmentGrants(
  context: DepartmentAccessContext,
  grants: readonly Grant[],
): Grant[] {
  if (context.role === "SUPER_ADMIN") return [...grants];
  if (
    !context.role ||
    !context.department?.active ||
    !supportedDepartment(context.department.name)
  ) {
    return grants.filter(
      (grant) =>
        grant.scope === "SELF" &&
        ["profile.read", "profile.update"].includes(grant.permissionKey),
    );
  }
  return grants.filter((grant) => {
    if (grant.scope === "ORGANIZATION" || grant.scope === "MANAGEMENT") {
      return false;
    }
    if (context.role === "DEPARTMENT_MEMBER") return grant.scope === "SELF";
    return true;
  });
}
