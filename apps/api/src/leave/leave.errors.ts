import {
  BadRequestException,
  ConflictException,
  NotFoundException,
  type HttpException,
} from "@nestjs/common";

/** Stable Problem Details codes for the leave management surface (ATT-02). */
export const LEAVE_ERROR = {
  typeNotFound: "LEAVE_TYPE_NOT_FOUND",
  typeNameTaken: "LEAVE_TYPE_NAME_TAKEN",
  typeInactive: "LEAVE_TYPE_INACTIVE",
  invalidDateRange: "LEAVE_INVALID_DATE_RANGE",
  overlap: "LEAVE_OVERLAP",
  insufficientBalance: "LEAVE_INSUFFICIENT_BALANCE",
  requestNotFound: "LEAVE_REQUEST_NOT_FOUND",
  requestAlreadyDecided: "LEAVE_REQUEST_ALREADY_DECIDED",
  requestNotWithdrawable: "LEAVE_REQUEST_NOT_WITHDRAWABLE",
  grantNotFound: "LEAVE_GRANT_NOT_FOUND",
  grantDaysNotPositive: "LEAVE_GRANT_DAYS_NOT_POSITIVE",
} as const;

export function leaveTypeNotFound(): HttpException {
  return new NotFoundException({
    code: LEAVE_ERROR.typeNotFound,
    error: "Not Found",
    detail: "No leave type exists with that id.",
  });
}

export function leaveTypeNameTaken(): HttpException {
  return new ConflictException({
    code: LEAVE_ERROR.typeNameTaken,
    error: "Conflict",
    detail: "A leave type with that name already exists.",
  });
}

export function leaveTypeInactive(): HttpException {
  return new BadRequestException({
    code: LEAVE_ERROR.typeInactive,
    error: "Bad Request",
    detail: "This leave type is no longer active.",
  });
}

export function leaveInvalidDateRange(): HttpException {
  return new BadRequestException({
    code: LEAVE_ERROR.invalidDateRange,
    error: "Bad Request",
    detail: "endDate must be on or after startDate.",
  });
}

export function leaveOverlap(): HttpException {
  return new ConflictException({
    code: LEAVE_ERROR.overlap,
    error: "Conflict",
    detail:
      "This date range overlaps an existing pending or approved leave request.",
  });
}

export function leaveInsufficientBalance(): HttpException {
  return new ConflictException({
    code: LEAVE_ERROR.insufficientBalance,
    error: "Conflict",
    detail: "Not enough remaining, non-expired balance for this leave type.",
  });
}

export function leaveRequestNotFound(): HttpException {
  return new NotFoundException({
    code: LEAVE_ERROR.requestNotFound,
    error: "Not Found",
    detail: "No leave request exists with that id.",
  });
}

export function leaveRequestAlreadyDecided(): HttpException {
  return new ConflictException({
    code: LEAVE_ERROR.requestAlreadyDecided,
    error: "Conflict",
    detail: "This leave request has already been decided.",
  });
}

export function leaveRequestNotWithdrawable(): HttpException {
  return new ConflictException({
    code: LEAVE_ERROR.requestNotWithdrawable,
    error: "Conflict",
    detail: "Only a still-pending leave request can be withdrawn.",
  });
}

export function leaveGrantNotFound(): HttpException {
  return new NotFoundException({
    code: LEAVE_ERROR.grantNotFound,
    error: "Not Found",
    detail: "No leave grant exists with that id.",
  });
}
