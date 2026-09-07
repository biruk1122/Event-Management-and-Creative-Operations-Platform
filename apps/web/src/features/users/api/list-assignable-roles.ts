import type { UserRoleSummary } from "../lib/users-types";
import { FIXTURE_ROLES } from "./fixtures";

export type ListAssignableRoles = () => Promise<UserRoleSummary[]>;

/**
 * Placeholder for the role list the assignment control offers. USR-05
 * (EVE-55) replaces the body with a real `GET /api/v1/roles` call.
 */
export const listAssignableRoles: ListAssignableRoles = () =>
  Promise.resolve([...FIXTURE_ROLES]);
