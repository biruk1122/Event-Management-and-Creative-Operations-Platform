import type { AssignableTeam } from "../lib/events-types";
import { FIXTURE_TEAMS } from "./fixtures";

export type ListAssignableTeams = () => Promise<AssignableTeam[]>;

/**
 * Placeholder for the teams the "assign team" control can offer. EVT-05
 * (EVE-85) reads the first page of `GET /api/v1/teams`. Until then it returns a
 * fixture set.
 */
export const listAssignableTeams: ListAssignableTeams = () =>
  Promise.resolve([...FIXTURE_TEAMS]);
