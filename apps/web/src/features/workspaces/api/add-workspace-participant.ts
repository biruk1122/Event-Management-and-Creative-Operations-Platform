import type { AddWorkspaceParticipant } from "../lib/workspaces-outcome";

/**
 * Placeholder for `PUT /api/v1/workspaces/:id/participants/:userId`. WSP-05
 * (EVE-73) replaces the body with a real `@event-platform/api-client` call and
 * Problem Details mapping. Until then it resolves to the "unexpected" state.
 */
export const addWorkspaceParticipant: AddWorkspaceParticipant = () =>
  Promise.resolve({ status: "unexpected" });
