import {
  BadRequestException,
  ConflictException,
  NotFoundException,
  type HttpException,
} from "@nestjs/common";

/** Stable Problem Details codes for the general project management surface. */
export const PROJECT_ERROR = {
  projectNotFound: "PROJECT_NOT_FOUND",
  projectTeamNotFound: "PROJECT_TEAM_NOT_FOUND",
  projectTeamNotAssigned: "PROJECT_TEAM_NOT_ASSIGNED",
  projectInvalidTransition: "PROJECT_INVALID_TRANSITION",
  projectScheduleInvalid: "PROJECT_SCHEDULE_INVALID",
  projectHasManagedFiles: "PROJECT_HAS_MANAGED_FILES",
  /** The same code the events surface uses for its own not-found. */
  eventNotFound: "EVENT_NOT_FOUND",
  /** The same code the user, department, team, and workspace surfaces use. */
  userNotFound: "USER_NOT_FOUND",
} as const;

export function projectNotFound(): HttpException {
  return new NotFoundException({
    code: PROJECT_ERROR.projectNotFound,
    error: "Not Found",
    detail: "No project exists with that id.",
  });
}

export function projectTeamNotFound(): HttpException {
  return new NotFoundException({
    code: PROJECT_ERROR.projectTeamNotFound,
    error: "Not Found",
    detail: "No team exists with that id.",
  });
}

export function projectUserNotFound(): HttpException {
  return new NotFoundException({
    code: PROJECT_ERROR.userNotFound,
    error: "Not Found",
    detail: "No user exists with that id.",
  });
}

export function projectRelatedEventNotFound(): HttpException {
  return new NotFoundException({
    code: PROJECT_ERROR.eventNotFound,
    error: "Not Found",
    detail: "No event exists with that id.",
  });
}

export function projectTeamNotAssigned(): HttpException {
  return new ConflictException({
    code: PROJECT_ERROR.projectTeamNotAssigned,
    error: "Conflict",
    detail: "That team is not assigned to this project.",
  });
}

export function projectInvalidTransition(
  from: string,
  to: string,
): HttpException {
  return new ConflictException({
    code: PROJECT_ERROR.projectInvalidTransition,
    error: "Conflict",
    detail: `A project in ${from} cannot move to ${to}.`,
  });
}

export function projectScheduleInvalid(): HttpException {
  return new BadRequestException({
    code: PROJECT_ERROR.projectScheduleInvalid,
    error: "Bad Request",
    detail: "The project end must be at or after its start.",
  });
}

export function projectHasManagedFiles(): HttpException {
  return new ConflictException({
    code: PROJECT_ERROR.projectHasManagedFiles,
    error: "Conflict",
    detail:
      "This project has pending or attached managed files. Remove them or let them expire before deleting the project.",
  });
}
