import { ForbiddenException, type HttpException } from "@nestjs/common";

/** Stable Problem Details codes for cross-module authorization failures. */
export const SECURITY_ERROR = {
  permissionDenied: "PERMISSION_DENIED",
} as const;

/**
 * The acting user is authenticated but does not hold a permission the
 * operation requires. The message is deliberately generic: it does not name
 * the required permission or scope, so a denial does not disclose the
 * authorization model to a caller probing it.
 */
export function permissionDenied(): HttpException {
  return new ForbiddenException({
    code: SECURITY_ERROR.permissionDenied,
    error: "Forbidden",
    detail: "You do not have permission to perform this action.",
  });
}
