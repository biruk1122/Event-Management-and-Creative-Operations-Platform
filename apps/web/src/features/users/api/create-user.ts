import type { CreateUser } from "../lib/users-outcome";

/**
 * Placeholder for `POST /api/v1/users`. USR-05 (EVE-55) replaces the body with
 * a real `@event-platform/api-client` call, TanStack Query wiring, and Problem
 * Details mapping. Until then it resolves to the "unexpected" state so the
 * screen is never mistaken for a working create.
 */
export const createUser: CreateUser = () =>
  Promise.resolve({ status: "unexpected" });
