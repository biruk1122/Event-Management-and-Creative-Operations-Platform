import type { GetEventBudget } from "../lib/events-outcome";
import { fixtureBudget } from "./fixtures";

/**
 * Placeholder for `GET /api/v1/events/:id/budget`. EVT-05 (EVE-85) replaces the
 * body with a real `@event-platform/api-client` call and maps a 403 (no
 * `event.budget.read` grant) to `null` so the section can show a restricted
 * state. Until then it resolves the fixture budget, or an empty one.
 */
export const getEventBudget: GetEventBudget = (id) =>
  Promise.resolve(fixtureBudget(id));
