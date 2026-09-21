import type { ListCampaignActivities } from "../lib/campaigns-outcome";
import { fixtureActivities } from "./fixtures";

/**
 * Placeholder for `GET /api/v1/campaigns/:id/activities`. CAM-05 replaces the
 * body with a real `@event-platform/api-client` call that pages through every
 * activity. Until then it resolves the fixture activities.
 */
export const listCampaignActivities: ListCampaignActivities = (campaignId) =>
  Promise.resolve(fixtureActivities(campaignId));
