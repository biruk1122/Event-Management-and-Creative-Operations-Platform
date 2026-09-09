import type { TransitionEvent } from "../lib/events-outcome";

/**
 * Placeholder for `POST /api/v1/events/:id/transition`. EVT-05 (EVE-85)
 * replaces the body with a real `@event-platform/api-client` call and Problem
 * Details mapping. Until then it resolves to the "unexpected" state.
 */
export const transitionEvent: TransitionEvent = () =>
  Promise.resolve({ status: "unexpected" });
