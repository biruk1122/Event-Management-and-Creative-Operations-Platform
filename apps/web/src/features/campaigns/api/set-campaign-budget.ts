import type { SetCampaignBudget } from "../lib/campaigns-outcome";

/**
 * Placeholder for `PUT /api/v1/campaigns/:id/budget`. CAM-05 replaces the body with a real
 * `@event-platform/api-client` call, TanStack Query wiring, and Problem Details
 * mapping. Until then it resolves to the "unexpected" state so the surface is
 * never mistaken for a working mutation.
 */
export const setCampaignBudget: SetCampaignBudget = () =>
  Promise.resolve({ status: "unexpected" });
