import { CampaignStatus, CampaignType } from "../generated/prisma/client.js";

/**
 * The approved campaign lifecycle graphs.
 *
 * Marketing campaigns keep the original graph, unchanged by EVE-229:
 *
 *   Planned   -> Active | Cancelled
 *   Active    -> Completed | Cancelled
 *   Completed -> (terminal)
 *   Cancelled -> (terminal)
 *
 * Promotion campaigns (EVE-229) add an approval step and a pause:
 *
 *   Planned   -> Approved | Cancelled
 *   Approved  -> Active | Cancelled
 *   Active    -> Paused | Completed | Cancelled
 *   Paused    -> Active | Completed | Cancelled
 *   Completed -> (terminal)
 *   Cancelled -> (terminal)
 *
 * This module enforces the shape of each graph only. Who may make a move is
 * decided by `CampaignsService` (`campaign.transition_status`, plus the
 * approval rule in {@link isApprovalMove}). APPROVED and PAUSED never appear
 * on a marketing campaign; the `campaigns_promotion_only_statuses` CHECK backs
 * that up in the database.
 */
type Graph = Record<CampaignStatus, readonly CampaignStatus[]>;

const MARKETING_TRANSITIONS: Graph = {
  [CampaignStatus.PLANNED]: [CampaignStatus.ACTIVE, CampaignStatus.CANCELLED],
  [CampaignStatus.APPROVED]: [],
  [CampaignStatus.ACTIVE]: [CampaignStatus.COMPLETED, CampaignStatus.CANCELLED],
  [CampaignStatus.PAUSED]: [],
  [CampaignStatus.COMPLETED]: [],
  [CampaignStatus.CANCELLED]: [],
};

const PROMOTION_TRANSITIONS: Graph = {
  [CampaignStatus.PLANNED]: [CampaignStatus.APPROVED, CampaignStatus.CANCELLED],
  [CampaignStatus.APPROVED]: [CampaignStatus.ACTIVE, CampaignStatus.CANCELLED],
  [CampaignStatus.ACTIVE]: [
    CampaignStatus.PAUSED,
    CampaignStatus.COMPLETED,
    CampaignStatus.CANCELLED,
  ],
  [CampaignStatus.PAUSED]: [
    CampaignStatus.ACTIVE,
    CampaignStatus.COMPLETED,
    CampaignStatus.CANCELLED,
  ],
  [CampaignStatus.COMPLETED]: [],
  [CampaignStatus.CANCELLED]: [],
};

export function canTransition(
  campaignType: CampaignType,
  from: CampaignStatus,
  to: CampaignStatus,
): boolean {
  const graph =
    campaignType === CampaignType.PROMOTION
      ? PROMOTION_TRANSITIONS
      : MARKETING_TRANSITIONS;
  return graph[from].includes(to);
}

/** The approval move: only Super Admin or Admin may make it (EVE-229). */
export function isApprovalMove(
  campaignType: CampaignType,
  from: CampaignStatus,
  to: CampaignStatus,
): boolean {
  return (
    campaignType === CampaignType.PROMOTION &&
    from === CampaignStatus.PLANNED &&
    to === CampaignStatus.APPROVED
  );
}
