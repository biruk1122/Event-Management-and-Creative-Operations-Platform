import type { AddTeamMember } from "../lib/teams-outcome";

/** Placeholder for `PUT /api/v1/teams/:id/members/:userId`. TEAM-05 wires it. */
export const addTeamMember: AddTeamMember = () =>
  Promise.resolve({ status: "unexpected" });
