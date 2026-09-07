import type { DeactivateUser } from "../lib/users-outcome";

/**
 * Placeholder for `POST /api/v1/users/:id/deactivate`. USR-05 (EVE-55)
 * replaces the body with a real `@event-platform/api-client` call.
 */
export const deactivateUser: DeactivateUser = () =>
  Promise.resolve({ status: "unexpected" });
