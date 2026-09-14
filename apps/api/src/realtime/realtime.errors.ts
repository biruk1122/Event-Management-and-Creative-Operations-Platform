import { SECURITY_ERROR } from "../common/security/security.errors.js";
import type { RealtimeAckError } from "./realtime.contracts.js";

/**
 * Stable acknowledgement error codes for `/realtime` commands. These reuse
 * the same stable codes REST's Problem Details already defines (ADR 0004 §3)
 * so a client shares one error-handling vocabulary across both transports.
 * An ack error is a plain object, not an `HttpException`: there is no HTTP
 * response to attach one to inside a gateway handler.
 */
export const REALTIME_ERROR = {
  permissionDenied: SECURITY_ERROR.permissionDenied,
  validationError: "VALIDATION_ERROR",
  notFound: "NOT_FOUND",
  rateLimited: "RATE_LIMITED",
  payloadTooLarge: "PAYLOAD_TOO_LARGE",
} as const;

export function permissionDeniedAck(): RealtimeAckError {
  return {
    code: REALTIME_ERROR.permissionDenied,
    message: "You do not have permission to perform this action.",
  };
}

export function validationErrorAck(message: string): RealtimeAckError {
  return { code: REALTIME_ERROR.validationError, message };
}

export function notFoundAck(message: string): RealtimeAckError {
  return { code: REALTIME_ERROR.notFound, message };
}

export function rateLimitedAck(): RealtimeAckError {
  return {
    code: REALTIME_ERROR.rateLimited,
    message: "Too many commands. Slow down and try again.",
  };
}

export function payloadTooLargeAck(): RealtimeAckError {
  return {
    code: REALTIME_ERROR.payloadTooLarge,
    message: "That command's payload is too large.",
  };
}
