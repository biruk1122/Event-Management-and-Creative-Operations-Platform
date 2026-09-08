import type { ReactivateTeam } from "../lib/teams-outcome";

/** Placeholder for `POST /api/v1/teams/:id/reactivate`. TEAM-05 wires it. */
export const reactivateTeam: ReactivateTeam = () =>
  Promise.resolve({ status: "unexpected" });
