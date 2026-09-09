import type { DeleteEvent } from "../lib/events-outcome";

/**
 * Placeholder for `DELETE /api/v1/events/:id`. EVT-05 (EVE-85) replaces the
 * body with a real `@event-platform/api-client` call and Problem Details
 * mapping. Until then it resolves to the "unexpected" state so the surface is
 * never mistaken for a working delete.
 */
export const deleteEvent: DeleteEvent = () =>
  Promise.resolve({ status: "unexpected" });
