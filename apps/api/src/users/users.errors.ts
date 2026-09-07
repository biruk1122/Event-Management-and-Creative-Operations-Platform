import {
  ConflictException,
  NotFoundException,
  type HttpException,
} from "@nestjs/common";

/** Stable Problem Details codes for the user and profile administration surface. */
export const USER_ERROR = {
  userNotFound: "USER_NOT_FOUND",
  userEmailConflict: "USER_EMAIL_CONFLICT",
  userAlreadyInactive: "USER_ALREADY_INACTIVE",
  userAlreadyActive: "USER_ALREADY_ACTIVE",
  /** Same code the roles surface uses for a missing role. */
  roleNotFound: "ROLE_NOT_FOUND",
} as const;

export function userNotFound(): HttpException {
  return new NotFoundException({
    code: USER_ERROR.userNotFound,
    error: "Not Found",
    detail: "No user exists with that id.",
  });
}

export function userEmailConflict(): HttpException {
  return new ConflictException({
    code: USER_ERROR.userEmailConflict,
    error: "Conflict",
    detail: "A user with that email address already exists.",
  });
}

export function userAlreadyInactive(): HttpException {
  return new ConflictException({
    code: USER_ERROR.userAlreadyInactive,
    error: "Conflict",
    detail: "This user is already deactivated.",
  });
}

export function userAlreadyActive(): HttpException {
  return new ConflictException({
    code: USER_ERROR.userAlreadyActive,
    error: "Conflict",
    detail: "This user is already active.",
  });
}

export function roleNotFound(): HttpException {
  return new NotFoundException({
    code: USER_ERROR.roleNotFound,
    error: "Not Found",
    detail: "No role exists with that id.",
  });
}
