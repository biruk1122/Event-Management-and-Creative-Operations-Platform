import type { UpdateEvent } from "../lib/events-outcome";

/**
 * Placeholder for `PATCH /api/v1/events/:id`. EVT-05 (EVE-85) replaces the body
 * with a real `@event-platform/api-client` call and Problem Details mapping.
 * Until then it resolves to the "unexpected" state.
 */
export const updateEvent: UpdateEvent = () =>
  Promise.resolve({ status: "unexpected" });
