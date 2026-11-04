import { Injectable } from "@nestjs/common";

import {
  Prisma,
  type CampaignActivityStatus,
  type PromotionChannel,
} from "../../generated/prisma/client.js";
import type { ArchiveHook } from "../../common/archive/archive-hook.js";
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
    where: { status: "ASSIGNED" as const },
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
      activity: { archivedAt: null, ...(status ? { status } : {}) },
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
      where: {
        campaignId,
        campaignActivityId: activityId,
        activity: { archivedAt: null },
      },
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
      where: {
        campaignId,
        campaignActivityId: activityId,
        activity: { archivedAt: null },
      },
      data: { channel },
    });
    return result.count === 0 ? null : this.find(campaignId, activityId);
  }

  /**
   * Removes the promotion extension. An activity with talent assignment history
   * is archived instead, so its assignments and work-item name snapshots stay.
   */
  async remove(
    campaignId: string,
    activityId: string,
    archive: ArchiveHook,
  ): Promise<"deleted" | "archived" | "not_found"> {
    return this.db.$transaction(async (tx) => {
      if (
        (await tx.promotionActivityTalent.count({
          where: { campaignActivityId: activityId },
        })) > 0
      ) {
        const activity = await tx.campaignActivity.findFirst({
          where: { id: activityId, campaignId, archivedAt: null },
          select: {
            name: true,
            campaign: {
              select: { workspace: { select: { managerId: true } } },
            },
          },
        });
        if (!activity) return "not_found";
        await tx.campaignActivity.update({
          where: { id: activityId },
          data: { archivedAt: new Date() },
        });
        await archive(tx, {
          label: activity.name,
          workspaceManagerId: activity.campaign.workspace.managerId,
          works: [
            { kind: "PROMOTION", workId: activityId, workName: activity.name },
          ],
        });
        return "archived";
      }
      const result = await tx.promotionActivity.deleteMany({
        where: { campaignId, campaignActivityId: activityId },
      });
      return result.count > 0 ? "deleted" : "not_found";
    });
  }
}
