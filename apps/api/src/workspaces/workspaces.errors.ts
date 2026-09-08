import {
  ConflictException,
  NotFoundException,
  type HttpException,
} from "@nestjs/common";

/** Stable Problem Details codes for the connected workspace ownership surface. */
export const WORKSPACE_ERROR = {
  workspaceNotFound: "WORKSPACE_NOT_FOUND",
  workspaceTeamNotFound: "WORKSPACE_TEAM_NOT_FOUND",
  workspaceTeamNotAssigned: "WORKSPACE_TEAM_NOT_ASSIGNED",
  workspaceParticipantNotFound: "WORKSPACE_PARTICIPANT_NOT_FOUND",
  /** The same code the user, department, and team surfaces use. */
  userNotFound: "USER_NOT_FOUND",
} as const;

export function workspaceNotFound(): HttpException {
  return new NotFoundException({
    code: WORKSPACE_ERROR.workspaceNotFound,
    error: "Not Found",
    detail: "No workspace exists with that id.",
  });
}

export function workspaceTeamNotFound(): HttpException {
  return new NotFoundException({
    code: WORKSPACE_ERROR.workspaceTeamNotFound,
    error: "Not Found",
    detail: "No team exists with that id.",
  });
}

export function workspaceUserNotFound(): HttpException {
  return new NotFoundException({
    code: WORKSPACE_ERROR.userNotFound,
    error: "Not Found",
    detail: "No user exists with that id.",
  });
}

export function workspaceTeamNotAssigned(): HttpException {
  return new ConflictException({
    code: WORKSPACE_ERROR.workspaceTeamNotAssigned,
    error: "Conflict",
    detail: "That team is not assigned to this workspace.",
  });
}

export function workspaceParticipantNotFound(): HttpException {
  return new ConflictException({
    code: WORKSPACE_ERROR.workspaceParticipantNotFound,
    error: "Conflict",
    detail: "That user is not a participant in this workspace.",
  });
}
