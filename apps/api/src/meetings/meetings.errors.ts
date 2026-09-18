import {
  BadRequestException,
  ConflictException,
  NotFoundException,
} from "@nestjs/common";

function details(code: string, error: string, detail: string) {
  return { code, error, detail };
}

export const meetingNotFound = () =>
  new NotFoundException(
    details("MEETING_NOT_FOUND", "Not Found", "The meeting does not exist."),
  );
export const meetingWorkspaceNotFound = () =>
  new NotFoundException(
    details(
      "MEETING_WORKSPACE_NOT_FOUND",
      "Not Found",
      "The workspace does not exist.",
    ),
  );
export const meetingUserNotFound = () =>
  new NotFoundException(
    details(
      "MEETING_USER_NOT_FOUND",
      "Not Found",
      "One or more participants do not exist or are inactive.",
    ),
  );
export const meetingScheduleInvalid = () =>
  new BadRequestException(
    details(
      "MEETING_SCHEDULE_INVALID",
      "Bad Request",
      "endAt must be later than startAt and reminderAt cannot be later than startAt.",
    ),
  );
export const meetingVenueInvalid = () =>
  new BadRequestException(
    details(
      "MEETING_VENUE_INVALID",
      "Bad Request",
      "Physical meetings require only a location, online meetings require only an onlineLink, and hybrid meetings require both.",
    ),
  );
export const meetingOrganizerParticipant = () =>
  new ConflictException(
    details(
      "MEETING_ORGANIZER_IS_PARTICIPANT",
      "Conflict",
      "The organizer already attends the meeting and cannot also be a participant.",
    ),
  );
export const meetingParticipantNotFound = () =>
  new ConflictException(
    details(
      "MEETING_PARTICIPANT_NOT_FOUND",
      "Conflict",
      "The user is not an invited participant.",
    ),
  );
export const meetingParticipantAlreadyInvited = () =>
  new ConflictException(
    details(
      "MEETING_PARTICIPANT_ALREADY_INVITED",
      "Conflict",
      "The user is already an invited participant.",
    ),
  );
export const meetingResponseAlreadyAcknowledged = () =>
  new ConflictException(
    details(
      "MEETING_RESPONSE_ALREADY_ACKNOWLEDGED",
      "Conflict",
      "A final participant response cannot be changed; repeating the same response is an idempotent acknowledgement.",
    ),
  );
export const meetingInvalidTransition = () =>
  new ConflictException(
    details(
      "MEETING_INVALID_TRANSITION",
      "Conflict",
      "Only a scheduled meeting can be completed or cancelled.",
    ),
  );
export const meetingNotScheduled = () =>
  new ConflictException(
    details(
      "MEETING_NOT_SCHEDULED",
      "Conflict",
      "Participants and schedule fields cannot be changed after the meeting reaches a terminal status.",
    ),
  );
