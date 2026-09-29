import { Injectable } from "@nestjs/common";

import { CampaignsService } from "../campaigns/campaigns.service.js";
import { PermissionsService } from "../common/security/permissions.service.js";
import { permissionDenied } from "../common/security/security.errors.js";
import { Prisma, type MarketingCampaign } from "../generated/prisma/client.js";
import { MarketingRepository } from "./infrastructure/marketing.repository.js";
import type { MarketingStrategyResponse } from "./marketing.contracts.js";
import {
  marketingCampaignNotFound,
  marketingStrategyConflict,
  marketingStrategyNotFound,
} from "./marketing.errors.js";

function response(record: MarketingCampaign): MarketingStrategyResponse {
  return {
    campaignId: record.campaignId,
    strategy: record.strategy,
    createdAt: record.createdAt.toISOString(),
    updatedAt: record.updatedAt.toISOString(),
  };
}

/**
 * Strategy is content of a shared marketing campaign, not a second campaign.
 * Shared campaign queries, progress, state transitions, teams, activities and
 * budgets remain on CampaignsService's exported application interface.
 */
@Injectable()
export class MarketingService {
  constructor(
    private readonly campaigns: CampaignsService,
    private readonly permissions: PermissionsService,
    private readonly repository: MarketingRepository,
  ) {}

  private async campaign(userId: string, campaignId: string): Promise<void> {
    const campaign = await this.campaigns.get(userId, campaignId);
    if (campaign.campaignType !== "MARKETING") {
      throw marketingCampaignNotFound();
    }
  }

  private async requireUpdate(userId: string): Promise<void> {
    if (
      !(await this.permissions.hasGrant(
        userId,
        "campaign.update",
        "ORGANIZATION",
      ))
    ) {
      throw permissionDenied();
    }
  }

  async get(
    userId: string,
    campaignId: string,
  ): Promise<MarketingStrategyResponse> {
    await this.campaign(userId, campaignId);
    const record = await this.repository.find(campaignId);
    if (!record) throw marketingStrategyNotFound();
    return response(record);
  }

  async create(
    userId: string,
    campaignId: string,
    strategy: string,
  ): Promise<MarketingStrategyResponse> {
    await this.campaign(userId, campaignId);
    await this.requireUpdate(userId);
    try {
      return response(
        await this.repository.create(campaignId, strategy.trim()),
      );
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError) {
        if (error.code === "P2002") throw marketingStrategyConflict();
        if (error.code === "P2003") throw marketingCampaignNotFound();
      }
      throw error;
    }
  }

  async update(
    userId: string,
    campaignId: string,
    strategy: string,
  ): Promise<MarketingStrategyResponse> {
    await this.campaign(userId, campaignId);
    await this.requireUpdate(userId);
    const record = await this.repository.update(campaignId, strategy.trim());
    if (!record) throw marketingStrategyNotFound();
    return response(record);
  }

  async remove(userId: string, campaignId: string): Promise<void> {
    await this.campaign(userId, campaignId);
    await this.requireUpdate(userId);
    if (!(await this.repository.remove(campaignId))) {
      throw marketingStrategyNotFound();
    }
  }
}
