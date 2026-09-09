import type { DeleteWorkspace } from "../lib/workspaces-outcome";

/**
 * Placeholder for `DELETE /api/v1/workspaces/:id`. WSP-05 (EVE-73) replaces the
 * body with a real `@event-platform/api-client` call and Problem Details
 * mapping. Until then it resolves to the "unexpected" state so the surface is
 * never mistaken for a working delete.
 */
export const deleteWorkspace: DeleteWorkspace = () =>
  Promise.resolve({ status: "unexpected" });
