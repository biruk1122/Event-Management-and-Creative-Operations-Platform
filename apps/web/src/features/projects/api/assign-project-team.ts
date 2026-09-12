import type { AssignProjectTeam } from "../lib/projects-outcome";

/**
 * Placeholder for `PUT /api/v1/projects/:id/teams/:teamId`. PRJ-05 replaces
 * the body with a real `@event-platform/api-client` call and Problem Details
 * mapping. Until then it resolves to the "unexpected" state.
 */
export const assignProjectTeam: AssignProjectTeam = () =>
  Promise.resolve({ status: "unexpected" });
