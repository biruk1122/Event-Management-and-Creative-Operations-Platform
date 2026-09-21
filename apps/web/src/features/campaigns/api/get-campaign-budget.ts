import type { GetCampaignBudget } from "../lib/campaigns-outcome";
import { fixtureBudget } from "./fixtures";

/**
 * Placeholder for `GET /api/v1/campaigns/:id/budget`. CAM-05 replaces the body
 * with a real `@event-platform/api-client` call and maps a 403 (no
 * `campaign.budget.read` grant) to `null` so the section can show a restricted
 * state. Until then it resolves the fixture budget, or an empty one.
 */
export const getCampaignBudget: GetCampaignBudget = (id) =>
  Promise.resolve(fixtureBudget(id));
