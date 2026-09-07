import type { ReactivateUser } from "../lib/users-outcome";

/**
 * Placeholder for `POST /api/v1/users/:id/reactivate`. USR-05 (EVE-55)
 * replaces the body with a real `@event-platform/api-client` call.
 */
export const reactivateUser: ReactivateUser = () =>
  Promise.resolve({ status: "unexpected" });
