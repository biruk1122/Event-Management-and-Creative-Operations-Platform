import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  NotFoundException,
  type HttpException,
} from "@nestjs/common";

/** Stable Problem Details codes for the attendance and leave surfaces. */
export const ATTENDANCE_ERROR = {
  employeeNotFound: "ATTENDANCE_EMPLOYEE_NOT_FOUND",
  invalidCredentials: "ATTENDANCE_INVALID_CREDENTIALS",
  accountLocked: "ATTENDANCE_ACCOUNT_LOCKED",
  accountInactive: "ATTENDANCE_ACCOUNT_INACTIVE",
  alreadyCheckedIn: "ATTENDANCE_ALREADY_CHECKED_IN",
  noOpenSession: "ATTENDANCE_NO_OPEN_SESSION",
  kioskNotFound: "ATTENDANCE_KIOSK_NOT_FOUND",
  kioskInvalid: "ATTENDANCE_KIOSK_INVALID",
  kioskSessionExpired: "ATTENDANCE_KIOSK_SESSION_EXPIRED",
  notAssignedToShift: "ATTENDANCE_NOT_ASSIGNED_TO_SHIFT",
  shiftNotFound: "ATTENDANCE_SHIFT_NOT_FOUND",
  shiftNotAvailable: "ATTENDANCE_SHIFT_NOT_AVAILABLE",
  shiftNotCancelled: "ATTENDANCE_SHIFT_NOT_CANCELLED",
  locationRequired: "ATTENDANCE_LOCATION_REQUIRED",
  sessionNotFound: "ATTENDANCE_SESSION_NOT_FOUND",
  exceptionNotFound: "ATTENDANCE_EXCEPTION_NOT_FOUND",
  overtimeNotFound: "ATTENDANCE_OVERTIME_NOT_FOUND",
  overtimeAlreadyDecided: "ATTENDANCE_OVERTIME_ALREADY_DECIDED",
  exceptionAlreadyDecided: "ATTENDANCE_EXCEPTION_ALREADY_DECIDED",
  selfApprovalForbidden: "ATTENDANCE_SELF_APPROVAL_FORBIDDEN",
  assignmentNotFound: "ATTENDANCE_ASSIGNMENT_NOT_FOUND",
  invalidSchedule: "ATTENDANCE_INVALID_SCHEDULE",
  eventNotFound: "ATTENDANCE_EVENT_NOT_FOUND",
  shiftEventMismatch: "ATTENDANCE_SHIFT_EVENT_MISMATCH",
  leaveConflict: "ATTENDANCE_LEAVE_CONFLICT",
  holidayNotFound: "ATTENDANCE_HOLIDAY_NOT_FOUND",
  holidayDateTaken: "ATTENDANCE_HOLIDAY_DATE_TAKEN",
  weekdayScheduleConflict: "ATTENDANCE_WEEKDAY_SCHEDULE_CONFLICT",
} as const;

export function attendanceEmployeeNotFound(): HttpException {
  return new NotFoundException({
    code: ATTENDANCE_ERROR.employeeNotFound,
    error: "Not Found",
    detail: "No active employee matches that id.",
  });
}

export function attendanceInvalidCredentials(): HttpException {
  return new BadRequestException({
    code: ATTENDANCE_ERROR.invalidCredentials,
    error: "Bad Request",
    detail: "That password does not match the selected employee's account.",
  });
}

export function attendanceAccountLocked(): HttpException {
  return new ConflictException({
    code: ATTENDANCE_ERROR.accountLocked,
    error: "Conflict",
    detail: "This account is temporarily locked after too many failed attempts.",
  });
}

export function attendanceAccountInactive(): HttpException {
  return new ConflictException({
    code: ATTENDANCE_ERROR.accountInactive,
    error: "Conflict",
    detail: "This employee's account is not active.",
  });
}

export function attendanceAlreadyCheckedIn(): HttpException {
  return new ConflictException({
    code: ATTENDANCE_ERROR.alreadyCheckedIn,
    error: "Conflict",
    detail: "Already checked in. Check out before checking in again.",
  });
}

export function attendanceNoOpenSession(): HttpException {
  return new ConflictException({
    code: ATTENDANCE_ERROR.noOpenSession,
    error: "Conflict",
    detail: "There is no open check-in to check out of.",
  });
}

export function attendanceKioskNotFound(): HttpException {
  return new NotFoundException({
    code: ATTENDANCE_ERROR.kioskNotFound,
    error: "Not Found",
    detail: "No kiosk exists with that id.",
  });
}

export function attendanceKioskInvalid(): HttpException {
  return new ForbiddenException({
    code: ATTENDANCE_ERROR.kioskInvalid,
    error: "Forbidden",
    detail: "This kiosk is not recognized or is no longer active.",
  });
}

export function attendanceKioskSessionExpired(): HttpException {
  return new ConflictException({
    code: ATTENDANCE_ERROR.kioskSessionExpired,
    error: "Conflict",
    detail: "Verification expired. Enter the password again.",
  });
}

export function attendanceNotAssignedToShift(): HttpException {
  return new ForbiddenException({
    code: ATTENDANCE_ERROR.notAssignedToShift,
    error: "Forbidden",
    detail: "You are not assigned to this event shift.",
  });
}

export function attendanceShiftNotFound(): HttpException {
  return new NotFoundException({
    code: ATTENDANCE_ERROR.shiftNotFound,
    error: "Not Found",
    detail: "No event shift exists with that id.",
  });
}

export function attendanceShiftNotAvailable(): HttpException {
  return new ConflictException({
    code: ATTENDANCE_ERROR.shiftNotAvailable,
    error: "Conflict",
    detail: "This shift is cancelled or has already ended.",
  });
}

export function attendanceShiftNotCancelled(): HttpException {
  return new ConflictException({
    code: ATTENDANCE_ERROR.shiftNotCancelled,
    error: "Conflict",
    detail: "Only a cancelled shift can be reinstated.",
  });
}

export function attendanceLocationRequired(): HttpException {
  return new BadRequestException({
    code: ATTENDANCE_ERROR.locationRequired,
    error: "Bad Request",
    detail: "Location is required to check in or out of an event shift.",
  });
}

export function attendanceSessionNotFound(): HttpException {
  return new NotFoundException({
    code: ATTENDANCE_ERROR.sessionNotFound,
    error: "Not Found",
    detail: "No attendance session exists with that id.",
  });
}

export function attendanceExceptionNotFound(): HttpException {
  return new NotFoundException({
    code: ATTENDANCE_ERROR.exceptionNotFound,
    error: "Not Found",
    detail: "No attendance exception exists with that id.",
  });
}

export function attendanceOvertimeNotFound(): HttpException {
  return new NotFoundException({
    code: ATTENDANCE_ERROR.overtimeNotFound,
    error: "Not Found",
    detail: "No overtime review exists with that id.",
  });
}

export function attendanceOvertimeAlreadyDecided(): HttpException {
  return new ConflictException({
    code: ATTENDANCE_ERROR.overtimeAlreadyDecided,
    error: "Conflict",
    detail: "This overtime has already been decided.",
  });
}

export function attendanceExceptionAlreadyDecided(): HttpException {
  return new ConflictException({
    code: ATTENDANCE_ERROR.exceptionAlreadyDecided,
    error: "Conflict",
    detail: "This exception has already been decided.",
  });
}

export function attendanceAssignmentNotFound(): HttpException {
  return new NotFoundException({
    code: ATTENDANCE_ERROR.assignmentNotFound,
    error: "Not Found",
    detail: "No active assignment exists for that employee on this shift.",
  });
}

export function attendanceInvalidSchedule(detail: string): HttpException {
  return new BadRequestException({
    code: ATTENDANCE_ERROR.invalidSchedule,
    error: "Bad Request",
    detail,
  });
}

export function attendanceEventNotFound(): HttpException {
  return new NotFoundException({
    code: ATTENDANCE_ERROR.eventNotFound,
    error: "Not Found",
    detail: "No event exists with that id.",
  });
}

export function attendanceShiftEventMismatch(): HttpException {
  return new NotFoundException({
    code: ATTENDANCE_ERROR.shiftEventMismatch,
    error: "Not Found",
    detail: "That shift does not belong to this event.",
  });
}

export function attendanceLeaveConflict(): HttpException {
  return new ConflictException({
    code: ATTENDANCE_ERROR.leaveConflict,
    error: "Conflict",
    detail: "This employee has approved leave covering this date.",
  });
}

export function attendanceSelfApprovalForbidden(): HttpException {
  return new ForbiddenException({
    code: ATTENDANCE_ERROR.selfApprovalForbidden,
    error: "Forbidden",
    detail: "You cannot approve your own overtime, exception, or leave request.",
  });
}

export function attendanceHolidayNotFound(): HttpException {
  return new NotFoundException({
    code: ATTENDANCE_ERROR.holidayNotFound,
    error: "Not Found",
    detail: "No holiday exists with that id.",
  });
}

export function attendanceHolidayDateTaken(): HttpException {
  return new ConflictException({
    code: ATTENDANCE_ERROR.holidayDateTaken,
    error: "Conflict",
    detail: "A holiday is already recorded for that date.",
  });
}

export function attendanceWeekdayScheduleConflict(): HttpException {
  return new ConflictException({
    code: ATTENDANCE_ERROR.weekdayScheduleConflict,
    error: "Conflict",
    detail: "A change for this weekday is already effective from that date.",
  });
}
