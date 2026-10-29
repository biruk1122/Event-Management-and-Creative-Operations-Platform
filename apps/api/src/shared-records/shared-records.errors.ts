import { NotFoundException, type HttpException } from "@nestjs/common";

export const SHARED_RECORD_ERROR = {
  sharedRecordNotFound: "SHARED_RECORD_NOT_FOUND",
} as const;

/**
 * Deliberately the same 404 whether the record does not exist, was never
 * shared with this caller, or the share was revoked - never distinguishing
 * "exists but not yours" from "does not exist" to a non-management caller.
 */
export function sharedRecordNotFound(): HttpException {
  return new NotFoundException({
    code: SHARED_RECORD_ERROR.sharedRecordNotFound,
    error: "Not Found",
    detail: "No record is currently shared with you at that id.",
  });
}
