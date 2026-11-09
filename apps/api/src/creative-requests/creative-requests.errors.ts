import {
  BadRequestException,
  ConflictException,
  NotFoundException,
  type HttpException,
} from "@nestjs/common";

/** Stable Problem Details codes for creative requests (EVE-232). */
export const CREATIVE_REQUEST_ERROR = {
  notFound: "CREATIVE_REQUEST_NOT_FOUND",
  departmentUnavailable: "CREATIVE_REQUEST_DEPARTMENT_UNAVAILABLE",
  campaignNotFound: "CREATIVE_REQUEST_CAMPAIGN_NOT_FOUND",
  eventNotFound: "CREATIVE_REQUEST_EVENT_NOT_FOUND",
  invalidTransition: "CREATIVE_REQUEST_INVALID_TRANSITION",
  concurrentChange: "CREATIVE_REQUEST_CONCURRENT_CHANGE",
  noteRequired: "CREATIVE_REQUEST_NOTE_REQUIRED",
  fileNotAllowed: "CREATIVE_REQUEST_FILE_NOT_ALLOWED",
} as const;

export function creativeRequestNotFound(): HttpException {
  return new NotFoundException({
    code: CREATIVE_REQUEST_ERROR.notFound,
    error: "Not Found",
    detail: "No creative request exists with that id.",
  });
}

export function creativeRequestDepartmentUnavailable(): HttpException {
  return new ConflictException({
    code: CREATIVE_REQUEST_ERROR.departmentUnavailable,
    error: "Conflict",
    detail:
      "Creative requests need an active Promotion department and an active Production department.",
  });
}

export function creativeRequestCampaignNotFound(): HttpException {
  return new NotFoundException({
    code: CREATIVE_REQUEST_ERROR.campaignNotFound,
    error: "Not Found",
    detail: "No campaign of the requesting department exists with that id.",
  });
}

export function creativeRequestEventNotFound(): HttpException {
  return new NotFoundException({
    code: CREATIVE_REQUEST_ERROR.eventNotFound,
    error: "Not Found",
    detail: "No event exists with that id.",
  });
}

export function creativeRequestInvalidTransition(
  from: string,
  to: string,
): HttpException {
  return new ConflictException({
    code: CREATIVE_REQUEST_ERROR.invalidTransition,
    error: "Conflict",
    detail: `A ${from} creative request cannot move to ${to}.`,
  });
}

export function creativeRequestConcurrentChange(): HttpException {
  return new ConflictException({
    code: CREATIVE_REQUEST_ERROR.concurrentChange,
    error: "Conflict",
    detail:
      "The creative request changed while this action was in progress. Reload it and try again.",
  });
}

export function creativeRequestNoteRequired(): HttpException {
  return new BadRequestException({
    code: CREATIVE_REQUEST_ERROR.noteRequired,
    error: "Bad Request",
    detail: "Say what needs to change when asking for changes.",
  });
}

export function creativeRequestFileNotAllowed(): HttpException {
  return new ConflictException({
    code: CREATIVE_REQUEST_ERROR.fileNotAllowed,
    error: "Conflict",
    detail:
      "Files of this kind cannot be added to the creative request in its current status.",
  });
}
