import type { AssignableUser } from "../lib/departments-types";
import { FIXTURE_MANAGERS } from "./fixtures";

export type ListAssignableManagers = () => Promise<AssignableUser[]>;

/**
 * Placeholder for the user list the manager control offers. DEP-05 (EVE-61)
 * replaces the body with a real `GET /api/v1/users` call.
 */
export const listAssignableManagers: ListAssignableManagers = () =>
  Promise.resolve([...FIXTURE_MANAGERS]);
