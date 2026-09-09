import type { GetWorkspace } from "../lib/workspaces-outcome";
import { fixtureWorkspace } from "./fixtures";

/**
 * Placeholder for `GET /api/v1/workspaces/:id`. WSP-05 (EVE-73) replaces the
 * body with a real `@event-platform/api-client` call. Until then it resolves
 * the matching fixture, or `null` when there is none.
 */
export const getWorkspace: GetWorkspace = (id) =>
  Promise.resolve(fixtureWorkspace(id));
