import type { PaginatedWorkspaces } from "../lib/workspaces-types";
import { FIXTURE_PAGE } from "./fixtures";

export interface ListWorkspacesQuery {
  page?: number;
}

export type ListWorkspaces = (
  query: ListWorkspacesQuery,
) => Promise<PaginatedWorkspaces>;

/**
 * Placeholder for `GET /api/v1/workspaces`. WSP-05 (EVE-73) replaces the body
 * with a real `@event-platform/api-client` call, per-kind fetches, and
 * TanStack Query wiring. Until then it returns a fixed fixture page so the
 * surface can be built and tested.
 */
export const listWorkspaces: ListWorkspaces = () =>
  Promise.resolve(FIXTURE_PAGE);
