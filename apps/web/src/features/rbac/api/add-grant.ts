import type { AddGrant } from "../lib/rbac-outcome";

/**
 * Placeholder for `POST /api/v1/roles/:id/permissions`. RBAC-05 (EVE-49)
 * replaces the body with a real `@event-platform/api-client` call, TanStack
 * Query wiring, and Problem Details mapping.
 */
export const addGrant: AddGrant = () =>
  Promise.resolve({ status: "unexpected" });
