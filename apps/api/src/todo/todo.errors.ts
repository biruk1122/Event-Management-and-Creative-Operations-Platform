import {
  BadRequestException,
  NotFoundException,
  type HttpException,
} from "@nestjs/common";

export const TODO_ERROR = {
  notFound: "TODO_NOT_FOUND",
  scheduleInvalid: "TODO_SCHEDULE_INVALID",
  relatedEventNotFound: "TODO_RELATED_EVENT_NOT_FOUND",
  relatedProjectNotFound: "TODO_RELATED_PROJECT_NOT_FOUND",
} as const;

export function todoNotFound(): HttpException {
  return new NotFoundException({
    code: TODO_ERROR.notFound,
    error: "Not Found",
    detail: "No to-do item exists with that id for the caller.",
  });
}

export function todoScheduleInvalid(): HttpException {
  return new BadRequestException({
    code: TODO_ERROR.scheduleInvalid,
    error: "Bad Request",
    detail: "A due time requires a due date.",
  });
}

export function todoRelatedEventNotFound(): HttpException {
  return new BadRequestException({
    code: TODO_ERROR.relatedEventNotFound,
    error: "Bad Request",
    detail: "No event exists with the given relatedEventId.",
  });
}

export function todoRelatedProjectNotFound(): HttpException {
  return new BadRequestException({
    code: TODO_ERROR.relatedProjectNotFound,
    error: "Bad Request",
    detail: "No project exists with the given relatedProjectId.",
  });
}
