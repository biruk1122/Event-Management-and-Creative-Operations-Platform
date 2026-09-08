import type { DeactivateTeam } from "../lib/teams-outcome";

/** Placeholder for `POST /api/v1/teams/:id/deactivate`. TEAM-05 wires it. */
export const deactivateTeam: DeactivateTeam = () =>
  Promise.resolve({ status: "unexpected" });
