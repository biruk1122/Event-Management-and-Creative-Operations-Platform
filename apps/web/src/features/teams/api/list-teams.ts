import type { PaginatedTeams, TeamActivity } from "../lib/teams-types";
import { FIXTURE_PAGE } from "./fixtures";

export interface ListTeamsQuery {
  status?: TeamActivity;
  search?: string;
  departmentId?: string;
  page?: number;
}

export type ListTeams = (query: ListTeamsQuery) => Promise<PaginatedTeams>;

/**
 * Placeholder for `GET /api/v1/teams`. TEAM-05 replaces the body with a real
 * `@event-platform/api-client` call and TanStack Query wiring. Until then it
 * returns a fixed fixture page so the surface can be built and tested.
 */
export const listTeams: ListTeams = () => Promise.resolve(FIXTURE_PAGE);
