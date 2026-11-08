import {
  BadRequestException,
  ConflictException,
  NotFoundException,
  type HttpException,
} from "@nestjs/common";

export const SMS_ERROR = {
  messageNotFound: "SMS_MESSAGE_NOT_FOUND",
  messageNotResolvable: "SMS_MESSAGE_NOT_RESOLVABLE",
  callbackNotFound: "SMS_CALLBACK_NOT_FOUND",
  settingsInvalid: "SMS_SETTINGS_INVALID",
  invalidDateRange: "SMS_INVALID_DATE_RANGE",
} as const;

export function smsSettingsInvalid(detail: string): HttpException {
  return new BadRequestException({
    code: SMS_ERROR.settingsInvalid,
    error: "Bad Request",
    detail,
  });
}

export function smsInvalidDateRange(): HttpException {
  return new BadRequestException({
    code: SMS_ERROR.invalidDateRange,
    error: "Bad Request",
    detail: "The start of the date range must not be after its end.",
  });
}

export function smsMessageNotFound(): HttpException {
  return new NotFoundException({
    code: SMS_ERROR.messageNotFound,
    error: "Not Found",
    detail: "No SMS message exists with that id.",
  });
}

export function smsMessageNotResolvable(): HttpException {
  return new ConflictException({
    code: SMS_ERROR.messageNotResolvable,
    error: "Conflict",
    detail: "Only an SMS whose send outcome is uncertain can be resolved.",
  });
}

/** One response for every reason a callback is refused, so callers learn nothing about the token. */
export function smsCallbackNotFound(): HttpException {
  return new NotFoundException({
    code: SMS_ERROR.callbackNotFound,
    error: "Not Found",
    detail: "Not found.",
  });
}
