import type { RemoveWorkspaceParticipant } from "../lib/workspaces-outcome";

/**
 * Placeholder for `DELETE /api/v1/workspaces/:id/participants/:userId`. WSP-05
 * (EVE-73) replaces the body with a real `@event-platform/api-client` call and
 * Problem Details mapping. Until then it resolves to the "unexpected" state.
 */
export const removeWorkspaceParticipant: RemoveWorkspaceParticipant = () =>
  Promise.resolve({ status: "unexpected" });
