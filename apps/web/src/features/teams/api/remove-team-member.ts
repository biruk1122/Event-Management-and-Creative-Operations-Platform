import type { RemoveTeamMember } from "../lib/teams-outcome";

/** Placeholder for `DELETE /api/v1/teams/:id/members/:userId`. TEAM-05 wires it. */
export const removeTeamMember: RemoveTeamMember = () =>
  Promise.resolve({ status: "unexpected" });
