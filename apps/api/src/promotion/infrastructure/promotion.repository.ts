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
      archivedAt: null,
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
        archivedAt: null,
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
      // A detail archived for its talent history comes back with that history.
      const restored = await tx.promotionActivity.updateMany({
        where: {
          campaignId,
          campaignActivityId: activityId,
          archivedAt: { not: null },
        },
        data: { channel, archivedAt: null },
      });
      if (restored.count === 0) {
        await tx.promotionActivity.create({
          data: { campaignActivityId: activityId, campaignId, channel },
        });
      }
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
        archivedAt: null,
        activity: { archivedAt: null },
      },
      data: { channel },
    });
    return result.count === 0 ? null : this.find(campaignId, activityId);
  }

  /**
   * Removes the promotion extension. A detail with talent assignment history is
   * archived instead, so its assignments and work-item name snapshots stay. The
   * shared campaign activity is left active either way.
   */
  async remove(
    campaignId: string,
    activityId: string,
    archive: ArchiveHook,
  ): Promise<"deleted" | "archived" | "not_found"> {
    return this.db.$transaction(async (tx) => {
      const detail = await tx.promotionActivity.findFirst({
        where: {
          campaignId,
          campaignActivityId: activityId,
          archivedAt: null,
          activity: { archivedAt: null },
        },
        select: {
          activity: { select: { name: true } },
          campaign: { select: { workspace: { select: { managerId: true } } } },
        },
      });
      if (!detail) return "not_found";
      const history = await tx.promotionActivityTalent.count({
        where: { campaignActivityId: activityId },
      });
      if (history === 0) {
        await tx.promotionActivity.deleteMany({
          where: { campaignId, campaignActivityId: activityId },
        });
        return "deleted";
      }
      await tx.promotionActivity.updateMany({
        where: { campaignId, campaignActivityId: activityId },
        data: { archivedAt: new Date() },
      });
      await archive(tx, {
        label: detail.activity.name,
        workspaceManagerId: detail.campaign.workspace.managerId,
        works: [
          {
            kind: "PROMOTION",
            workId: activityId,
            workName: detail.activity.name,
          },
        ],
      });
      return "archived";
    });
  }
}
