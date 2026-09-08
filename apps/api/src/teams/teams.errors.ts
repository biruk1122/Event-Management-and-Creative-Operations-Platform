import {
  ConflictException,
  NotFoundException,
  type HttpException,
} from "@nestjs/common";

/** Stable Problem Details codes for the team management surface. */
export const TEAM_ERROR = {
  teamNotFound: "TEAM_NOT_FOUND",
  teamNameConflict: "TEAM_NAME_CONFLICT",
  teamAlreadyInactive: "TEAM_ALREADY_INACTIVE",
  teamAlreadyActive: "TEAM_ALREADY_ACTIVE",
  teamInUse: "TEAM_IN_USE",
  teamDepartmentNotFound: "TEAM_DEPARTMENT_NOT_FOUND",
  /** The same code the user and department surfaces use for a missing user. */
  userNotFound: "USER_NOT_FOUND",
  userNotInTeam: "USER_NOT_IN_TEAM",
} as const;

export function teamNotFound(): HttpException {
  return new NotFoundException({
    code: TEAM_ERROR.teamNotFound,
    error: "Not Found",
    detail: "No team exists with that id.",
  });
}

export function teamNameConflict(): HttpException {
  return new ConflictException({
    code: TEAM_ERROR.teamNameConflict,
    error: "Conflict",
    detail: "A team with that name already exists in this department.",
  });
}

export function teamAlreadyInactive(): HttpException {
  return new ConflictException({
    code: TEAM_ERROR.teamAlreadyInactive,
    error: "Conflict",
    detail: "This team is already deactivated.",
  });
}

export function teamAlreadyActive(): HttpException {
  return new ConflictException({
    code: TEAM_ERROR.teamAlreadyActive,
    error: "Conflict",
    detail: "This team is already active.",
  });
}

export function teamInUse(): HttpException {
  return new ConflictException({
    code: TEAM_ERROR.teamInUse,
    error: "Conflict",
    detail: "This team still has members and cannot be removed.",
  });
}

export function teamDepartmentNotFound(): HttpException {
  return new NotFoundException({
    code: TEAM_ERROR.teamDepartmentNotFound,
    error: "Not Found",
    detail: "No department exists with that id.",
  });
}

export function teamUserNotFound(): HttpException {
  return new NotFoundException({
    code: TEAM_ERROR.userNotFound,
    error: "Not Found",
    detail: "No user exists with that id.",
  });
}

export function userNotInTeam(): HttpException {
  return new ConflictException({
    code: TEAM_ERROR.userNotInTeam,
    error: "Conflict",
    detail: "That user is not a member of this team.",
  });
}
