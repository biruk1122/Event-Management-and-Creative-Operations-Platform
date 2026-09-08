import type { AssignManager } from "../lib/teams-outcome";

/** Placeholder for `PUT /api/v1/teams/:id/manager`. TEAM-05 wires the real call. */
export const assignTeamManager: AssignManager = () =>
  Promise.resolve({ status: "unexpected" });
