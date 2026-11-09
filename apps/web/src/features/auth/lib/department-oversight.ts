import type { CurrentAccess } from "@/features/auth/api/access-queries";

/**
 * Department oversight (EVE-229, ADR 0008), as the API reports it in
 * `overseenDepartments`: an overseeing manager (today the Marketing Manager
 * over Promotion) reads the overseen department's records and never changes
 * them. The API enforces this; the UI uses it to hide controls that would only
 * be refused.
 */
export function overseenDepartments(
  access: CurrentAccess,
): NonNullable<CurrentAccess["overseenDepartments"]> {
  return access.overseenDepartments ?? [];
}

/** Whether a record belongs to a department the caller only oversees. */
export function isOverseenRecord(
  access: CurrentAccess,
  departmentId: string | null | undefined,
): boolean {
  if (!departmentId || departmentId === access.department?.id) return false;
  return overseenDepartments(access).some(
    (department) => department.id === departmentId,
  );
}

/** Whether the caller oversees the department with this name. */
export function oversees(
  access: CurrentAccess,
  departmentName: string,
): boolean {
  return overseenDepartments(access).some(
    (department) => department.name === departmentName,
  );
}
