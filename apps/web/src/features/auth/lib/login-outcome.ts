import type { LoginValues } from "./login-schema";

/**
 * Result of a sign-in attempt, expressed in UI terms. `auth-gateway` maps the
 * real API responses and Problem Details codes onto these cases; the form only
 * needs to know which state to present.
 */
export type LoginOutcome =
  | { status: "success" }
  | { status: "invalid_credentials" }
  | { status: "account_locked" }
  | { status: "account_inactive" }
  | { status: "rate_limited" }
  | {
      status: "field_errors";
      fieldErrors: Partial<Record<keyof LoginValues, string>>;
    }
  | { status: "unexpected" };

export type SubmitLogin = (values: LoginValues) => Promise<LoginOutcome>;
