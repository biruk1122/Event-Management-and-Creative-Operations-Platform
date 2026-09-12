import type { TransitionProject } from "../lib/projects-outcome";

/**
 * Placeholder for `POST /api/v1/projects/:id/transition`. PRJ-05 replaces
 * the body with a real `@event-platform/api-client` call and Problem Details
 * mapping. Until then it resolves to the "unexpected" state.
 */
export const transitionProject: TransitionProject = () =>
  Promise.resolve({ status: "unexpected" });
