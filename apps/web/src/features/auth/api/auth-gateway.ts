import type { components } from "@event-platform/api-client";

import { browserApi } from "@/lib/api/browser";
import { readCsrfToken } from "@/lib/api/csrf";
import { fieldErrorsOf, isProblemDetails } from "@/lib/api/problem-details";

import type { LoginOutcome } from "../lib/login-outcome";
import type { LoginValues } from "../lib/login-schema";

export type AuthUser = components["schemas"]["AuthenticatedUserResponse"];

/** Problem Details `code` -> the sign-in state the form should show. */
const LOGIN_CODE_TO_STATUS: Record<
  string,
  Extract<
    LoginOutcome["status"],
    | "invalid_credentials"
    | "account_locked"
    | "account_inactive"
    | "rate_limited"
  >
> = {
  AUTH_INVALID_CREDENTIALS: "invalid_credentials",
  AUTH_ACCOUNT_LOCKED: "account_locked",
  AUTH_ACCOUNT_INACTIVE: "account_inactive",
  AUTH_RATE_LIMITED: "rate_limited",
};

export interface LoginResult {
  outcome: LoginOutcome;
  user: AuthUser | null;
}

/** Thrown when an auth request fails in a way the caller cannot recover from. */
export class AuthRequestError extends Error {
  constructor(
    readonly operation: string,
    readonly status: number,
  ) {
    super(
      `Authentication request "${operation}" failed with status ${status}.`,
    );
    this.name = "AuthRequestError";
  }
}

/**
 * Exchange credentials for a session. Cookies are set by the API and stored by
 * the browser (`credentials: "include"`). Never throws for an expected auth
 * failure - those are returned as a mapped `outcome`.
 */
export async function login(values: LoginValues): Promise<LoginResult> {
  const { data, error } = await browserApi.POST("/api/v1/auth/login", {
    body: { email: values.email, password: values.password },
  });

  if (data) {
    return { outcome: { status: "success" }, user: data.user };
  }

  if (isProblemDetails(error)) {
    if (error.code === "VALIDATION_ERROR") {
      const raw = fieldErrorsOf(error);
      const fieldErrors: Partial<Record<keyof LoginValues, string>> = {};
      if (raw.email) {
        fieldErrors.email = raw.email;
      }
      if (raw.password) {
        fieldErrors.password = raw.password;
      }
      if (
        fieldErrors.email !== undefined ||
        fieldErrors.password !== undefined
      ) {
        return { outcome: { status: "field_errors", fieldErrors }, user: null };
      }
    }

    const mapped = LOGIN_CODE_TO_STATUS[error.code];
    if (mapped) {
      return { outcome: { status: mapped }, user: null };
    }
  }

  return { outcome: { status: "unexpected" }, user: null };
}

/**
 * Revoke the current session. Sends the CSRF double-submit header and relies on
 * the API to clear the cookies.
 */
export async function logout(): Promise<void> {
  const csrfToken = readCsrfToken();
  const { error, response } = await browserApi.POST("/api/v1/auth/logout", {
    headers: csrfToken ? { "x-csrf-token": csrfToken } : {},
  });

  if (error !== undefined || !response.ok) {
    throw new AuthRequestError("logout", response.status);
  }
}

/** Return the signed-in account, or null when there is no valid session. */
export async function fetchCurrentUser(): Promise<AuthUser | null> {
  const { data, response } = await browserApi.GET("/api/v1/auth/me");

  if (data) {
    return data;
  }
  if (response.status === 401) {
    return null;
  }

  throw new AuthRequestError("me", response.status);
}
