import {
  BadRequestException,
  ConflictException,
  NotFoundException,
  type HttpException,
} from "@nestjs/common";

/** Stable Problem Details codes for the campaign platform surface. */
export const CAMPAIGN_ERROR = {
  campaignNotFound: "CAMPAIGN_NOT_FOUND",
  campaignTeamNotFound: "CAMPAIGN_TEAM_NOT_FOUND",
  campaignTeamNotAssigned: "CAMPAIGN_TEAM_NOT_ASSIGNED",
  campaignInvalidTransition: "CAMPAIGN_INVALID_TRANSITION",
  campaignScheduleInvalid: "CAMPAIGN_SCHEDULE_INVALID",
  campaignBudgetIncomplete: "CAMPAIGN_BUDGET_INCOMPLETE",
  campaignRelatedSubjectConflict: "CAMPAIGN_RELATED_SUBJECT_CONFLICT",
  campaignHasManagedFiles: "CAMPAIGN_HAS_MANAGED_FILES",
  campaignActivityNotFound: "CAMPAIGN_ACTIVITY_NOT_FOUND",
  campaignActivityScheduleInvalid: "CAMPAIGN_ACTIVITY_SCHEDULE_INVALID",
  /** The same code the events surface uses for its own not-found. */
  eventNotFound: "EVENT_NOT_FOUND",
  /** The same code the user, department, team, and workspace surfaces use. */
  userNotFound: "USER_NOT_FOUND",
} as const;

export function campaignNotFound(): HttpException {
  return new NotFoundException({
    code: CAMPAIGN_ERROR.campaignNotFound,
    error: "Not Found",
    detail: "No campaign exists with that id.",
  });
}

export function campaignTeamNotFound(): HttpException {
  return new NotFoundException({
    code: CAMPAIGN_ERROR.campaignTeamNotFound,
    error: "Not Found",
    detail: "No team exists with that id.",
  });
}

export function campaignUserNotFound(): HttpException {
  return new NotFoundException({
    code: CAMPAIGN_ERROR.userNotFound,
    error: "Not Found",
    detail: "No user exists with that id.",
  });
}

export function campaignRelatedEventNotFound(): HttpException {
  return new NotFoundException({
    code: CAMPAIGN_ERROR.eventNotFound,
    error: "Not Found",
    detail: "No event exists with that id.",
  });
}

export function campaignActivityNotFound(): HttpException {
  return new NotFoundException({
    code: CAMPAIGN_ERROR.campaignActivityNotFound,
    error: "Not Found",
    detail: "No activity exists with that id in this campaign.",
  });
}

export function campaignTeamNotAssigned(): HttpException {
  return new ConflictException({
    code: CAMPAIGN_ERROR.campaignTeamNotAssigned,
    error: "Conflict",
    detail: "That team is not assigned to this campaign.",
  });
}

export function campaignInvalidTransition(
  from: string,
  to: string,
): HttpException {
  return new ConflictException({
    code: CAMPAIGN_ERROR.campaignInvalidTransition,
    error: "Conflict",
    detail: `A campaign in ${from} cannot move to ${to}.`,
  });
}

export function campaignScheduleInvalid(): HttpException {
  return new BadRequestException({
    code: CAMPAIGN_ERROR.campaignScheduleInvalid,
    error: "Bad Request",
    detail: "The campaign end must be at or after its start.",
  });
}

export function campaignActivityScheduleInvalid(): HttpException {
  return new BadRequestException({
    code: CAMPAIGN_ERROR.campaignActivityScheduleInvalid,
    error: "Bad Request",
    detail: "The activity end must be at or after its start.",
  });
}

export function campaignBudgetIncomplete(): HttpException {
  return new BadRequestException({
    code: CAMPAIGN_ERROR.campaignBudgetIncomplete,
    error: "Bad Request",
    detail:
      "A budget needs both an amount and a currency; clear it by sending both as null.",
  });
}

export function campaignRelatedSubjectConflict(): HttpException {
  return new BadRequestException({
    code: CAMPAIGN_ERROR.campaignRelatedSubjectConflict,
    error: "Bad Request",
    detail:
      "A campaign relates to an event or a product, not both; clear one before setting the other.",
  });
}

export function campaignHasManagedFiles(): HttpException {
  return new ConflictException({
    code: CAMPAIGN_ERROR.campaignHasManagedFiles,
    error: "Conflict",
    detail:
      "This campaign has pending or attached managed files. Remove them or let them expire before deleting the campaign.",
  });
}
