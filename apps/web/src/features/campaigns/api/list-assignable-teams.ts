import type { AssignableTeam } from "../lib/campaigns-types";
import { FIXTURE_TEAMS } from "./fixtures";

export type ListAssignableTeams = () => Promise<AssignableTeam[]>;

/**
 * Placeholder for the teams the "assign team" control can offer. The campaigns
 * API has no dedicated route, so CAM-05 reads `GET /api/v1/teams`. Until then
 * it returns a fixture set.
 */
export const listAssignableTeams: ListAssignableTeams = () =>
  Promise.resolve([...FIXTURE_TEAMS]);
