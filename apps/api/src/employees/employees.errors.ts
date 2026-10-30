import {
  BadRequestException,
  ConflictException,
  NotFoundException,
  type HttpException,
} from "@nestjs/common";

/** Stable Problem Details codes for the employee management surface. */
export const EMPLOYEE_ERROR = {
  employeeNotFound: "EMPLOYEE_NOT_FOUND",
  employeeCodeConflict: "EMPLOYEE_CODE_CONFLICT",
  employeeUserAlreadyLinked: "EMPLOYEE_USER_ALREADY_LINKED",
  employeeUserNotFound: "EMPLOYEE_USER_NOT_FOUND",
  employeeEmailConflict: "EMPLOYEE_EMAIL_CONFLICT",
  employeeAssignmentInvalid: "EMPLOYEE_ASSIGNMENT_INVALID",
  employeeAlreadyInStatus: "EMPLOYEE_ALREADY_IN_STATUS",
} as const;

export function employeeNotFound(): HttpException {
  return new NotFoundException({
    code: EMPLOYEE_ERROR.employeeNotFound,
    error: "Not Found",
    detail: "No employee profile exists with that id.",
  });
}

export function employeeCodeConflict(): HttpException {
  return new ConflictException({
    code: EMPLOYEE_ERROR.employeeCodeConflict,
    error: "Conflict",
    detail: "An employee profile with that employee ID already exists.",
  });
}

export function employeeUserAlreadyLinked(): HttpException {
  return new ConflictException({
    code: EMPLOYEE_ERROR.employeeUserAlreadyLinked,
    error: "Conflict",
    detail: "That user account already has an employee profile.",
  });
}

export function employeeUserNotFound(): HttpException {
  return new NotFoundException({
    code: EMPLOYEE_ERROR.employeeUserNotFound,
    error: "Not Found",
    detail: "No user account exists with that id.",
  });
}

export function employeeEmailConflict(): HttpException {
  return new ConflictException({
    code: EMPLOYEE_ERROR.employeeEmailConflict,
    error: "Conflict",
    detail: "A user with that email address already exists.",
  });
}

export function employeeAssignmentInvalid(detail: string): HttpException {
  return new BadRequestException({
    code: EMPLOYEE_ERROR.employeeAssignmentInvalid,
    error: "Bad Request",
    detail,
  });
}

export function employeeAlreadyInStatus(): HttpException {
  return new ConflictException({
    code: EMPLOYEE_ERROR.employeeAlreadyInStatus,
    error: "Conflict",
    detail: "This employee is already in that employment status.",
  });
}
