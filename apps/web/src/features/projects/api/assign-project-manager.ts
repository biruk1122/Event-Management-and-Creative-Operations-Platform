import type { AssignProjectManager } from "../lib/projects-outcome";

/**
 * Placeholder for `PUT /api/v1/projects/:id/manager`. PRJ-05 replaces the
 * body with a real `@event-platform/api-client` call and Problem Details
 * mapping. Until then it resolves to the "unexpected" state.
 */
export const assignProjectManager: AssignProjectManager = () =>
  Promise.resolve({ status: "unexpected" });
