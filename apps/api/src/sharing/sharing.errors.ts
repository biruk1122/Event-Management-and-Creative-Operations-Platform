import {
  BadRequestException,
  ConflictException,
  NotFoundException,
  type HttpException,
} from "@nestjs/common";

/** Stable Problem Details codes for the sharing surface. */
export const SHARE_ERROR = {
  shareNotFound: "SHARE_NOT_FOUND",
  shareAssignmentInvalid: "SHARE_ASSIGNMENT_INVALID",
  shareAlreadyExists: "SHARE_ALREADY_EXISTS",
  shareAlreadyRevoked: "SHARE_ALREADY_REVOKED",
} as const;

export function shareNotFound(): HttpException {
  return new NotFoundException({
    code: SHARE_ERROR.shareNotFound,
    error: "Not Found",
    detail: "No share exists with that id.",
  });
}

export function shareAssignmentInvalid(detail: string): HttpException {
  return new BadRequestException({
    code: SHARE_ERROR.shareAssignmentInvalid,
    error: "Bad Request",
    detail,
  });
}

export function shareAlreadyExists(): HttpException {
  return new ConflictException({
    code: SHARE_ERROR.shareAlreadyExists,
    error: "Conflict",
    detail: "This record is already actively shared with that audience.",
  });
}

export function shareAlreadyRevoked(): HttpException {
  return new ConflictException({
    code: SHARE_ERROR.shareAlreadyRevoked,
    error: "Conflict",
    detail: "This share was already revoked.",
  });
}
