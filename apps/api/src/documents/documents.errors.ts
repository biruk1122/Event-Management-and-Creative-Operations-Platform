import {
  BadRequestException,
  NotFoundException,
  type HttpException,
} from "@nestjs/common";

/** Stable Problem Details codes for the documents surface. */
export const DOCUMENT_ERROR = {
  documentNotFound: "DOCUMENT_NOT_FOUND",
  documentAssignmentInvalid: "DOCUMENT_ASSIGNMENT_INVALID",
  documentAlreadyHasFile: "DOCUMENT_ALREADY_HAS_FILE",
} as const;

export function documentNotFound(): HttpException {
  return new NotFoundException({
    code: DOCUMENT_ERROR.documentNotFound,
    error: "Not Found",
    detail: "No document exists with that id.",
  });
}

export function documentAssignmentInvalid(detail: string): HttpException {
  return new BadRequestException({
    code: DOCUMENT_ERROR.documentAssignmentInvalid,
    error: "Bad Request",
    detail,
  });
}

export function documentAlreadyHasFile(): HttpException {
  return new BadRequestException({
    code: DOCUMENT_ERROR.documentAlreadyHasFile,
    error: "Bad Request",
    detail: "This document already has a file attached.",
  });
}
