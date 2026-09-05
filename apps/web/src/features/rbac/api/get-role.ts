import type { RoleWithGrants } from "../lib/rbac-types";
import { FIXTURE_ROLE_GRANTS } from "./fixtures";

export type GetRole = (id: string) => Promise<RoleWithGrants | null>;

/**
 * Placeholder for `GET /api/v1/roles/:id`. RBAC-05 (EVE-49) replaces the body
 * with a real `@event-platform/api-client` call and TanStack Query wiring.
 */
export const getRole: GetRole = (id) =>
  Promise.resolve(FIXTURE_ROLE_GRANTS[id] ?? null);
