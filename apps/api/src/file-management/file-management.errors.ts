import {
  BadRequestException,
  ConflictException,
  NotFoundException,
  ServiceUnavailableException,
  type HttpException,
} from "@nestjs/common";

/** Stable Problem Details codes for managed-file requests. */
export const FILE_ERROR = {
  invalidDeclaration: "FILE_INVALID_DECLARATION",
  notFound: "FILE_NOT_FOUND",
  intentExpired: "FILE_INTENT_EXPIRED",
  uploadNotFound: "FILE_UPLOAD_NOT_FOUND",
  verificationFailed: "FILE_VERIFICATION_FAILED",
  stateConflict: "FILE_STATE_CONFLICT",
  scannerUnavailable: "FILE_SCANNER_UNAVAILABLE",
} as const;

export function invalidFileDeclaration(detail: string): HttpException {
  return new BadRequestException({
    code: FILE_ERROR.invalidDeclaration,
    error: "Bad Request",
    detail,
  });
}

export function fileNotFound(): HttpException {
  // Do not distinguish a guessed id from an inaccessible attachment.
  return new NotFoundException({
    code: FILE_ERROR.notFound,
    error: "Not Found",
    detail: "No available file exists with that id for this parent.",
  });
}

export function fileIntentExpired(): HttpException {
  return new ConflictException({
    code: FILE_ERROR.intentExpired,
    error: "Conflict",
    detail: "This upload intent has expired. Create a new upload intent.",
  });
}

export function fileUploadNotFound(): HttpException {
  return new ConflictException({
    code: FILE_ERROR.uploadNotFound,
    error: "Conflict",
    detail: "No uploaded object was found for this upload intent.",
  });
}

export function fileVerificationFailed(): HttpException {
  return new ConflictException({
    code: FILE_ERROR.verificationFailed,
    error: "Conflict",
    detail: "The uploaded object does not satisfy the file safety policy.",
  });
}

export function fileStateConflict(): HttpException {
  return new ConflictException({
    code: FILE_ERROR.stateConflict,
    error: "Conflict",
    detail: "This file is not in a state that permits that operation.",
  });
}

export function fileScannerUnavailable(): HttpException {
  return new ServiceUnavailableException({
    code: FILE_ERROR.scannerUnavailable,
    error: "Service Unavailable",
    detail:
      "The file scanner is unavailable. Create a new upload intent and try again later.",
  });
}
