import type { Role } from "../lib/rbac-types";
import { FIXTURE_ROLES } from "./fixtures";

export type ListRoles = () => Promise<Role[]>;

/**
 * Placeholder for `GET /api/v1/roles`. RBAC-05 (EVE-49) replaces the body
 * with a real `@event-platform/api-client` call and TanStack Query wiring.
 * Until then it resolves to realistic fixture content so the surface can be
 * built and tested at its true scale.
 */
export const listRoles: ListRoles = () => Promise.resolve(FIXTURE_ROLES);
