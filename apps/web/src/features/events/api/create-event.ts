import type { CreateEvent } from "../lib/events-outcome";

/**
 * Placeholder for `POST /api/v1/events`. EVT-05 (EVE-85) replaces the body with
 * a real `@event-platform/api-client` call, TanStack Query wiring, and Problem
 * Details mapping. Until then it resolves to the "unexpected" state so the
 * surface is never mistaken for a working create.
 */
export const createEvent: CreateEvent = () =>
  Promise.resolve({ status: "unexpected" });
