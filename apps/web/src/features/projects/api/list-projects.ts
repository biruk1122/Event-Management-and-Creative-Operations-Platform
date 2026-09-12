import type { PaginatedProjects } from "../lib/projects-types";
import { FIXTURE_PAGE } from "./fixtures";

export interface ListProjectsQuery {
  page?: number;
}

export type ListProjects = (
  query: ListProjectsQuery,
) => Promise<PaginatedProjects>;

/**
 * Placeholder for `GET /api/v1/projects`. PRJ-05 replaces the body with a
 * real `@event-platform/api-client` call, server-driven filters, and
 * TanStack Query wiring. Until then it returns a fixed fixture page so the
 * surface and its client-side filters can be built and tested.
 */
export const listProjects: ListProjects = () => Promise.resolve(FIXTURE_PAGE);
