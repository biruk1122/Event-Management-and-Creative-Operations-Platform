import type { AssignableTeam } from "../lib/projects-types";
import { FIXTURE_TEAMS } from "./fixtures";

export type ListAssignableTeams = () => Promise<AssignableTeam[]>;

/**
 * Placeholder for the teams the "assign team" control can offer. PRJ-05
 * reads the first page of `GET /api/v1/teams`. Until then it returns a
 * fixture set.
 */
export const listAssignableTeams: ListAssignableTeams = () =>
  Promise.resolve([...FIXTURE_TEAMS]);
