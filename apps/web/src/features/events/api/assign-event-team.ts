import type { AssignEventTeam } from "../lib/events-outcome";

/**
 * Placeholder for `PUT /api/v1/events/:id/teams/:teamId`. EVT-05 (EVE-85)
 * replaces the body with a real `@event-platform/api-client` call and Problem
 * Details mapping. Until then it resolves to the "unexpected" state.
 */
export const assignEventTeam: AssignEventTeam = () =>
  Promise.resolve({ status: "unexpected" });
