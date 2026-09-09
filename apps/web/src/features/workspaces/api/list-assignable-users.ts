import type { AssignableUser } from "../lib/workspaces-types";
import { FIXTURE_USERS } from "./fixtures";

export type ListAssignableUsers = () => Promise<AssignableUser[]>;

/**
 * Placeholder for the users the manager and participant controls can offer.
 * The workspace API has no dedicated route, so WSP-05 (EVE-73) reads the first
 * page of `GET /api/v1/users`. Until then it returns a fixture set.
 */
export const listAssignableUsers: ListAssignableUsers = () =>
  Promise.resolve([...FIXTURE_USERS]);
