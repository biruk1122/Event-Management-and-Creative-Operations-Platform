import type { LoginValues } from "./login-schema";

/**
 * Result of a sign-in attempt, expressed in UI terms. IAM-05 (EVE-43) maps the
 * real API responses and Problem Details codes onto these cases; the UI slice
 * only needs to know which state to present.
 */
export type LoginOutcome =
  | { status: "success" }
  | { status: "invalid_credentials" }
  | { status: "account_locked" }
  | { status: "rate_limited" }
  | {
      status: "field_errors";
      fieldErrors: Partial<Record<keyof LoginValues, string>>;
    }
  | { status: "unexpected" };

export type SubmitLogin = (values: LoginValues) => Promise<LoginOutcome>;
