import type { SetEventBudget } from "../lib/events-outcome";

/**
 * Placeholder for `PUT /api/v1/events/:id/budget`. EVT-05 (EVE-85) replaces the
 * body with a real `@event-platform/api-client` call and Problem Details
 * mapping. Until then it resolves to the "unexpected" state.
 */
export const setEventBudget: SetEventBudget = () =>
  Promise.resolve({ status: "unexpected" });
