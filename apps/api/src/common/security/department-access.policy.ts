import type { PermissionScope } from "../../generated/prisma/client.js";

export const PLATFORM_ROLES = [
  "SUPER_ADMIN",
  "ADMIN",
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
    case "Admin":
    case "ADMIN":
      return "ADMIN";
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

/** The department whose manager is the "Production Manager" for talent assignment. */
export const PRODUCTION_DEPARTMENT = "Production";

/**
 * Whether the caller is the manager of the Production department. There is no
 * separate Production Manager role: this is an existing Department Manager
 * whose department is Production. It grants nothing by itself. Talent access
 * combines it with the department of the work item and that work's existing
 * grant (`project.assign` for productions, `event.update` for events), so it
 * never widens access beyond the manager's own department.
 */
export function isProductionManager(context: DepartmentAccessContext): boolean {
  return (
    context.role === "DEPARTMENT_MANAGER" &&
    context.department?.active === true &&
    context.department.name === PRODUCTION_DEPARTMENT
  );
}

interface Grant {
  permissionKey: string;
  scope: PermissionScope;
}

/**
 * The only keys an Admin may hold at organization scope. Admin is a
 * department employee whose coordination reach is explicit rather than
 * inherited from Super Admin, so this allow-list - not the role row - is the
 * real ceiling: `constrainDepartmentGrants` drops every other organization or
 * management grant even if the role is edited through role administration.
 * Nothing here touches users, roles, settings, audit, HR-only features,
 * expense approval, or deletion.
 */
export const ADMIN_ORGANIZATION_PERMISSION_KEYS = [
  "task.create",
  "task.read",
  "task.assign",
  "task.update",
  "task.review",
  "task.comment.create",
  "task.attachment.create",
  "report.create",
  "report.submit",
  "report.read",
  "report.review",
  "report.attachment.create",
  "analytics.management.read",
  "analytics.department_performance.read",
  "dashboard.management.read",
  "department.read",
  "team.read",
  // Talent Management: Admin is organization-wide for talent (TAL-PERM). These
  // are the only talent keys an Admin holds, and they reach only talent records
  // and talent-side assignment tools, never Event, Production or Campaign grants.
  "talent.create",
  "talent.read",
  "talent.update",
  "talent.transition_status",
  "talent.assign",
  "talent.manage_activities",
] as const;

const ADMIN_ORGANIZATION_KEY_SET: ReadonlySet<string> = new Set(
  ADMIN_ORGANIZATION_PERMISSION_KEYS,
);

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
      return (
        context.role === "ADMIN" &&
        grant.scope === "ORGANIZATION" &&
        ADMIN_ORGANIZATION_KEY_SET.has(grant.permissionKey)
      );
    }
    if (context.role === "DEPARTMENT_MEMBER") return grant.scope === "SELF";
    return true;
  });
}
