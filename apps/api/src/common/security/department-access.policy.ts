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
  "HR & Executive Officer",
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

/** The one department name this helper (and every HR-only feature) checks against. */
export const HR_EXECUTIVE_OFFICER_DEPARTMENT = "HR & Executive Officer";

/**
 * Whether the caller is specifically the manager of the HR & Executive
 * Officer department - the shared, service-layer-only boundary Employee
 * Management and Letters/Documents both enforce. The RBAC catalog has no
 * per-department branching, so `letter.*`/`document.*`/`employee.*` keys are
 * granted generically to every Department Manager; this check is what makes
 * that grant resolve to real access for exactly one department and stay
 * inert for every other one. It does not include Super Admin - callers
 * combine it with their own organization-scope grant check for that case.
 */
export function isHrExecutiveOfficerManager(
  context: DepartmentAccessContext,
): boolean {
  return (
    context.role === "DEPARTMENT_MANAGER" &&
    context.department?.active === true &&
    context.department.name === HR_EXECUTIVE_OFFICER_DEPARTMENT
  );
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
