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
  assignmentDuplicate: "TALENT_ASSIGNMENT_DUPLICATE",
  assignmentConflict: "TALENT_ASSIGNMENT_CONFLICT",
  assignmentTerminal: "TALENT_ASSIGNMENT_TERMINAL",
  assignmentDatesInvalid: "TALENT_ASSIGNMENT_DATES_INVALID",
  assignmentReasonRequired: "TALENT_ASSIGNMENT_REASON_REQUIRED",
  talentInactive: "TALENT_INACTIVE",
  hasActiveAssignments: "TALENT_HAS_ACTIVE_ASSIGNMENTS",
  workNotFound: "TALENT_WORK_NOT_FOUND",
  profileImageTypeNotAllowed: "TALENT_PROFILE_IMAGE_TYPE_NOT_ALLOWED",
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

export function talentAssignmentDuplicate(): HttpException {
  return new ConflictException({
    code: TALENT_ERROR.assignmentDuplicate,
    error: "Conflict",
    detail: "This talent already has an active assignment for that work.",
  });
}

/** Conflicts are returned so the caller can show them before confirming an override. */
export function talentAssignmentConflict(conflicts: unknown[]): HttpException {
  return new ConflictException({
    code: TALENT_ERROR.assignmentConflict,
    error: "Conflict",
    detail:
      "This assignment conflicts with the talent's schedule. Review the conflicts and confirm the override to continue.",
    errors: conflicts,
  });
}

export function talentAssignmentTerminal(): HttpException {
  return new ConflictException({
    code: TALENT_ERROR.assignmentTerminal,
    error: "Conflict",
    detail:
      "Completed and cancelled assignments are history and cannot change. Create a new assignment instead.",
  });
}

export function talentAssignmentDatesInvalid(): HttpException {
  return new BadRequestException({
    code: TALENT_ERROR.assignmentDatesInvalid,
    error: "Bad Request",
    detail: "The end date must be on or after the start date.",
  });
}

export function talentAssignmentReasonRequired(): HttpException {
  return new BadRequestException({
    code: TALENT_ERROR.assignmentReasonRequired,
    error: "Bad Request",
    detail: "A cancellation reason is required.",
  });
}

export function talentInactive(): HttpException {
  return new ConflictException({
    code: TALENT_ERROR.talentInactive,
    error: "Conflict",
    detail: "Inactive talent cannot receive new assignments.",
  });
}

export function talentHasActiveAssignments(): HttpException {
  return new ConflictException({
    code: TALENT_ERROR.hasActiveAssignments,
    error: "Conflict",
    detail:
      "This talent still has active assignments. Complete or cancel them before archiving the talent.",
  });
}

export function talentWorkNotFound(): HttpException {
  return new NotFoundException({
    code: TALENT_ERROR.workNotFound,
    error: "Not Found",
    detail: "The work item does not exist.",
  });
}

export function talentProfileImageTypeNotAllowed(): HttpException {
  return new BadRequestException({
    code: TALENT_ERROR.profileImageTypeNotAllowed,
    error: "Bad Request",
    detail: "A profile photo must be a JPEG, PNG, or WEBP image.",
  });
}
