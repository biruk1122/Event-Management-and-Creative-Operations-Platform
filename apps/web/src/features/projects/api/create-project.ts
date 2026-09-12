import type { CreateProject } from "../lib/projects-outcome";

/**
 * Placeholder for `POST /api/v1/projects`. PRJ-05 replaces the body with a
 * real `@event-platform/api-client` call, TanStack Query wiring, and Problem
 * Details mapping. Until then it resolves to the "unexpected" state so the
 * surface is never mistaken for a working create.
 */
export const createProject: CreateProject = () =>
  Promise.resolve({ status: "unexpected" });
