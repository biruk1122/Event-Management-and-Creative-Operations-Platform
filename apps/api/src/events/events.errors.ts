import {
  BadRequestException,
  ConflictException,
  NotFoundException,
  type HttpException,
} from "@nestjs/common";

/** Stable Problem Details codes for the event management surface. */
export const EVENT_ERROR = {
  eventNotFound: "EVENT_NOT_FOUND",
  eventTeamNotFound: "EVENT_TEAM_NOT_FOUND",
  eventTeamNotAssigned: "EVENT_TEAM_NOT_ASSIGNED",
  eventInvalidTransition: "EVENT_INVALID_TRANSITION",
  eventScheduleInvalid: "EVENT_SCHEDULE_INVALID",
  eventBudgetIncomplete: "EVENT_BUDGET_INCOMPLETE",
  /** The same code the user, department, team, and workspace surfaces use. */
  userNotFound: "USER_NOT_FOUND",
} as const;

export function eventNotFound(): HttpException {
  return new NotFoundException({
    code: EVENT_ERROR.eventNotFound,
    error: "Not Found",
    detail: "No event exists with that id.",
  });
}

export function eventTeamNotFound(): HttpException {
  return new NotFoundException({
    code: EVENT_ERROR.eventTeamNotFound,
    error: "Not Found",
    detail: "No team exists with that id.",
  });
}

export function eventUserNotFound(): HttpException {
  return new NotFoundException({
    code: EVENT_ERROR.userNotFound,
    error: "Not Found",
    detail: "No user exists with that id.",
  });
}

export function eventTeamNotAssigned(): HttpException {
  return new ConflictException({
    code: EVENT_ERROR.eventTeamNotAssigned,
    error: "Conflict",
    detail: "That team is not assigned to this event.",
  });
}

export function eventInvalidTransition(
  from: string,
  to: string,
): HttpException {
  return new ConflictException({
    code: EVENT_ERROR.eventInvalidTransition,
    error: "Conflict",
    detail: `An event in ${from} cannot move to ${to}.`,
  });
}

export function eventScheduleInvalid(): HttpException {
  return new BadRequestException({
    code: EVENT_ERROR.eventScheduleInvalid,
    error: "Bad Request",
    detail: "The event end must be at or after its start.",
  });
}

export function eventBudgetIncomplete(): HttpException {
  return new BadRequestException({
    code: EVENT_ERROR.eventBudgetIncomplete,
    error: "Bad Request",
    detail:
      "A budget needs both an amount and a currency; clear it by sending both as null.",
  });
}
