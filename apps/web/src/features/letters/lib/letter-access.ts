import type { CurrentAccess } from "@/features/auth/api/access-queries";

const HR_DEPARTMENT = "HR & Executive Officer";

/**
 * Entry to Letters/Documents management: Super Admin always enters; a
 * Department Manager enters only when their own active department is HR &
 * Executive Officer - the same rule `LettersService`/`DocumentsService`
 * enforce server-side. This is a UX convenience (route/nav gating) only;
 * the real boundary is the API.
 */
export function canAccessAdministrationDocuments(
  access: CurrentAccess,
): boolean {
  if (access.role === "SUPER_ADMIN") return true;
  return (
    access.role === "DEPARTMENT_MANAGER" &&
    access.department?.active === true &&
    access.department.name === HR_DEPARTMENT
  );
}
