import type { CreateCampaignActivity } from "../lib/campaigns-outcome";

/**
 * Placeholder for `POST /api/v1/campaigns/:id/activities`. CAM-05 replaces the body with a real
 * `@event-platform/api-client` call, TanStack Query wiring, and Problem Details
 * mapping. Until then it resolves to the "unexpected" state so the surface is
 * never mistaken for a working mutation.
 */
export const createCampaignActivity: CreateCampaignActivity = () =>
  Promise.resolve({ status: "unexpected" });
