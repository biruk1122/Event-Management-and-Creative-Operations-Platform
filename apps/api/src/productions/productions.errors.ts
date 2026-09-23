import {
  BadRequestException,
  ConflictException,
  NotFoundException,
} from "@nestjs/common";
export const productionNotFound = () =>
  new NotFoundException({
    code: "PRODUCTION_NOT_FOUND",
    detail: "Production not found.",
  });
export const productionUserNotFound = () =>
  new NotFoundException({
    code: "USER_NOT_FOUND",
    detail: "Manager or participant not found.",
  });
export const productionTeamNotFound = () =>
  new NotFoundException({ code: "TEAM_NOT_FOUND", detail: "Team not found." });
export const productionTalentNotFound = () =>
  new NotFoundException({
    code: "TALENT_NOT_FOUND",
    detail: "Talent not found.",
  });
export const productionInvalidSchedule = () =>
  new BadRequestException({
    code: "PRODUCTION_SCHEDULE_INVALID",
    detail: "End must not precede start.",
  });
export const productionInvalidTransition = () =>
  new ConflictException({
    code: "PRODUCTION_TRANSITION_INVALID",
    detail: "The requested transition is not allowed.",
  });
export const productionConflict = (code: string) =>
  new ConflictException({
    code,
    detail: "The requested association is not in the expected state.",
  });
