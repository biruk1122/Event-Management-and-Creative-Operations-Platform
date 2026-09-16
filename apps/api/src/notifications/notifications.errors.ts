import {
  BadRequestException,
  NotFoundException,
  type HttpException,
} from "@nestjs/common";

export const NOTIFICATION_ERROR = {
  notificationNotFound: "NOTIFICATION_NOT_FOUND",
  typeInvalid: "NOTIFICATION_TYPE_INVALID",
  typeNotMutable: "NOTIFICATION_TYPE_NOT_MUTABLE",
} as const;

export function notificationNotFound(): HttpException {
  return new NotFoundException({
    code: NOTIFICATION_ERROR.notificationNotFound,
    error: "Not Found",
    detail: "No notification exists with that id for the caller.",
  });
}

export function notificationTypeInvalid(): HttpException {
  return new BadRequestException({
    code: NOTIFICATION_ERROR.typeInvalid,
    error: "Bad Request",
    detail: "Unknown notification type.",
  });
}

export function notificationTypeNotMutable(): HttpException {
  return new BadRequestException({
    code: NOTIFICATION_ERROR.typeNotMutable,
    error: "Bad Request",
    detail:
      "This notification type represents a direct action, outcome, or participation obligation and cannot be muted.",
  });
}
