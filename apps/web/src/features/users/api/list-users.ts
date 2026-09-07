import type { PaginatedUsers, UserStatus } from "../lib/users-types";
import { FIXTURE_PAGE } from "./fixtures";

export interface ListUsersQuery {
  status?: UserStatus;
  search?: string;
  page?: number;
}

export type ListUsers = (query: ListUsersQuery) => Promise<PaginatedUsers>;

/**
 * Placeholder for `GET /api/v1/users`. USR-05 (EVE-55) replaces the body with
 * a real `@event-platform/api-client` call and TanStack Query wiring. Until
 * then it returns a fixed fixture page so the surface can be built and tested.
 */
export const listUsers: ListUsers = () => Promise.resolve(FIXTURE_PAGE);
