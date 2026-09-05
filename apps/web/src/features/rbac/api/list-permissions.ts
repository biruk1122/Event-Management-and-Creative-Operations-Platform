import type { Permission } from "../lib/rbac-types";
import { FIXTURE_PERMISSIONS } from "./fixtures";

export type ListPermissions = () => Promise<Permission[]>;

/**
 * Placeholder for `GET /api/v1/permissions`. RBAC-05 (EVE-49) replaces the
 * body with a real `@event-platform/api-client` call and TanStack Query
 * wiring.
 */
export const listPermissions: ListPermissions = () =>
  Promise.resolve([...FIXTURE_PERMISSIONS]);
