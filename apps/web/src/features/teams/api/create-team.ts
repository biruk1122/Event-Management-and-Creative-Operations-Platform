import type { CreateTeam } from "../lib/teams-outcome";

/**
 * Placeholder for `POST /api/v1/teams`. TEAM-05 replaces the body with a real
 * `@event-platform/api-client` call, TanStack Query wiring, and Problem
 * Details mapping. Until then it resolves to the "unexpected" state so the
 * screen is never mistaken for a working create.
 */
export const createTeam: CreateTeam = () =>
  Promise.resolve({ status: "unexpected" });
