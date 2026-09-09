import type { AssignWorkspaceTeam } from "../lib/workspaces-outcome";

/**
 * Placeholder for `PUT /api/v1/workspaces/:id/teams/:teamId`. WSP-05 (EVE-73)
 * replaces the body with a real `@event-platform/api-client` call and Problem
 * Details mapping. Until then it resolves to the "unexpected" state.
 */
export const assignWorkspaceTeam: AssignWorkspaceTeam = () =>
  Promise.resolve({ status: "unexpected" });
