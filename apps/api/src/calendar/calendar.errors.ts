import {
  BadRequestException,
  NotFoundException,
  type HttpException,
} from "@nestjs/common";

export const CALENDAR_ERROR = {
  entryNotFound: "CALENDAR_ENTRY_NOT_FOUND",
  rangeInvalid: "CALENDAR_RANGE_INVALID",
  scheduleInvalid: "CALENDAR_SCHEDULE_INVALID",
} as const;

export function calendarEntryNotFound(): HttpException {
  return new NotFoundException({
    code: CALENDAR_ERROR.entryNotFound,
    error: "Not Found",
    detail: "No calendar entry exists with that id for the caller.",
  });
}

export function calendarRangeInvalid(): HttpException {
  return new BadRequestException({
    code: CALENDAR_ERROR.rangeInvalid,
    error: "Bad Request",
    detail: "The calendar range must be ordered and no longer than 90 days.",
  });
}

export function calendarScheduleInvalid(): HttpException {
  return new BadRequestException({
    code: CALENDAR_ERROR.scheduleInvalid,
    error: "Bad Request",
    detail: "The calendar entry end must be at or after its start.",
  });
}
