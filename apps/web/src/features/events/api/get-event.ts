import type { GetEvent } from "../lib/events-outcome";
import { fixtureEvent } from "./fixtures";

/**
 * Placeholder for `GET /api/v1/events/:id`. EVT-05 (EVE-85) replaces the body
 * with a real `@event-platform/api-client` call. Until then it resolves the
 * matching fixture, or `null` when there is none.
 */
export const getEvent: GetEvent = (id) => Promise.resolve(fixtureEvent(id));
