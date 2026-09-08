import type { DeleteTeam } from "../lib/teams-outcome";

/** Placeholder for `DELETE /api/v1/teams/:id`. TEAM-05 wires the real call. */
export const deleteTeam: DeleteTeam = () =>
  Promise.resolve({ status: "unexpected" });
