import type { AssignableUser } from "../lib/campaigns-types";
import { FIXTURE_USERS } from "./fixtures";

export type ListAssignableUsers = () => Promise<AssignableUser[]>;

/**
 * Placeholder for the users the manager control can offer. The campaigns API
 * has no dedicated route, so CAM-05 reads the first page of
 * `GET /api/v1/users`. Until then it returns a fixture set.
 */
export const listAssignableUsers: ListAssignableUsers = () =>
  Promise.resolve([...FIXTURE_USERS]);
