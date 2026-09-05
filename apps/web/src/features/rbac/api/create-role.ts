import type { CreateRole } from "../lib/rbac-outcome";

/**
 * Placeholder for `POST /api/v1/roles`. RBAC-05 (EVE-49) replaces the body
 * with a real `@event-platform/api-client` call, TanStack Query wiring, and
 * Problem Details mapping. Until then it resolves to the "unexpected" state
 * so the screen is never mistaken for a working create.
 */
export const createRole: CreateRole = () =>
  Promise.resolve({ status: "unexpected" });
