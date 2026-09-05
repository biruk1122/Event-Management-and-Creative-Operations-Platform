import type { DeleteRole } from "../lib/rbac-outcome";

/**
 * Placeholder for `DELETE /api/v1/roles/:id`. RBAC-05 (EVE-49) replaces the
 * body with a real `@event-platform/api-client` call, TanStack Query wiring,
 * and Problem Details mapping.
 */
export const deleteRole: DeleteRole = () =>
  Promise.resolve({ status: "unexpected" });
