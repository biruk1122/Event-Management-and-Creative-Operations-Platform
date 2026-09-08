import type { AssignableUser } from "../lib/teams-types";
import { FIXTURE_USERS } from "./fixtures";

export type ListAssignableManagers = () => Promise<AssignableUser[]>;

/**
 * Placeholder for the user list the manager and member controls offer.
 * TEAM-05 replaces the body with a real `GET /api/v1/users` call.
 */
export const listAssignableManagers: ListAssignableManagers = () =>
  Promise.resolve([...FIXTURE_USERS]);
