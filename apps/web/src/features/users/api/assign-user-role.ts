import type { AssignRole } from "../lib/users-outcome";

/**
 * Placeholder for `PUT /api/v1/users/:id/role`. USR-05 (EVE-55) replaces the
 * body with a real `@event-platform/api-client` call and Problem Details
 * mapping.
 */
export const assignUserRole: AssignRole = () =>
  Promise.resolve({ status: "unexpected" });
