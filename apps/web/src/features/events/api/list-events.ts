import type { PaginatedEvents } from "../lib/events-types";
import { FIXTURE_PAGE } from "./fixtures";

export interface ListEventsQuery {
  page?: number;
}

export type ListEvents = (query: ListEventsQuery) => Promise<PaginatedEvents>;

/**
 * Placeholder for `GET /api/v1/events`. EVT-05 (EVE-85) replaces the body with
 * a real `@event-platform/api-client` call, server-driven filters, and
 * TanStack Query wiring. Until then it returns a fixed fixture page so the
 * surface and its client-side filters can be built and tested.
 */
export const listEvents: ListEvents = () => Promise.resolve(FIXTURE_PAGE);
