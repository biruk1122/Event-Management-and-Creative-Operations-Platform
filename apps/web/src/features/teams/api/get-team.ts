import type { GetTeam } from "../lib/teams-outcome";
import { FIXTURE_TEAMS } from "./fixtures";

/**
 * Placeholder for `GET /api/v1/teams/:id`. TEAM-05 replaces the body with a
 * real `@event-platform/api-client` call and TanStack Query wiring.
 */
export const getTeam: GetTeam = (id) =>
  Promise.resolve(FIXTURE_TEAMS.find((team) => team.id === id) ?? null);
