import type { RemoveGrant } from "../lib/rbac-outcome";

/**
 * Placeholder for `DELETE /api/v1/roles/:id/permissions/:key/:scope`. RBAC-05
 * (EVE-49) replaces the body with a real `@event-platform/api-client` call,
 * TanStack Query wiring, and Problem Details mapping.
 */
export const removeGrant: RemoveGrant = () =>
  Promise.resolve({ status: "unexpected" });
