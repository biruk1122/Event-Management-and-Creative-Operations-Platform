import type { GetProject } from "../lib/projects-outcome";
import { fixtureProject } from "./fixtures";

/**
 * Placeholder for `GET /api/v1/projects/:id`. PRJ-05 replaces the body with a
 * real `@event-platform/api-client` call. Until then it resolves the
 * matching fixture, or `null` when there is none.
 */
export const getProject: GetProject = (id) =>
  Promise.resolve(fixtureProject(id));
