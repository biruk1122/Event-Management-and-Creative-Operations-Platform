import type { RemoveProjectTeam } from "../lib/projects-outcome";

/**
 * Placeholder for `DELETE /api/v1/projects/:id/teams/:teamId`. PRJ-05
 * replaces the body with a real `@event-platform/api-client` call and
 * Problem Details mapping. Until then it resolves to the "unexpected" state.
 */
export const removeProjectTeam: RemoveProjectTeam = () =>
  Promise.resolve({ status: "unexpected" });
