import { Injectable } from "@nestjs/common";

import {
  Prisma,
  type CampaignActivityStatus,
  type PromotionChannel,
} from "../../generated/prisma/client.js";
import type { ArchiveHook } from "../../common/archive/archive-hook.js";
import { DatabaseService } from "../../database/database.service.js";
import type { CampaignVisibility } from "../../campaigns/infrastructure/campaigns.repository.js";
import type { ListPromotionActivitiesQueryDto } from "../promotion.dto.js";

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
  location: true,
  requiredResources: true,
  assignees: {
    select: {
      user: {
        select: { id: true, email: true, firstName: true, lastName: true },
      },
    },
    orderBy: { userId: "asc" as const },
  },
} as const;

const LIST_SELECT = {
  ...SELECT,
  campaign: { select: { name: true } },
} as const;

export type PromotionRecord = Prisma.PromotionActivityGetPayload<{
  select: typeof SELECT;
}>;

/** Campaign visibility, as a filter (EVE-231). Matches the campaigns list rules. */
function visibleCampaignWhere(
  visibility: CampaignVisibility,
): Prisma.CampaignWhereInput {
  if (visibility.organization) return {};
  const departmentIds = [
    ...(visibility.departmentId ? [visibility.departmentId] : []),
    ...(visibility.overseenDepartmentIds ?? []),
  ];
  return departmentIds.length > 0
    ? { departmentId: { in: departmentIds } }
    : { id: { in: [] } };
}

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

  /** Location and required resources of an activity (EVE-231). */
  async updateDetails(
    campaignId: string,
    activityId: string,
    fields: { location?: string | null; requiredResources?: string | null },
  ) {
    const result = await this.db.promotionActivity.updateMany({
      where: {
        campaignId,
        campaignActivityId: activityId,
        archivedAt: null,
        activity: { archivedAt: null },
      },
      data: {
        ...(fields.location !== undefined ? { location: fields.location } : {}),
        ...(fields.requiredResources !== undefined
          ? { requiredResources: fields.requiredResources }
          : {}),
      },
    });
    return result.count === 0 ? null : this.find(campaignId, activityId);
  }

  /** Whether a user is an employee the assignment rule can judge (EVE-231). */
  async findEmployee(userId: string) {
    if (!isUuid(userId)) return null;
    return this.db.user.findUnique({
      where: { id: userId },
      select: {
        departmentId: true,
        status: true,
        department: { select: { deactivatedAt: true } },
      },
    });
  }

  /**
   * Active employees of one department (EVE-231). Only accounts the assignment
   * trigger would accept: active, in the department, and the department active.
   */
  async listActiveEmployees(
    departmentId: string,
    query: { search?: string | undefined; page: number; pageSize: number },
  ) {
    const search = query.search?.trim();
    const where: Prisma.UserWhereInput = {
      departmentId,
      status: "ACTIVE",
      department: { is: { deactivatedAt: null } },
      ...(search
        ? {
            OR: [
              { email: { contains: search, mode: "insensitive" } },
              { firstName: { contains: search, mode: "insensitive" } },
              { lastName: { contains: search, mode: "insensitive" } },
            ],
          }
        : {}),
    };
    const [items, total] = await Promise.all([
      this.db.user.findMany({
        where,
        select: { id: true, email: true, firstName: true, lastName: true },
        orderBy: [{ firstName: "asc" }, { email: "asc" }, { id: "asc" }],
        skip: (query.page - 1) * query.pageSize,
        take: query.pageSize,
      }),
      this.db.user.count({ where }),
    ]);
    return { items, total };
  }

  /** Assigns an employee to an activity. The database trigger re-checks the department. */
  async assignEmployee(
    campaignId: string,
    activityId: string,
    userId: string,
    assignedById: string,
  ) {
    await this.db.promotionActivityAssignee.create({
      data: { campaignActivityId: activityId, userId, assignedById },
    });
    return this.find(campaignId, activityId);
  }

  async unassignEmployee(
    campaignId: string,
    activityId: string,
    userId: string,
  ): Promise<boolean> {
    const result = await this.db.promotionActivityAssignee.deleteMany({
      where: {
        campaignActivityId: activityId,
        userId,
        promotionActivity: { campaignId },
      },
    });
    return result.count > 0;
  }

  /**
   * Every promotion activity the caller can read, across promotion campaigns
   * (EVE-231). Visibility comes from the campaigns service, so this list follows
   * the same department and oversight rules as a campaign's own list.
   */
  async listAll(
    visibility: CampaignVisibility,
    query: ListPromotionActivitiesQueryDto,
  ) {
    const where: Prisma.PromotionActivityWhereInput = {
      archivedAt: null,
      campaign: {
        AND: [
          visibleCampaignWhere(visibility),
          ...(query.campaignId ? [{ id: query.campaignId }] : []),
        ],
      },
      ...(query.channel ? { channel: query.channel } : {}),
      activity: {
        archivedAt: null,
        ...(query.status ? { status: query.status } : {}),
        ...(query.search?.trim()
          ? { name: { contains: query.search.trim(), mode: "insensitive" } }
          : {}),
        ...(query.from || query.to
          ? {
              startAt: {
                ...(query.from ? { gte: new Date(query.from) } : {}),
                ...(query.to ? { lte: new Date(query.to) } : {}),
              },
            }
          : {}),
      },
    };
    const orderBy: Prisma.PromotionActivityOrderByWithRelationInput[] =
      query.sort === "NAME"
        ? [{ activity: { name: "asc" } }, { campaignActivityId: "asc" }]
        : [{ activity: { startAt: "asc" } }, { campaignActivityId: "asc" }];
    const [items, total] = await Promise.all([
      this.db.promotionActivity.findMany({
        where,
        select: LIST_SELECT,
        orderBy,
        skip: (query.page - 1) * query.pageSize,
        take: query.pageSize,
      }),
      this.db.promotionActivity.count({ where }),
    ]);
    return { items, total };
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
