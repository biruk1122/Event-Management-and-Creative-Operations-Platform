import type { CurrentAccess } from "@/features/auth/api/access-queries";

/**
 * Attendance authorization mirrors the backend exactly: every route names
 * the precise key, and the server resolves DEPARTMENT vs ORGANIZATION scope
 * itself. These checks only need to know the caller holds the key at *some*
 * scope the backend accepts - which records that scope actually returns is
 * resolved by the API, never guessed here.
 */
type Grant = CurrentAccess["grants"][number];

function holdsAny(grants: readonly Grant[], key: string): boolean {
  return grants.some((grant) => grant.permissionKey === key);
}

/** Mirrors `apps/api/src/common/security/department-access.policy.ts`'s
 * `HR_EXECUTIVE_OFFICER_DEPARTMENT` constant. Duplicated as a literal
 * because the web app does not import from apps/api - keep both in sync if
 * that name ever changes. */
const HR_EXECUTIVE_OFFICER_DEPARTMENT = "HR & Executive Officer";

/** Client-side mirror of `AttendanceReviewService.requireHrOrSuperAdminAccess`
 * - UX-only gating, the server stays the real boundary (a non-HR manager
 * who navigates here directly still gets a real 403). */
function isHrOrSuperAdmin(access: CurrentAccess): boolean {
  if (access.role === "SUPER_ADMIN") return true;
  return (
    access.role === "DEPARTMENT_MANAGER" &&
    access.department?.active === true &&
    access.department.name === HR_EXECUTIVE_OFFICER_DEPARTMENT
  );
}

export interface AttendanceAbilities {
  /** Baseline SELF grant - true for every authenticated active employee. */
  canPunch: boolean;
  canManageKiosks: boolean;
  canManageSchedule: boolean;
  canReviewOvertime: boolean;
  canReviewExceptions: boolean;
  canReadReports: boolean;
  /** Narrower than `canReadReports`: only Super Admin and the HR &
   * Executive Officer department's own manager. */
  canReadDetailedSessions: boolean;
  /** Same HR-or-Super-Admin boundary as `canReadDetailedSessions`, for the
   * work calendar (weekly schedule + holidays) settings page. */
  canManageCalendar: boolean;
}

export function attendanceAbilities(access: CurrentAccess): AttendanceAbilities {
  const can = (key: string) => holdsAny(access.grants, key);
  return {
    canPunch: can("attendance.punch"),
    canManageKiosks: can("attendance.kiosk.manage"),
    canManageSchedule: can("attendance.schedule.manage"),
    canReviewOvertime: can("attendance.overtime.review"),
    canReviewExceptions: can("attendance.exception.review"),
    canReadReports: can("attendance.reports.read"),
    canReadDetailedSessions: can("attendance.reports.read") && isHrOrSuperAdmin(access),
    canManageCalendar: can("attendance.calendar.manage") && isHrOrSuperAdmin(access),
  };
}

export function canEnterAttendance(access: CurrentAccess): boolean {
  const abilities = attendanceAbilities(access);
  return (
    abilities.canPunch ||
    abilities.canManageKiosks ||
    abilities.canManageSchedule ||
    abilities.canReviewOvertime ||
    abilities.canReviewExceptions ||
    abilities.canReadReports ||
    abilities.canManageCalendar
  );
}
