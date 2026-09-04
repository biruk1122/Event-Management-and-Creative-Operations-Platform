import {
  ForbiddenException,
  UnauthorizedException,
  type HttpException,
} from "@nestjs/common";

/** Stable Problem Details codes for the authentication surface. */
export const AUTH_ERROR = {
  invalidCredentials: "AUTH_INVALID_CREDENTIALS",
  accountInactive: "AUTH_ACCOUNT_INACTIVE",
  accountLocked: "AUTH_ACCOUNT_LOCKED",
  unauthenticated: "AUTH_UNAUTHENTICATED",
  invalidSession: "AUTH_INVALID_SESSION",
  sessionReuseDetected: "AUTH_SESSION_REUSE_DETECTED",
  csrfTokenInvalid: "CSRF_TOKEN_INVALID",
} as const;

export function invalidCredentials(): HttpException {
  return new UnauthorizedException({
    code: AUTH_ERROR.invalidCredentials,
    error: "Unauthorized",
    detail: "The email address or password is incorrect.",
  });
}

export function accountInactive(): HttpException {
  return new ForbiddenException({
    code: AUTH_ERROR.accountInactive,
    error: "Forbidden",
    detail: "This account is not active.",
  });
}

export function accountLocked(): HttpException {
  return new ForbiddenException({
    code: AUTH_ERROR.accountLocked,
    error: "Forbidden",
    detail: "Too many failed attempts. Try again later.",
  });
}

export function unauthenticated(): HttpException {
  return new UnauthorizedException({
    code: AUTH_ERROR.unauthenticated,
    error: "Unauthorized",
    detail: "Authentication is required to access this resource.",
  });
}

export function invalidSession(): HttpException {
  return new UnauthorizedException({
    code: AUTH_ERROR.invalidSession,
    error: "Unauthorized",
    detail: "The session is missing, expired, or has been revoked.",
  });
}

export function sessionReuseDetected(): HttpException {
  return new UnauthorizedException({
    code: AUTH_ERROR.sessionReuseDetected,
    error: "Unauthorized",
    detail:
      "A revoked refresh token was replayed; the session family was revoked.",
  });
}

export function csrfTokenInvalid(): HttpException {
  return new ForbiddenException({
    code: AUTH_ERROR.csrfTokenInvalid,
    error: "Forbidden",
    detail: "The CSRF token is missing or does not match.",
  });
}
