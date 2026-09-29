import { ConflictException, NotFoundException } from "@nestjs/common";

export const MARKETING_ERROR = {
  campaignNotFound: "MARKETING_CAMPAIGN_NOT_FOUND",
  strategyNotFound: "MARKETING_STRATEGY_NOT_FOUND",
  strategyConflict: "MARKETING_STRATEGY_CONFLICT",
} as const;

export const marketingCampaignNotFound = () =>
  new NotFoundException({
    code: MARKETING_ERROR.campaignNotFound,
    detail: "Marketing campaign not found.",
  });

export const marketingStrategyNotFound = () =>
  new NotFoundException({
    code: MARKETING_ERROR.strategyNotFound,
    detail: "Marketing strategy not found for this campaign.",
  });

export const marketingStrategyConflict = () =>
  new ConflictException({
    code: MARKETING_ERROR.strategyConflict,
    detail: "A strategy already exists for this marketing campaign.",
  });
