import type { CreateWorkspace } from "../lib/workspaces-outcome";

/**
 * Placeholder for `POST /api/v1/workspaces`. WSP-05 (EVE-73) replaces the body
 * with a real `@event-platform/api-client` call, TanStack Query wiring, and
 * Problem Details mapping. Until then it resolves to the "unexpected" state so
 * the surface is never mistaken for a working create.
 */
export const createWorkspace: CreateWorkspace = () =>
  Promise.resolve({ status: "unexpected" });
