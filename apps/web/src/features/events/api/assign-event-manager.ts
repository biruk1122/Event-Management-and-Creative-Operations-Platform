import type { AssignEventManager } from "../lib/events-outcome";

/**
 * Placeholder for `PUT /api/v1/events/:id/manager`. EVT-05 (EVE-85) replaces
 * the body with a real `@event-platform/api-client` call and Problem Details
 * mapping. Until then it resolves to the "unexpected" state.
 */
export const assignEventManager: AssignEventManager = () =>
  Promise.resolve({ status: "unexpected" });
