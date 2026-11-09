import { ForbiddenException, HttpException, Injectable } from "@nestjs/common";

import { Prisma } from "../generated/prisma/client.js";
import { CampaignsService } from "../campaigns/campaigns.service.js";
import { PermissionsService } from "../common/security/permissions.service.js";
import { PROMOTION_DEPARTMENT } from "../common/security/department-access.policy.js";
import { PartnersService } from "../partners/partners.service.js";
import type { CampaignBudgetSummaryResponse } from "../campaigns/campaigns.contracts.js";
import { TalentAssignmentsService } from "../talent/talent-assignments.service.js";
import { permissionDenied } from "../common/security/security.errors.js";
import type { ListCampaignActivitiesQueryDto } from "../campaigns/dto/list-campaign-activities-query.dto.js";
import type {
  AttachPromotionActivityDto,
  AssignPromotionTalentDto,
  ListAssignableEmployeesQueryDto,
  ListPromotionActivitiesQueryDto,
  ListPromotionEventsQueryDto,
  UpdatePromotionChannelDto,
  UpdatePromotionDetailsDto,
} from "./promotion.dto.js";
import type {
  PaginatedPromotionActivitiesResponse,
  PaginatedAssignableEmployeesResponse,
  PaginatedPromotionActivityListResponse,
  PaginatedPromotionEventsResponse,
  PromotionActivityResponse,
  PromotionBudgetTotal,
  PromotionEventResponse,
  PromotionOverviewResponse,
} from "./promotion.contracts.js";
import {
  promotionActivityNotFound,
  promotionAssigneeConflict,
  promotionAssigneeInvalid,
  promotionAssigneeNotFound,
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
    location: record.location,
    requiredResources: record.requiredResources,
    assignees: record.assignees.map((assignee) => assignee.user),
    talents: record.talents.map((talent) => ({
      id: talent.id,
      talentId: talent.talentId,
      role: talent.role,
      createdAt: talent.createdAt.toISOString(),
    })),
  };
}

function eventResponse(event: {
  id: string;
  name: string;
  eventType: string;
  status: string;
  startAt: Date | null;
  endAt: Date | null;
  location: string | null;
  organizerName: string | null;
  department: { name: string } | null;
  campaigns: { id: string; name: string; status: string }[];
}): PromotionEventResponse {
  return {
    id: event.id,
    name: event.name,
    eventType: event.eventType,
    status: event.status,
    // The query only returns events with a start date.
    startAt: event.startAt!.toISOString(),
    endAt: event.endAt?.toISOString() ?? null,
    location: event.location,
    organizerName: event.organizerName,
    departmentName: event.department?.name ?? null,
    campaigns: event.campaigns,
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
    private readonly talentAssignments: TalentAssignmentsService,
    private readonly partners: PartnersService,
  ) {}

  // ---- EVE-234: event promotions and the overview --------------------------

  /** The Promotion workspace's summaries are for Promotion staff, the manager
   * who oversees Promotion (read-only), and organization-wide campaign
   * readers. Anyone else is refused, so the organization-wide event schedule
   * is not opened to every `campaign.read` holder. */
  private async requirePromotionReader(userId: string): Promise<void> {
    if (
      await this.permissions.hasGrant(userId, "campaign.read", "ORGANIZATION")
    )
      return;
    const context = await this.permissions.getAccessContext(userId);
    if (
      context.department?.active &&
      context.department.name === PROMOTION_DEPARTMENT
    )
      return;
    const overseen = await this.permissions.getOverseenDepartments(userId);
    if (overseen.some((department) => department.name === PROMOTION_DEPARTMENT))
      return;
    throw permissionDenied();
  }

  /** Upcoming events to promote: a read-only summary with the linked promotion
   * campaigns the caller can read. Event changes stay with the event's own
   * department through the events API. */
  async upcomingEvents(
    userId: string,
    query: ListPromotionEventsQueryDto,
  ): Promise<PaginatedPromotionEventsResponse> {
    await this.requirePromotionReader(userId);
    const visibility = await this.campaigns.readableCampaignFilter(userId);
    const result = await this.repository.upcomingEvents({
      visibility,
      from: query.from ? new Date(query.from) : new Date(),
      ...(query.to ? { to: new Date(query.to) } : {}),
      ...(query.search ? { search: query.search } : {}),
      page: query.page,
      pageSize: query.pageSize,
    });
    return {
      items: result.items.map(eventResponse),
      page: query.page,
      pageSize: query.pageSize,
      total: result.total,
    };
  }

  /** The Promotion overview: campaign counts, upcoming events, partnerships,
   * budget and recorded indicators. Nothing is estimated; a section the
   * caller cannot read (partners, budget) is `null`. */
  async overview(userId: string): Promise<PromotionOverviewResponse> {
    await this.requirePromotionReader(userId);
    const visibility = await this.campaigns.readableCampaignFilter(userId);
    const promotionDepartmentId =
      await this.repository.findActiveDepartmentIdByName(PROMOTION_DEPARTMENT);
    const [statusCounts, events, metrics, partnerships, budget] =
      await Promise.all([
        this.repository.campaignStatusCounts(visibility),
        this.repository.upcomingEvents({
          visibility,
          from: new Date(),
          page: 1,
          pageSize: 5,
        }),
        this.repository.latestMetrics(visibility),
        promotionDepartmentId
          ? this.partners.statusCountsForDepartment(
              userId,
              promotionDepartmentId,
            )
          : Promise.resolve([]),
        this.budgetTotals(userId),
      ]);
    const performance = new Map<
      string,
      { value: Prisma.Decimal; campaignCount: number }
    >();
    for (const metric of metrics) {
      const total = performance.get(metric.key) ?? {
        value: new Prisma.Decimal(0),
        campaignCount: 0,
      };
      performance.set(metric.key, {
        value: total.value.plus(metric.value),
        campaignCount: total.campaignCount + 1,
      });
    }
    return {
      totalCampaigns: statusCounts.reduce((sum, row) => sum + row.count, 0),
      campaignsByStatus: statusCounts,
      upcomingEventCount: events.total,
      nextEvents: events.items.map(eventResponse),
      partnershipsByStatus: partnerships,
      budget,
      performance: [...performance.entries()].map(([key, total]) => ({
        key,
        value: total.value.toFixed(2),
        campaignCount: total.campaignCount,
      })),
    };
  }

  /** Per-currency budget totals over every promotion campaign budget the
   * caller can read, from the same summaries the Budget section shows. */
  private async budgetTotals(
    userId: string,
  ): Promise<PromotionBudgetTotal[] | null> {
    const summaries: CampaignBudgetSummaryResponse[] = [];
    try {
      for (let page = 1; ; page += 1) {
        const result = await this.campaigns.listBudgetSummaries(userId, {
          campaignType: "PROMOTION",
          page,
          pageSize: 100,
        });
        summaries.push(...result.items);
        if (page * 100 >= result.total || result.items.length === 0) break;
      }
    } catch (error) {
      if (error instanceof ForbiddenException) return null;
      throw error;
    }
    const totals = new Map<
      string,
      {
        allocated: Prisma.Decimal;
        approved: Prisma.Decimal;
        pending: Prisma.Decimal;
        campaignCount: number;
        overBudgetCount: number;
      }
    >();
    for (const summary of summaries) {
      if (!summary.currency) continue;
      const total = totals.get(summary.currency) ?? {
        allocated: new Prisma.Decimal(0),
        approved: new Prisma.Decimal(0),
        pending: new Prisma.Decimal(0),
        campaignCount: 0,
        overBudgetCount: 0,
      };
      totals.set(summary.currency, {
        allocated: total.allocated.plus(summary.allocated ?? 0),
        approved: total.approved.plus(summary.approved),
        pending: total.pending.plus(summary.pending),
        campaignCount: total.campaignCount + 1,
        overBudgetCount: total.overBudgetCount + (summary.overBudget ? 1 : 0),
      });
    }
    return [...totals.entries()]
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([currency, total]) => ({
        currency,
        allocated: total.allocated.toFixed(2),
        approved: total.approved.toFixed(2),
        pending: total.pending.toFixed(2),
        campaignCount: total.campaignCount,
        overBudgetCount: total.overBudgetCount,
      }));
  }

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

  /** Talent assignment stays organization-only: no department role holds
   * `talent.assign`, so this is unchanged by EVE-229. */
  private async grant(userId: string, key: string) {
    if (!(await this.permissions.hasGrant(userId, key, "ORGANIZATION")))
      throw permissionDenied();
  }

  /** Managing a promotion activity is checked against the campaign's own
   * department (EVE-229), the same rule every campaign route applies: Super
   * Admin anywhere, a Department Manager only on their own department's
   * campaigns. Department oversight never reaches this write key. */
  private async manage(userId: string, campaignId: string) {
    await this.campaigns.assertCampaignPermission(
      userId,
      campaignId,
      "campaign.activity.manage",
    );
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
    await this.manage(userId, campaignId);
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
    await this.manage(userId, campaignId);
    const record = await this.repository.updateChannel(
      campaignId,
      activityId,
      dto.channel,
    );
    if (!record) throw promotionActivityNotFound();
    return response(record);
  }

  async remove(
    userId: string,
    campaignId: string,
    activityId: string,
    requestId: string,
  ) {
    await this.activity(userId, campaignId, activityId);
    await this.manage(userId, campaignId);
    const result = await this.repository.remove(
      campaignId,
      activityId,
      this.talentAssignments.archiveHook(userId, requestId),
    );
    if (result === "not_found") throw promotionActivityNotFound();
  }

  /** Location and required resources (EVE-231). Campaign department only. */
  async updateDetails(
    userId: string,
    campaignId: string,
    activityId: string,
    dto: UpdatePromotionDetailsDto,
  ): Promise<PromotionActivityResponse> {
    await this.activity(userId, campaignId, activityId);
    await this.manage(userId, campaignId);
    const record = await this.repository.updateDetails(campaignId, activityId, {
      ...(dto.location !== undefined
        ? { location: dto.location === null ? null : dto.location.trim() }
        : {}),
      ...(dto.requiredResources !== undefined
        ? {
            requiredResources:
              dto.requiredResources === null
                ? null
                : dto.requiredResources.trim(),
          }
        : {}),
    });
    if (!record) throw promotionActivityNotFound();
    return response(record);
  }

  /**
   * Assigns an employee of the campaign's department to the activity. The
   * service checks the rule first for a clear message; the database trigger
   * repeats it under a row lock, so a concurrent change is refused too.
   */
  async assignEmployee(
    userId: string,
    campaignId: string,
    activityId: string,
    employeeId: string,
  ): Promise<PromotionActivityResponse> {
    await this.activity(userId, campaignId, activityId);
    await this.manage(userId, campaignId);
    const campaign = await this.campaigns.get(userId, campaignId);
    const employee = await this.repository.findEmployee(employeeId);
    if (
      !campaign.departmentId ||
      !employee ||
      employee.status !== "ACTIVE" ||
      employee.departmentId !== campaign.departmentId ||
      employee.department?.deactivatedAt != null
    ) {
      throw promotionAssigneeInvalid();
    }
    try {
      const record = await this.repository.assignEmployee(
        campaignId,
        activityId,
        employeeId,
        userId,
      );
      if (!record) throw promotionActivityNotFound();
      return response(record);
    } catch (error) {
      if (prismaError(error, "P2002")) throw promotionAssigneeConflict();
      if (isCheckViolation(error)) throw promotionAssigneeInvalid();
      throw error;
    }
  }

  async unassignEmployee(
    userId: string,
    campaignId: string,
    activityId: string,
    employeeId: string,
  ): Promise<PromotionActivityResponse> {
    await this.activity(userId, campaignId, activityId);
    await this.manage(userId, campaignId);
    await this.load(campaignId, activityId);
    const removed = await this.repository.unassignEmployee(
      campaignId,
      activityId,
      employeeId,
    );
    if (!removed) throw promotionAssigneeNotFound();
    return response(await this.load(campaignId, activityId));
  }

  /**
   * Active employees of the campaign's own department, for the assignment picker
   * (EVE-231). Needs the same manage permission as assigning; the list is never
   * wider than the department the campaign belongs to.
   */
  async assignableEmployees(
    userId: string,
    campaignId: string,
    query: ListAssignableEmployeesQueryDto,
  ): Promise<PaginatedAssignableEmployeesResponse> {
    await this.manage(userId, campaignId);
    const campaign = await this.campaigns.get(userId, campaignId);
    if (!campaign.departmentId) {
      return {
        items: [],
        page: query.page,
        pageSize: query.pageSize,
        total: 0,
      };
    }
    const result = await this.repository.listActiveEmployees(
      campaign.departmentId,
      query,
    );
    return {
      items: result.items,
      page: query.page,
      pageSize: query.pageSize,
      total: result.total,
    };
  }

  /**
   * Every promotion activity the caller can read, across promotion campaigns
   * (EVE-231). Visibility is the campaigns service's own read rule.
   */
  async listAll(
    userId: string,
    query: ListPromotionActivitiesQueryDto,
  ): Promise<PaginatedPromotionActivityListResponse> {
    const visibility = await this.campaigns.readableCampaignFilter(userId);
    const result = await this.repository.listAll(visibility, query);
    return {
      items: result.items.map((item) => ({
        ...response(item),
        campaignId: item.campaignId,
        campaignName: item.campaign.name,
      })),
      page: query.page,
      pageSize: query.pageSize,
      total: result.total,
    };
  }

  /** Assigns talent through the assignment service, so conflicts, history and audit apply. */
  async assignTalent(
    userId: string,
    campaignId: string,
    activityId: string,
    dto: AssignPromotionTalentDto,
    requestId: string,
  ): Promise<PromotionActivityResponse> {
    await this.activity(userId, campaignId, activityId);
    await this.manage(userId, campaignId);
    await this.load(campaignId, activityId);
    try {
      await this.talentAssignments.create(
        userId,
        dto.talentId,
        { kind: "PROMOTION", workId: activityId, role: dto.role.trim() },
        requestId,
      );
    } catch (error) {
      throw promotionTalentError(error, "assign");
    }
    return response(await this.load(campaignId, activityId));
  }

  async unassignTalent(
    userId: string,
    campaignId: string,
    activityId: string,
    talentId: string,
    requestId: string,
  ): Promise<PromotionActivityResponse> {
    await this.activity(userId, campaignId, activityId);
    await this.manage(userId, campaignId);
    await this.load(campaignId, activityId);
    if (!isUuid(talentId)) throw promotionAssignmentNotFound();
    try {
      await this.talentAssignments.cancelActiveForWork(
        userId,
        talentId,
        "PROMOTION",
        activityId,
        "Removed from the promotional activity",
        requestId,
      );
    } catch (error) {
      throw promotionTalentError(error, "unassign");
    }
    return response(await this.load(campaignId, activityId));
  }
}

/**
 * A database check or trigger refused the write (SQLSTATE 23514). The assignee
 * trigger raises this when the employee is not active in the campaign's
 * department, so a concurrent move or deactivation is refused too (EVE-231).
 */
function isCheckViolation(error: unknown): boolean {
  if (!(error instanceof Prisma.PrismaClientKnownRequestError)) return false;
  const adapter = error.meta?.driverAdapterError as
    { cause?: { originalCode?: string } } | undefined;
  return adapter?.cause?.originalCode === "23514";
}

/** Maps the assignment service's codes to this module's talent-link codes. */
function promotionTalentError(
  error: unknown,
  action: "assign" | "unassign",
): unknown {
  if (!(error instanceof HttpException)) return error;
  const code = (error.getResponse() as { code?: string }).code;
  if (action === "assign" && code === "TALENT_ASSIGNMENT_DUPLICATE")
    return promotionAssignmentConflict();
  if (code === "TALENT_NOT_FOUND") return promotionTalentNotFound();
  if (action === "unassign" && code === "TALENT_ASSIGNMENT_NOT_FOUND")
    return promotionAssignmentNotFound();
  return error;
}
