import {
  ConflictException,
  NotFoundException,
  type HttpException,
} from "@nestjs/common";

/** Stable Problem Details codes for the department management surface. */
export const DEPARTMENT_ERROR = {
  departmentNotFound: "DEPARTMENT_NOT_FOUND",
  departmentNameConflict: "DEPARTMENT_NAME_CONFLICT",
  departmentAlreadyInactive: "DEPARTMENT_ALREADY_INACTIVE",
  departmentAlreadyActive: "DEPARTMENT_ALREADY_ACTIVE",
  departmentInUse: "DEPARTMENT_IN_USE",
  /** The same code the user surface uses for a missing user. */
  userNotFound: "USER_NOT_FOUND",
  userNotInDepartment: "USER_NOT_IN_DEPARTMENT",
} as const;

export function departmentNotFound(): HttpException {
  return new NotFoundException({
    code: DEPARTMENT_ERROR.departmentNotFound,
    error: "Not Found",
    detail: "No department exists with that id.",
  });
}

export function departmentNameConflict(): HttpException {
  return new ConflictException({
    code: DEPARTMENT_ERROR.departmentNameConflict,
    error: "Conflict",
    detail: "A department with that name already exists.",
  });
}

export function departmentAlreadyInactive(): HttpException {
  return new ConflictException({
    code: DEPARTMENT_ERROR.departmentAlreadyInactive,
    error: "Conflict",
    detail: "This department is already deactivated.",
  });
}

export function departmentAlreadyActive(): HttpException {
  return new ConflictException({
    code: DEPARTMENT_ERROR.departmentAlreadyActive,
    error: "Conflict",
    detail: "This department is already active.",
  });
}

export function departmentInUse(): HttpException {
  return new ConflictException({
    code: DEPARTMENT_ERROR.departmentInUse,
    error: "Conflict",
    detail:
      "This department still has employees assigned and cannot be removed.",
  });
}

export function departmentUserNotFound(): HttpException {
  return new NotFoundException({
    code: DEPARTMENT_ERROR.userNotFound,
    error: "Not Found",
    detail: "No user exists with that id.",
  });
}

export function userNotInDepartment(): HttpException {
  return new ConflictException({
    code: DEPARTMENT_ERROR.userNotInDepartment,
    error: "Conflict",
    detail: "That user is not assigned to this department.",
  });
}
