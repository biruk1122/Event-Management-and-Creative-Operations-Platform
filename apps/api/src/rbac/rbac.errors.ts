import {
  ConflictException,
  NotFoundException,
  BadRequestException,
  type HttpException,
} from "@nestjs/common";

/** Stable Problem Details codes for the configurable roles and permissions surface. */
export const RBAC_ERROR = {
  roleNotFound: "ROLE_NOT_FOUND",
  roleNameConflict: "ROLE_NAME_CONFLICT",
  roleIsSystem: "ROLE_IS_SYSTEM",
  roleInUse: "ROLE_IN_USE",
  permissionNotFound: "PERMISSION_NOT_FOUND",
  grantAlreadyExists: "GRANT_ALREADY_EXISTS",
  grantNotFound: "GRANT_NOT_FOUND",
} as const;

export function roleNotFound(): HttpException {
  return new NotFoundException({
    code: RBAC_ERROR.roleNotFound,
    error: "Not Found",
    detail: "No role exists with that id.",
  });
}

export function roleNameConflict(): HttpException {
  return new ConflictException({
    code: RBAC_ERROR.roleNameConflict,
    error: "Conflict",
    detail: "A role with that name already exists.",
  });
}

export function roleIsSystem(): HttpException {
  return new ConflictException({
    code: RBAC_ERROR.roleIsSystem,
    error: "Conflict",
    detail: "A built-in role cannot be removed.",
  });
}

export function roleInUse(): HttpException {
  return new ConflictException({
    code: RBAC_ERROR.roleInUse,
    error: "Conflict",
    detail: "This role is assigned to at least one user and cannot be removed.",
  });
}

export function permissionNotFound(): HttpException {
  return new BadRequestException({
    code: RBAC_ERROR.permissionNotFound,
    error: "Bad Request",
    detail: "No permission exists with that key.",
  });
}

export function grantAlreadyExists(): HttpException {
  return new ConflictException({
    code: RBAC_ERROR.grantAlreadyExists,
    error: "Conflict",
    detail: "The role already holds this permission at this scope.",
  });
}

export function grantNotFound(): HttpException {
  return new NotFoundException({
    code: RBAC_ERROR.grantNotFound,
    error: "Not Found",
    detail: "The role does not hold this permission at this scope.",
  });
}
