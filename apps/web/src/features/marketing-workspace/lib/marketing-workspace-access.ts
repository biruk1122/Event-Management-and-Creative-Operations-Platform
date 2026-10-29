import type { CurrentAccess } from "@/features/auth/api/access-queries";

const MARKETING_DEPARTMENT = "Marketing";

/**
 * Entry to the dedicated Marketing Department Workspace: Super Admin always
 * enters (organization-wide oversight over every department, Marketing
 * included); a Department Manager or Team Member enters only when their own
 * active department is Marketing - the same 3-level hierarchy
 * (`Super Admin -> Marketing Department Manager -> Marketing Team Members`)
 * the backend enforces via DEPARTMENT/SELF-scoped grants.
 */
export function canEnterMarketingWorkspace(access: CurrentAccess): boolean {
  if (access.role === "SUPER_ADMIN") return true;
  return (
    access.department?.active === true &&
    access.department.name === MARKETING_DEPARTMENT
  );
}

export interface MarketingWorkspaceContext {
  title: string;
  roleLabel: string;
  description: string;
}

export function marketingWorkspaceContext(
  access: CurrentAccess,
): MarketingWorkspaceContext | null {
  switch (access.role) {
    case "SUPER_ADMIN":
      return {
        title: "Marketing — oversight",
        roleLabel: "Super Admin",
        description:
          "Assign strategic directives to the Marketing Manager and review the Manager's consolidated execution reports. Day-to-day team task assignment stays with the Manager.",
      };
    case "DEPARTMENT_MANAGER":
      return access.department?.active
        ? {
            title: "Marketing Department workspace",
            roleLabel: "Marketing Manager",
            description:
              "Break Super Admin directives into team tasks, manage campaigns and partnerships, review team submissions, and submit a consolidated report upward.",
          }
        : null;
    case "DEPARTMENT_MEMBER":
      return access.department?.active
        ? {
            title: "My Marketing work",
            roleLabel: "Marketing Team Member",
            description:
              "Your assigned tasks, campaign activities, and partnership contributions. Submit your work for review and track your own progress reports.",
          }
        : null;
    default:
      return null;
  }
}
