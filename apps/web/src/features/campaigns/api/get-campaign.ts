import type { GetCampaign } from "../lib/campaigns-outcome";
import { fixtureCampaign } from "./fixtures";

/**
 * Placeholder for `GET /api/v1/campaigns/:id`. CAM-05 replaces the body with a
 * real `@event-platform/api-client` call. Until then it resolves the fixture
 * campaign, or `null` for an unknown id.
 */
export const getCampaign: GetCampaign = (id) =>
  Promise.resolve(fixtureCampaign(id));
