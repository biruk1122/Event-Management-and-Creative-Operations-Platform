import {
  BadRequestException,
  ConflictException,
  NotFoundException,
  type HttpException,
} from "@nestjs/common";

export const TALENT_ERROR = {
  assignmentNotFound: "TALENT_ASSIGNMENT_NOT_FOUND",
  availabilityTransitionInvalid: "TALENT_AVAILABILITY_TRANSITION_INVALID",
  assignmentTransitionInvalid: "TALENT_ASSIGNMENT_TRANSITION_INVALID",
  eventNotFound: "EVENT_NOT_FOUND",
  managerNotFound: "USER_NOT_FOUND",
  scheduleNotFound: "TALENT_SCHEDULE_NOT_FOUND",
  scheduleInvalid: "TALENT_SCHEDULE_INVALID",
  socialLinkConflict: "TALENT_SOCIAL_LINK_CONFLICT",
  socialLinkNotFound: "TALENT_SOCIAL_LINK_NOT_FOUND",
  talentNotFound: "TALENT_NOT_FOUND",
} as const;

export function talentNotFound(): HttpException {
  return new NotFoundException({
    code: TALENT_ERROR.talentNotFound,
    error: "Not Found",
    detail: "No talent exists with that id.",
  });
}

export function talentManagerNotFound(): HttpException {
  return new NotFoundException({
    code: TALENT_ERROR.managerNotFound,
    error: "Not Found",
    detail: "No user exists with that id.",
  });
}

export function talentEventNotFound(): HttpException {
  return new NotFoundException({
    code: TALENT_ERROR.eventNotFound,
    error: "Not Found",
    detail: "No event exists with that id.",
  });
}

export function talentScheduleNotFound(): HttpException {
  return new NotFoundException({
    code: TALENT_ERROR.scheduleNotFound,
    error: "Not Found",
    detail: "No schedule entry exists with that id for this talent.",
  });
}

export function talentSocialLinkNotFound(): HttpException {
  return new NotFoundException({
    code: TALENT_ERROR.socialLinkNotFound,
    error: "Not Found",
    detail: "No social link exists with that id for this talent.",
  });
}

export function talentAssignmentNotFound(): HttpException {
  return new NotFoundException({
    code: TALENT_ERROR.assignmentNotFound,
    error: "Not Found",
    detail: "No event assignment exists with that id for this talent.",
  });
}

export function talentScheduleInvalid(): HttpException {
  return new BadRequestException({
    code: TALENT_ERROR.scheduleInvalid,
    error: "Bad Request",
    detail: "A talent schedule end must be after its start.",
  });
}

export function talentAvailabilityTransitionInvalid(
  from: string,
  to: string,
): HttpException {
  return new ConflictException({
    code: TALENT_ERROR.availabilityTransitionInvalid,
    error: "Conflict",
    detail: `A talent with availability ${from} cannot move to ${to}.`,
  });
}

export function talentAssignmentTransitionInvalid(
  from: string,
  to: string,
): HttpException {
  return new ConflictException({
    code: TALENT_ERROR.assignmentTransitionInvalid,
    error: "Conflict",
    detail: `A talent assignment in ${from} cannot move to ${to}.`,
  });
}

export function talentSocialLinkConflict(): HttpException {
  return new ConflictException({
    code: TALENT_ERROR.socialLinkConflict,
    error: "Conflict",
    detail: "That social-link URL is already recorded for this talent.",
  });
}
