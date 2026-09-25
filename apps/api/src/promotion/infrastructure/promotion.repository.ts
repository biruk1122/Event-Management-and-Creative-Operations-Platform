import { Injectable } from "@nestjs/common";

import {
  Prisma,
  type CampaignActivityStatus,
  type PromotionChannel,
} from "../../generated/prisma/client.js";
import { DatabaseService } from "../../database/database.service.js";

const SELECT = {
  campaignActivityId: true,
  campaignId: true,
  channel: true,
  activity: {
    select: {
      id: true,
      campaignId: true,
      name: true,
      description: true,
      status: true,
      startAt: true,
      endAt: true,
      createdAt: true,
      updatedAt: true,
    },
  },
  talents: {
    select: { id: true, talentId: true, role: true, createdAt: true },
    orderBy: { id: "asc" },
  },
} as const;

export type PromotionRecord = Prisma.PromotionActivityGetPayload<{
  select: typeof SELECT;
}>;

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export const isUuid = (value: string) => UUID.test(value);

@Injectable()
export class PromotionRepository {
  constructor(private readonly db: DatabaseService) {}

  async list(
    campaignId: string,
    status: CampaignActivityStatus | undefined,
    page: number,
    pageSize: number,
  ) {
    const where: Prisma.PromotionActivityWhereInput = {
      campaignId,
      ...(status ? { activity: { status } } : {}),
    };
    const [items, total] = await Promise.all([
      this.db.promotionActivity.findMany({
        where,
        select: SELECT,
        orderBy: [
          { activity: { createdAt: "asc" } },
          { campaignActivityId: "asc" },
        ],
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
      this.db.promotionActivity.count({ where }),
    ]);
    return { items, total };
  }

  async find(
    campaignId: string,
    activityId: string,
  ): Promise<PromotionRecord | null> {
    if (!isUuid(campaignId) || !isUuid(activityId)) return null;
    return this.db.promotionActivity.findFirst({
      where: { campaignId, campaignActivityId: activityId },
      select: SELECT,
    });
  }

  /** Both extension and initial assignments commit or roll back together. */
  async attach(
    campaignId: string,
    activityId: string,
    channel: PromotionChannel,
    talents: { talentId: string; role: string }[],
  ) {
    await this.db.$transaction(async (tx) => {
      await tx.promotionActivity.create({
        data: { campaignActivityId: activityId, campaignId, channel },
      });
      if (talents.length) {
        await tx.promotionActivityTalent.createMany({
          data: talents.map((talent) => ({
            campaignActivityId: activityId,
            ...talent,
          })),
        });
      }
    });
    return this.find(campaignId, activityId);
  }

  async updateChannel(
    campaignId: string,
    activityId: string,
    channel: PromotionChannel,
  ) {
    const result = await this.db.promotionActivity.updateMany({
      where: { campaignId, campaignActivityId: activityId },
      data: { channel },
    });
    return result.count === 0 ? null : this.find(campaignId, activityId);
  }

  async remove(campaignId: string, activityId: string) {
    const result = await this.db.promotionActivity.deleteMany({
      where: { campaignId, campaignActivityId: activityId },
    });
    return result.count > 0;
  }

  async assign(activityId: string, talentId: string, role: string) {
    await this.db.promotionActivityTalent.create({
      data: { campaignActivityId: activityId, talentId, role },
    });
  }

  async unassign(activityId: string, talentId: string) {
    const result = await this.db.promotionActivityTalent.deleteMany({
      where: { campaignActivityId: activityId, talentId },
    });
    return result.count > 0;
  }
}
