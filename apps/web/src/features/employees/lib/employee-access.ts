import type { CurrentAccess } from "@/features/auth/api/access-queries";

const HR_DEPARTMENT = "HR & Executive Officer";

/**
 * Entry to Employee Management: Super Admin always enters; a Department
 * Manager enters only when their own active department is HR & Executive
 * Officer - the same rule `EmployeesService.requireEmployeeAccess` enforces
 * server-side. Being a member of the HR & Executive Officer department does
 * not by itself grant access - a Department Member there is not a manager
 * and never passes this check, matching the backend. This frontend check is
 * a UX convenience (route/nav gating) only; the real boundary is the API.
 */
export function canAccessEmployeeManagement(access: CurrentAccess): boolean {
  if (access.role === "SUPER_ADMIN") return true;
  return (
    access.role === "DEPARTMENT_MANAGER" &&
    access.department?.active === true &&
    access.department.name === HR_DEPARTMENT
  );
}
