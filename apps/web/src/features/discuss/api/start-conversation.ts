import type { StartConversation } from "../lib/discuss-outcome";

/**
 * Placeholder for `POST /api/v1/conversations`. DSC-05 (EVE-109) replaces the
 * body with a real `@event-platform/api-client` call, TanStack Query wiring,
 * and Problem Details mapping. Until then it resolves to the "unexpected"
 * state so the screen is never mistaken for a working create.
 */
export const startConversation: StartConversation = () =>
  Promise.resolve({ status: "unexpected" });
