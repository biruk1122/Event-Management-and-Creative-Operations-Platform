import type { SubmitLogin } from "../lib/login-outcome";

/**
 * Placeholder submit handler for the authentication UI.
 *
 * IAM-05 (EVE-43) replaces the body with a real `@event-platform/api-client`
 * call to `POST /api/v1/auth/login`, TanStack Query wiring, and Problem Details
 * mapping. Until then it resolves to the "unexpected" state so the screen is
 * never mistaken for a working sign-in.
 */
export const submitLogin: SubmitLogin = () =>
  Promise.resolve({ status: "unexpected" });
