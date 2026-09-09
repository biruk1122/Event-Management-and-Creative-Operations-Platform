import type { AssignableUser } from "../lib/events-types";
import { FIXTURE_USERS } from "./fixtures";

export type ListAssignableUsers = () => Promise<AssignableUser[]>;

/**
 * Placeholder for the users the manager control can offer. The events API has
 * no dedicated route, so EVT-05 (EVE-85) reads the first page of
 * `GET /api/v1/users`. Until then it returns a fixture set.
 */
export const listAssignableUsers: ListAssignableUsers = () =>
  Promise.resolve([...FIXTURE_USERS]);
