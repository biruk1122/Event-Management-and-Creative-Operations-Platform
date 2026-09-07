import type { User } from "../lib/users-types";
import { FIXTURE_USERS } from "./fixtures";

export type GetUser = (id: string) => Promise<User | null>;

/**
 * Placeholder for `GET /api/v1/users/:id`. USR-05 (EVE-55) replaces the body
 * with a real `@event-platform/api-client` call and TanStack Query wiring.
 */
export const getUser: GetUser = (id) =>
  Promise.resolve(FIXTURE_USERS.find((user) => user.id === id) ?? null);
