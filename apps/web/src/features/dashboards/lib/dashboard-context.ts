import type { CurrentAccess } from "@/features/auth/api/access-queries";

export function dashboardContext(access: CurrentAccess) {
  const department = access.department?.active ? access.department.name : null;
  switch (access.role) {
    case "SUPER_ADMIN":
      return {
        title: "Super Admin dashboard",
        role: "Super Admin",
        scope: "All departments",
        description:
          "Oversee Production, Marketing, Promotion and Manager / Event & Office Manager. Manage users, assignments and permitted company-wide results in one place.",
      };
    case "DEPARTMENT_MANAGER":
      return {
        title: department
          ? `${department} dashboard`
          : "Department assignment required",
        role: "Department Manager",
        scope: department ?? "Not assigned",
        description: department
          ? "Your department workspace. Use the permitted tasks, reports and collaboration tools below; each result retains its actual access scope."
          : "Ask Super Admin to assign you to an active department before accessing department work.",
      };
    case "DEPARTMENT_MEMBER":
      return {
        title: department
          ? `${department} dashboard`
          : "Department assignment required",
        role: "Department Member",
        scope: department ?? "Not assigned",
        description: department
          ? "Your personal work within your department: assigned tasks, progress, reports and collaboration. Department membership does not grant access to every record."
          : "Ask Super Admin to assign you to an active department before accessing department work.",
      };
    default:
      return null;
  }
}
