import { Injectable } from "@nestjs/common";

import { Prisma } from "../generated/prisma/client.js";
import { CampaignsService } from "../campaigns/campaigns.service.js";
import { PermissionsService } from "../common/security/permissions.service.js";
import { permissionDenied } from "../common/security/security.errors.js";
import type { ListCampaignActivitiesQueryDto } from "../campaigns/dto/list-campaign-activities-query.dto.js";
import type {
  AttachPromotionActivityDto,
  AssignPromotionTalentDto,
  UpdatePromotionChannelDto,
} from "./promotion.dto.js";
import type {
  PaginatedPromotionActivitiesResponse,
  PromotionActivityResponse,
} from "./promotion.contracts.js";
import {
  promotionActivityNotFound,
  promotionAssignmentConflict,
  promotionAssignmentNotFound,
  promotionCampaignNotFound,
  promotionDetailConflict,
  promotionDuplicateTalent,
  promotionTalentNotFound,
} from "./promotion.errors.js";
import {
  isUuid,
  PromotionRepository,
  type PromotionRecord,
} from "./infrastructure/promotion.repository.js";

const prismaError = (error: unknown, code: string) =>
  error instanceof Prisma.PrismaClientKnownRequestError && error.code === code;

function response(record: PromotionRecord): PromotionActivityResponse {
  const activity = record.activity;
  return {
    activity: {
      id: activity.id,
      campaignId: activity.campaignId,
      name: activity.name,
      description: activity.description,
      status: activity.status,
      startAt: activity.startAt?.toISOString() ?? null,
      endAt: activity.endAt?.toISOString() ?? null,
      createdAt: activity.createdAt.toISOString(),
      updatedAt: activity.updatedAt.toISOString(),
    },
    channel: record.channel,
    talents: record.talents.map((talent) => ({
      id: talent.id,
      talentId: talent.talentId,
      role: talent.role,
      createdAt: talent.createdAt.toISOString(),
    })),
  };
}

/** Promotion owns its details and assignments; shared activity/ownership queries
 * go through CampaignsService's exported application interface. */
@Injectable()
export class PromotionService {
  constructor(
    private readonly campaigns: CampaignsService,
    private readonly permissions: PermissionsService,
    private readonly repository: PromotionRepository,
  ) {}

  private async campaign(userId: string, campaignId: string) {
    const campaign = await this.campaigns.get(userId, campaignId);
    if (campaign.campaignType !== "PROMOTION")
      throw promotionCampaignNotFound();
  }

  private async activity(
    userId: string,
    campaignId: string,
    activityId: string,
  ) {
    await this.campaign(userId, campaignId);
    await this.campaigns.getActivity(userId, campaignId, activityId);
  }

  private async grant(userId: string, key: string) {
    if (!(await this.permissions.hasGrant(userId, key, "ORGANIZATION")))
      throw permissionDenied();
  }

  private async load(campaignId: string, activityId: string) {
    const record = await this.repository.find(campaignId, activityId);
    if (!record) throw promotionActivityNotFound();
    return record;
  }

  async list(
    userId: string,
    campaignId: string,
    query: ListCampaignActivitiesQueryDto,
  ): Promise<PaginatedPromotionActivitiesResponse> {
    await this.campaign(userId, campaignId);
    const result = await this.repository.list(
      campaignId,
      query.status,
      query.page,
      query.pageSize,
    );
    return {
      items: result.items.map(response),
      total: result.total,
      page: query.page,
      pageSize: query.pageSize,
    };
  }

  async get(
    userId: string,
    campaignId: string,
    activityId: string,
  ): Promise<PromotionActivityResponse> {
    await this.activity(userId, campaignId, activityId);
    return response(await this.load(campaignId, activityId));
  }

  async attach(
    userId: string,
    campaignId: string,
    activityId: string,
    dto: AttachPromotionActivityDto,
  ): Promise<PromotionActivityResponse> {
    await this.activity(userId, campaignId, activityId);
    await this.grant(userId, "campaign.activity.manage");
    const talents = (dto.talents ?? []).map((talent) => ({
      talentId: talent.talentId,
      role: talent.role.trim(),
    }));
    if (
      new Set(talents.map((talent) => talent.talentId)).size !== talents.length
    )
      throw promotionDuplicateTalent();
    if (talents.length) await this.grant(userId, "talent.assign");
    try {
      const record = await this.repository.attach(
        campaignId,
        activityId,
        dto.channel,
        talents,
      );
      if (!record) throw promotionActivityNotFound();
      return response(record);
    } catch (error) {
      if (prismaError(error, "P2002")) throw promotionDetailConflict();
      if (prismaError(error, "P2003"))
        throw talents.length
          ? promotionTalentNotFound()
          : promotionActivityNotFound();
      throw error;
    }
  }

  async updateChannel(
    userId: string,
    campaignId: string,
    activityId: string,
    dto: UpdatePromotionChannelDto,
  ): Promise<PromotionActivityResponse> {
    await this.activity(userId, campaignId, activityId);
    await this.grant(userId, "campaign.activity.manage");
    const record = await this.repository.updateChannel(
      campaignId,
      activityId,
      dto.channel,
    );
    if (!record) throw promotionActivityNotFound();
    return response(record);
  }

  async remove(userId: string, campaignId: string, activityId: string) {
    await this.activity(userId, campaignId, activityId);
    await this.grant(userId, "campaign.activity.manage");
    if (!(await this.repository.remove(campaignId, activityId)))
      throw promotionActivityNotFound();
  }

  async assignTalent(
    userId: string,
    campaignId: string,
    activityId: string,
    dto: AssignPromotionTalentDto,
  ): Promise<PromotionActivityResponse> {
    await this.activity(userId, campaignId, activityId);
    await this.grant(userId, "campaign.activity.manage");
    await this.grant(userId, "talent.assign");
    await this.load(campaignId, activityId);
    try {
      await this.repository.assign(activityId, dto.talentId, dto.role.trim());
    } catch (error) {
      if (prismaError(error, "P2002")) throw promotionAssignmentConflict();
      if (prismaError(error, "P2003")) throw promotionTalentNotFound();
      throw error;
    }
    return response(await this.load(campaignId, activityId));
  }

  async unassignTalent(
    userId: string,
    campaignId: string,
    activityId: string,
    talentId: string,
  ): Promise<PromotionActivityResponse> {
    await this.activity(userId, campaignId, activityId);
    await this.grant(userId, "campaign.activity.manage");
    await this.grant(userId, "talent.assign");
    await this.load(campaignId, activityId);
    if (!isUuid(talentId)) throw promotionAssignmentNotFound();
    if (!(await this.repository.unassign(activityId, talentId)))
      throw promotionAssignmentNotFound();
    return response(await this.load(campaignId, activityId));
  }
}
