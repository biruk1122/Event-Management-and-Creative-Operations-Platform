import type { DeleteProject } from "../lib/projects-outcome";

/**
 * Placeholder for `DELETE /api/v1/projects/:id`. PRJ-05 replaces the body
 * with a real `@event-platform/api-client` call and Problem Details
 * mapping. Until then it resolves to the "unexpected" state so the surface
 * is never mistaken for a working delete.
 */
export const deleteProject: DeleteProject = () =>
  Promise.resolve({ status: "unexpected" });
