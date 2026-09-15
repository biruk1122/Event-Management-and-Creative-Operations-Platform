import type { DiscussPerson } from "../lib/discuss-types";
import { FIXTURE_ASSIGNABLE_PEOPLE } from "./fixtures";

export type ListAssignablePeople = () => Promise<DiscussPerson[]>;

/**
 * Placeholder for the user list a "start a conversation" or "add member"
 * picker offers. DSC-05 (EVE-109) replaces the body with a real
 * `GET /api/v1/users` call.
 */
export const listAssignablePeople: ListAssignablePeople = () =>
  Promise.resolve([...FIXTURE_ASSIGNABLE_PEOPLE]);
