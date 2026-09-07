import type { UpdateUser } from "../lib/users-outcome";

/**
 * Placeholder for `PATCH /api/v1/users/:id`. USR-05 (EVE-55) replaces the body
 * with a real `@event-platform/api-client` call, TanStack Query wiring, and
 * Problem Details mapping.
 */
export const updateUser: UpdateUser = () =>
  Promise.resolve({ status: "unexpected" });
