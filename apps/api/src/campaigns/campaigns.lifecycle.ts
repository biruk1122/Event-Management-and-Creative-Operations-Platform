import { CampaignStatus } from "../generated/prisma/client.js";

/**
 * The approved campaign lifecycle graph, shared by marketing and promotion
 * campaigns (product vocabulary "Promotion campaign" / "Marketing campaign"):
 *
 *   Planned   -> Active | Cancelled
 *   Active    -> Completed | Cancelled
 *   Completed -> (terminal)
 *   Cancelled -> (terminal)
 *
 * This module enforces the shape of the graph only. Entry criteria, who may
 * make each move, and whether a terminal campaign can be reopened are open in
 * OD-03 and are not decided here; every move is gated by the single
 * `campaign.transition_status` permission.
 */
const ALLOWED_TRANSITIONS: Record<CampaignStatus, readonly CampaignStatus[]> = {
  [CampaignStatus.PLANNED]: [CampaignStatus.ACTIVE, CampaignStatus.CANCELLED],
  [CampaignStatus.ACTIVE]: [CampaignStatus.COMPLETED, CampaignStatus.CANCELLED],
  [CampaignStatus.COMPLETED]: [],
  [CampaignStatus.CANCELLED]: [],
};

export function canTransition(
  from: CampaignStatus,
  to: CampaignStatus,
): boolean {
  return ALLOWED_TRANSITIONS[from].includes(to);
}
