import {
  BadRequestException,
  NotFoundException,
  type HttpException,
} from "@nestjs/common";

/** Stable Problem Details codes for the letters surface. */
export const LETTER_ERROR = {
  letterNotFound: "LETTER_NOT_FOUND",
  letterAssignmentInvalid: "LETTER_ASSIGNMENT_INVALID",
} as const;

export function letterNotFound(): HttpException {
  return new NotFoundException({
    code: LETTER_ERROR.letterNotFound,
    error: "Not Found",
    detail: "No letter exists with that id.",
  });
}

export function letterAssignmentInvalid(detail: string): HttpException {
  return new BadRequestException({
    code: LETTER_ERROR.letterAssignmentInvalid,
    error: "Bad Request",
    detail,
  });
}
