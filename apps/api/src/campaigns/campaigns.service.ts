import { Injectable } from "@nestjs/common";
import { Prisma } from "../generated/prisma/client.js";

import type { CampaignStatus } from "../generated/prisma/client.js";
import { permissionDenied } from "../common/security/security.errors.js";
import { PermissionsService } from "../common/security/permissions.service.js";
import { EventsService } from "../events/events.service.js";
import { WorkspacesRepository } from "../workspaces/infrastructure/workspaces.repository.js";
import type {
  CampaignActivityResponse,
  CampaignBudgetResponse,
  CampaignResponse,
  PaginatedCampaignActivitiesResponse,
  PaginatedCampaignsResponse,
} from "./campaigns.contracts.js";
import {
  campaignActivityNotFound,
  campaignActivityScheduleInvalid,
  campaignApprovalRequired,
  campaignBudgetIncomplete,
  campaignHasExpenses,
  campaignDepartmentNotFound,
  campaignHasManagedFiles,
  campaignInvalidTransition,
  campaignNotFound,
  campaignRelatedEventNotFound,
  campaignMetricDateInvalid,
  campaignRelatedLinkConflict,
  campaignRelatedLinkNotFound,
  campaignRelatedSubjectConflict,
  campaignScheduleInvalid,
  campaignTeamNotAssigned,
  campaignTeamNotFound,
  campaignTypeConflict,
  campaignUserNotFound,
} from "./campaigns.errors.js";
import { canTransition, isApprovalMove } from "./campaigns.lifecycle.js";
import type {
  CampaignMetricResponse,
  CampaignUpdateResponse,
  PaginatedCampaignMetricsResponse,
  PaginatedCampaignUpdatesResponse,
} from "./campaigns.contracts.js";
import type {
  ListCampaignMetricsQueryDto,
  ListCampaignUpdatesQueryDto,
} from "./dto/campaign-detail.dto.js";
import type {
  CreateCampaignUpdateDto,
  RecordCampaignMetricDto,
} from "./dto/campaign-detail.dto.js";
import type { CreateCampaignActivityDto } from "./dto/create-campaign-activity.dto.js";
import type { CreateCampaignDto } from "./dto/create-campaign.dto.js";
import type { ListCampaignActivitiesQueryDto } from "./dto/list-campaign-activities-query.dto.js";
import type { ListCampaignsQueryDto } from "./dto/list-campaigns-query.dto.js";
import type { SetCampaignBudgetDto } from "./dto/set-campaign-budget.dto.js";
import type { ListCampaignBudgetSummariesQueryDto } from "./dto/list-campaign-budget-summaries-query.dto.js";
import { PartnersService } from "../partners/partners.service.js";
import type { PartnerResponse } from "../partners/partners.contracts.js";
import { computeBudgetFigures } from "./campaign-budget.domain.js";
import type {
  CampaignBudgetSummaryResponse,
  PaginatedCampaignBudgetSummariesResponse,
} from "./campaigns.contracts.js";
import type { UpdateCampaignActivityDto } from "./dto/update-campaign-activity.dto.js";
import { TalentAssignmentsService } from "../talent/talent-assignments.service.js";
import type { UpdateCampaignDto } from "./dto/update-campaign.dto.js";
import {
  CampaignsRepository,
  type CampaignActivityRecord,
  type CampaignRecord,
  type CampaignVisibility,
} from "./infrastructure/campaigns.repository.js";

/**
 * Application service for the campaign platform shared by Marketing and
 * Promotion: the precise authorization boundary (the transport guard only
 * checked that the caller holds the `campaign.*` key at some scope), the
 * lifecycle, schedule, and related-subject policy, and the mapping from
 * persistence records to public response shapes.
 *
 * Every campaign route is for a known `kind = CAMPAIGN`, so the static
 * `@RequirePermissions` on the controller names the exact key and this service
 * re-checks it at ORGANIZATION scope - matching WSP-02. Manager and team
 * assignment share the single `campaign.assign` key and both reuse
 * `WorkspacesRepository` so composition logic (idempotency, "not assigned")
 * lives in one place; the workspace row lifecycle (create with the campaign,
 * delete with it) lives in `CampaignsRepository`, the pairing CAM-01 assigned
 * here. The budget is sensitive (PC-04) and reachable only through the two
 * budget routes and their own keys. Activities are read with `campaign.read`
 * and written with `campaign.activity.manage`.
 */
@Injectable()
export class CampaignsService {
  constructor(
    private readonly repository: CampaignsRepository,
    private readonly workspaces: WorkspacesRepository,
    private readonly permissions: PermissionsService,
    private readonly events: EventsService,
    private readonly talentAssignments: TalentAssignmentsService,
    private readonly partners: PartnersService,
  ) {}

  /** Loads a campaign or throws 404; used before a permission check on `:id` routes. */
  private async loadOrThrow(id: string): Promise<CampaignRecord> {
    const campaign = await this.repository.findById(id);
    if (!campaign) {
      throw campaignNotFound();
    }
    return campaign;
  }

  /** Resolves an acting caller's reach for one `campaign.*` key: an
   * organization-scoped caller (Super Admin) sees every campaign; a
   * department-scoped caller (e.g. the Marketing Department Manager) only
   * their own department's - the same `visibilityFor`/`isAuthorizedFor` idiom
   * `TasksService`/`ReportsService`/`ProductionsService` already use. */
  private async visibilityFor(
    actingUserId: string,
    permissionKey: string,
  ): Promise<CampaignVisibility> {
    const [organization, department] = await Promise.all([
      this.permissions.hasGrant(actingUserId, permissionKey, "ORGANIZATION"),
      this.permissions.hasGrant(actingUserId, permissionKey, "DEPARTMENT"),
    ]);
    if (!organization && !department) throw permissionDenied();
    const departmentId = department
      ? await this.repository.findUserDepartmentId(actingUserId)
      : null;
    // Read keys only: department oversight (EVE-229) widens a department
    // manager's read to the departments they oversee, never their writes.
    const overseenDepartmentIds = organization
      ? []
      : await this.permissions.overseenDepartmentIdsFor(
          actingUserId,
          permissionKey,
        );
    return {
      organization,
      ...(departmentId ? { departmentId } : {}),
      ...(overseenDepartmentIds.length > 0 ? { overseenDepartmentIds } : {}),
    };
  }

  private async isAuthorizedFor(
    actingUserId: string,
    permissionKey: string,
    campaign: CampaignRecord,
  ): Promise<boolean> {
    if (
      await this.permissions.hasGrant(
        actingUserId,
        permissionKey,
        "ORGANIZATION",
      )
    )
      return true;
    if (
      await this.permissions.hasGrant(actingUserId, permissionKey, "DEPARTMENT")
    ) {
      const departmentId =
        await this.repository.findUserDepartmentId(actingUserId);
      if (departmentId && departmentId === campaign.departmentId) return true;
    }
    // Read-only oversight: `overseenDepartmentIdsFor` returns nothing for a
    // write key, so this can only ever let a read through.
    if (campaign.departmentId) {
      const overseen = await this.permissions.overseenDepartmentIdsFor(
        actingUserId,
        permissionKey,
      );
      if (overseen.includes(campaign.departmentId)) return true;
    }
    return false;
  }

  /** Exported for modules that extend a campaign (promotion details): enforces
   * `permissionKey` against the campaign's own department, the same check
   * every campaign route uses. */
  async assertCampaignPermission(
    actingUserId: string,
    campaignId: string,
    permissionKey: string,
  ): Promise<void> {
    await this.authorize(actingUserId, campaignId, permissionKey);
  }

  /** Loads a campaign and enforces `permissionKey` against it in one call -
   * the id-scoped-route equivalent of `visibilityFor` for a list route. */
  private async authorize(
    actingUserId: string,
    id: string,
    permissionKey: string,
  ): Promise<CampaignRecord> {
    const campaign = await this.repository.findById(id);
    if (!campaign) {
      if (
        await this.permissions.hasGrant(
          actingUserId,
          permissionKey,
          "ORGANIZATION",
        )
      ) {
        throw campaignNotFound();
      }
      throw permissionDenied();
    }
    if (!(await this.isAuthorizedFor(actingUserId, permissionKey, campaign))) {
      throw permissionDenied();
    }
    return campaign;
  }

  /** Re-reads a campaign that must exist; a `null` here means it was raced away. */
  private async reload(id: string): Promise<CampaignResponse> {
    const campaign = await this.repository.findById(id);
    if (!campaign) {
      throw campaignNotFound();
    }
    return toCampaignResponse(campaign);
  }

  async list(
    actingUserId: string,
    query: ListCampaignsQueryDto,
  ): Promise<PaginatedCampaignsResponse> {
    const visibility = await this.visibilityFor(actingUserId, "campaign.read");

    const { items, total } = await this.repository.list({
      visibility,
      ...(query.status ? { status: query.status } : {}),
      ...(query.campaignType ? { campaignType: query.campaignType } : {}),
      ...(query.eventId ? { eventId: query.eventId } : {}),
      ...(query.departmentId ? { departmentId: query.departmentId } : {}),
      ...(query.managerId ? { managerId: query.managerId } : {}),
      ...(query.search?.trim() ? { search: query.search.trim() } : {}),
      ...(query.startingAfter
        ? { startingAfter: new Date(query.startingAfter) }
        : {}),
      ...(query.startingBefore
        ? { startingBefore: new Date(query.startingBefore) }
        : {}),
      page: query.page,
      pageSize: query.pageSize,
    });

    return {
      items: items.map(toCampaignResponse),
      page: query.page,
      pageSize: query.pageSize,
      total,
    };
  }

  async get(actingUserId: string, id: string): Promise<CampaignResponse> {
    const campaign = await this.authorize(actingUserId, id, "campaign.read");
    return toCampaignResponse(campaign);
  }

  /** Narrow, read-only cross-department coordination (EOM-01): the
   * campaigns linked to one event, for a caller who can already read that
   * event and holds `campaign.read` at any scope - not a full
   * department-scope retrofit of this module's own list/get/mutation
   * methods, which stay organization-only. */
  /** The campaigns the caller may read, as a visibility filter (EVE-231). */
  async readableCampaignFilter(
    actingUserId: string,
  ): Promise<CampaignVisibility> {
    return this.visibilityFor(actingUserId, "campaign.read");
  }

  async listForEvent(
    actingUserId: string,
    eventId: string,
  ): Promise<CampaignResponse[]> {
    const [organization, department, self] = await Promise.all([
      this.permissions.hasGrant(actingUserId, "campaign.read", "ORGANIZATION"),
      this.permissions.hasGrant(actingUserId, "campaign.read", "DEPARTMENT"),
      this.permissions.hasGrant(actingUserId, "campaign.read", "SELF"),
    ]);
    if (!organization && !department && !self) throw permissionDenied();
    await this.events.get(actingUserId, eventId);
    const { items } = await this.repository.list({
      eventId,
      page: 1,
      pageSize: 100,
    });
    return items.map(toCampaignResponse);
  }

  async create(
    actingUserId: string,
    dto: CreateCampaignDto,
  ): Promise<CampaignResponse> {
    const organization = await this.permissions.hasGrant(
      actingUserId,
      "campaign.create",
      "ORGANIZATION",
    );
    let departmentId = dto.departmentId;
    if (!organization) {
      if (
        !(await this.permissions.hasGrant(
          actingUserId,
          "campaign.create",
          "DEPARTMENT",
        ))
      ) {
        throw permissionDenied();
      }
      // A department-scoped caller's own department is always used - never
      // trust the client's own `departmentId`, the same rule
      // `TasksService`/`ProductionsService` already enforce on create.
      const ownDepartmentId =
        await this.repository.findUserDepartmentId(actingUserId);
      if (!ownDepartmentId) throw permissionDenied();
      departmentId = ownDepartmentId;
    }
    if (departmentId && !(await this.repository.departmentExists(departmentId)))
      throw campaignDepartmentNotFound();

    const startAt = dto.startAt ? new Date(dto.startAt) : undefined;
    const endAt = dto.endAt ? new Date(dto.endAt) : undefined;
    assertScheduleOrdered(startAt ?? null, endAt ?? null);
    assertSingleSubject(dto.eventId ?? null, dto.productName ?? null);
    assertSingleLink(
      dto.projectId ?? null,
      dto.productionId ?? null,
      dto.talentId ?? null,
    );

    const result = await this.repository.create({
      name: dto.name.trim(),
      campaignType: dto.campaignType,
      createdById: actingUserId,
      ...(departmentId ? { departmentId } : {}),
      ...(dto.description !== undefined
        ? { description: dto.description.trim() }
        : {}),
      ...(dto.audience !== undefined ? { audience: dto.audience.trim() } : {}),
      ...(startAt ? { startAt } : {}),
      ...(endAt ? { endAt } : {}),
      ...(dto.eventId ? { eventId: dto.eventId } : {}),
      ...(dto.productName !== undefined
        ? { productName: dto.productName.trim() }
        : {}),
      ...(dto.managerId ? { managerId: dto.managerId } : {}),
      ...(dto.objectives !== undefined
        ? { objectives: dto.objectives.trim() }
        : {}),
      ...(dto.projectId ? { projectId: dto.projectId } : {}),
      ...(dto.productionId ? { productionId: dto.productionId } : {}),
      ...(dto.talentId ? { talentId: dto.talentId } : {}),
    });

    if (result === "link_not_found") {
      throw campaignRelatedLinkNotFound();
    }
    if (result === "manager_not_found") {
      throw campaignUserNotFound();
    }
    if (result === "event_not_found") {
      throw campaignRelatedEventNotFound();
    }
    return toCampaignResponse(result);
  }

  async update(
    actingUserId: string,
    id: string,
    dto: UpdateCampaignDto,
  ): Promise<CampaignResponse> {
    const campaign = await this.authorize(actingUserId, id, "campaign.update");

    assertScheduleOrdered(
      resolveInstant(dto.startAt, campaign.startAt),
      resolveInstant(dto.endAt, campaign.endAt),
    );
    assertSingleSubject(
      dto.eventId === undefined ? campaign.eventId : dto.eventId,
      dto.productName === undefined ? campaign.productName : dto.productName,
    );
    assertSingleLink(
      dto.projectId === undefined ? campaign.projectId : dto.projectId,
      dto.productionId === undefined ? campaign.productionId : dto.productionId,
      dto.talentId === undefined ? campaign.talentId : dto.talentId,
    );

    let result: Awaited<ReturnType<CampaignsRepository["update"]>>;
    try {
      result = await this.repository.update(id, {
        ...(dto.name !== undefined ? { name: dto.name.trim() } : {}),
        ...(dto.campaignType !== undefined
          ? { campaignType: dto.campaignType }
          : {}),
        ...(dto.description !== undefined
          ? {
              description:
                dto.description === null ? null : dto.description.trim(),
            }
          : {}),
        ...(dto.audience !== undefined
          ? { audience: dto.audience === null ? null : dto.audience.trim() }
          : {}),
        ...(dto.startAt !== undefined
          ? { startAt: dto.startAt === null ? null : new Date(dto.startAt) }
          : {}),
        ...(dto.endAt !== undefined
          ? { endAt: dto.endAt === null ? null : new Date(dto.endAt) }
          : {}),
        ...(dto.eventId !== undefined ? { eventId: dto.eventId } : {}),
        ...(dto.productName !== undefined
          ? {
              productName:
                dto.productName === null ? null : dto.productName.trim(),
            }
          : {}),
        ...(dto.objectives !== undefined
          ? {
              objectives:
                dto.objectives === null ? null : dto.objectives.trim(),
            }
          : {}),
        ...(dto.projectId !== undefined ? { projectId: dto.projectId } : {}),
        ...(dto.productionId !== undefined
          ? { productionId: dto.productionId }
          : {}),
        ...(dto.talentId !== undefined ? { talentId: dto.talentId } : {}),
      });
    } catch (error) {
      // Type-specific extensions use a constant-type composite FK. PostgreSQL
      // rejects retyping an attached campaign (23514); expose a conflict, not
      // an internal error, without querying another module's tables.
      if (
        dto.campaignType !== undefined &&
        dto.campaignType !== campaign.campaignType &&
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === "P2039" &&
        isCheckViolation(error.meta?.driverAdapterError)
      ) {
        throw campaignTypeConflict();
      }
      throw error;
    }

    if (result === "not_found") {
      throw campaignNotFound();
    }
    if (result === "event_not_found") {
      throw campaignRelatedEventNotFound();
    }
    if (result === "link_not_found") {
      throw campaignRelatedLinkNotFound();
    }
    return toCampaignResponse(result);
  }

  async transition(
    actingUserId: string,
    id: string,
    target: CampaignStatus,
    requestId?: string,
  ): Promise<CampaignResponse> {
    const campaign = await this.authorize(
      actingUserId,
      id,
      "campaign.transition_status",
    );

    if (!canTransition(campaign.campaignType, campaign.status, target)) {
      throw campaignInvalidTransition(campaign.status, target);
    }

    // EVE-229: approving a promotion campaign is reserved for Super Admin and
    // Admin, so a Promotion manager cannot approve their own campaign. Admin
    // holds `campaign.transition_status` only to approve; every other move
    // stays with Super Admin and the campaign's own department.
    const { role } = await this.permissions.getAccessContext(actingUserId);
    const approval = isApprovalMove(
      campaign.campaignType,
      campaign.status,
      target,
    );
    if (approval && role !== "SUPER_ADMIN" && role !== "ADMIN") {
      throw campaignApprovalRequired();
    }
    if (role === "ADMIN" && !approval) throw permissionDenied();

    const result = await this.repository.updateStatus(
      id,
      campaign.status,
      target,
      requestId ? { actorUserId: actingUserId, requestId } : undefined,
    );
    if (result === "not_found") {
      throw campaignNotFound();
    }
    if (result === "status_changed") {
      // Another request moved the campaign after we read it. Report the move
      // that is no longer legal against the status it now has.
      const current = await this.loadOrThrow(id);
      throw campaignInvalidTransition(current.status, target);
    }
    return toCampaignResponse(result);
  }

  async setManager(
    actingUserId: string,
    id: string,
    managerId: string | null,
  ): Promise<CampaignResponse> {
    const campaign = await this.authorize(actingUserId, id, "campaign.assign");

    const result = await this.workspaces.setManager(
      campaign.workspaceId,
      managerId,
    );
    if (result === "not_found") {
      throw campaignNotFound();
    }
    if (result === "manager_not_found") {
      throw campaignUserNotFound();
    }
    return this.reload(id);
  }

  async assignTeam(
    actingUserId: string,
    id: string,
    teamId: string,
  ): Promise<CampaignResponse> {
    const campaign = await this.authorize(actingUserId, id, "campaign.assign");

    const result = await this.workspaces.assignTeam(
      campaign.workspaceId,
      teamId,
    );
    if (result === "workspace_not_found") {
      throw campaignNotFound();
    }
    if (result === "team_not_found") {
      throw campaignTeamNotFound();
    }
    return this.reload(id);
  }

  async unassignTeam(
    actingUserId: string,
    id: string,
    teamId: string,
  ): Promise<CampaignResponse> {
    const campaign = await this.authorize(actingUserId, id, "campaign.assign");

    const result = await this.workspaces.unassignTeam(
      campaign.workspaceId,
      teamId,
    );
    if (result === "workspace_not_found") {
      throw campaignNotFound();
    }
    if (result === "not_assigned") {
      throw campaignTeamNotAssigned();
    }
    return this.reload(id);
  }

  async getBudget(
    actingUserId: string,
    id: string,
  ): Promise<CampaignBudgetResponse> {
    const campaign = await this.authorize(
      actingUserId,
      id,
      "campaign.budget.read",
    );
    return { amount: campaign.budgetAmount, currency: campaign.budgetCurrency };
  }

  /** EVE-233: one campaign's budget against its expenses. */
  async budgetSummary(
    actingUserId: string,
    id: string,
  ): Promise<CampaignBudgetSummaryResponse> {
    const campaign = await this.authorize(
      actingUserId,
      id,
      "campaign.budget.read",
    );
    const [summary] = await this.summarize(actingUserId, [campaign]);
    return summary!;
  }

  /** EVE-233: budget summaries of every campaign whose budget the caller can
   * read, the same visibility as the budget itself (oversight included). */
  async listBudgetSummaries(
    actingUserId: string,
    query: ListCampaignBudgetSummariesQueryDto,
  ): Promise<PaginatedCampaignBudgetSummariesResponse> {
    const visibility = await this.visibilityFor(
      actingUserId,
      "campaign.budget.read",
    );
    const { items, total } = await this.repository.list({
      visibility,
      ...(query.campaignType ? { campaignType: query.campaignType } : {}),
      page: query.page,
      pageSize: query.pageSize,
    });
    return {
      items: await this.summarize(actingUserId, items),
      page: query.page,
      pageSize: query.pageSize,
      total,
    };
  }

  private async summarize(
    actingUserId: string,
    campaigns: readonly CampaignRecord[],
  ): Promise<CampaignBudgetSummaryResponse[]> {
    const ids = campaigns.map((campaign) => campaign.id);
    const [sums, names, partnersByCampaign] = await Promise.all([
      this.repository.budgetExpenseSums(ids),
      this.repository.activityNames(ids),
      this.readablePartners(actingUserId, ids),
    ]);
    return campaigns.map((campaign) => {
      const partnerships = partnersByCampaign.get(campaign.id) ?? [];
      const figures = computeBudgetFigures({
        budgetAmount:
          campaign.budgetAmount === null
            ? null
            : new Prisma.Decimal(campaign.budgetAmount),
        budgetCurrency: campaign.budgetCurrency,
        expenses: sums.filter((row) => row.campaignId === campaign.id),
        partnerships: partnerships.map((partner) => ({
          status: partner.status,
          amount:
            partner.agreedValueAmount === null
              ? null
              : new Prisma.Decimal(partner.agreedValueAmount),
          currency: partner.agreedValueCurrency,
        })),
      });
      return {
        campaignId: campaign.id,
        campaignName: campaign.name,
        campaignType: campaign.campaignType,
        status: campaign.status,
        ...figures,
        byActivity: figures.byActivity.map((line) => ({
          ...line,
          activityName: line.campaignActivityId
            ? (names.get(line.campaignActivityId) ?? null)
            : null,
        })),
        partnerships: partnerships.map((partner) => ({
          id: partner.id,
          partnershipName: partner.partnershipName,
          organizationName: partner.organizationName,
          status: partner.status,
          agreedValueAmount: partner.agreedValueAmount,
          agreedValueCurrency: partner.agreedValueCurrency,
        })),
      };
    });
  }

  /** The campaigns' partners, as far as the caller may read partners, in
   * one query. A caller without `partner.read` gets the budget without them. */
  private readablePartners(
    actingUserId: string,
    campaignIds: readonly string[],
  ): Promise<Map<string, PartnerResponse[]>> {
    return this.partners.listForCampaigns(actingUserId, campaignIds);
  }

  async setBudget(
    actingUserId: string,
    id: string,
    dto: SetCampaignBudgetDto,
  ): Promise<CampaignBudgetResponse> {
    await this.authorize(actingUserId, id, "campaign.budget.update");

    if ((dto.amount === null) !== (dto.currency === null)) {
      throw campaignBudgetIncomplete();
    }

    const amount = dto.amount === null ? null : dto.amount.toFixed(2);
    const result = await this.repository.setBudget(id, amount, dto.currency);
    if (result === "not_found") {
      throw campaignNotFound();
    }
    return { amount: result.budgetAmount, currency: result.budgetCurrency };
  }

  async remove(
    actingUserId: string,
    id: string,
    requestId: string,
  ): Promise<void> {
    await this.authorize(actingUserId, id, "campaign.delete");
    // EVE-233: expenses are financial records; they keep their campaign.
    if (await this.repository.hasExpenses(id)) throw campaignHasExpenses();

    const result = await this.repository.delete(
      id,
      this.talentAssignments.archiveHook(actingUserId, requestId),
    );
    if (result === "not_found") {
      throw campaignNotFound();
    }
    if (result === "has_managed_files") {
      throw campaignHasManagedFiles();
    }
  }

  /** The campaign's updates log, newest first. Reading needs campaign.read. */
  async listUpdates(
    actingUserId: string,
    id: string,
    query: ListCampaignUpdatesQueryDto,
  ): Promise<PaginatedCampaignUpdatesResponse> {
    await this.authorize(actingUserId, id, "campaign.read");
    const { items, total } = await this.repository.listUpdates(
      id,
      query.page,
      query.pageSize,
    );
    return {
      items: items.map(toUpdateResponse),
      page: query.page,
      pageSize: query.pageSize,
      total,
    };
  }

  /** Adds an entry to the updates log. Only the campaign's own department writes. */
  async addUpdate(
    actingUserId: string,
    id: string,
    dto: CreateCampaignUpdateDto,
  ): Promise<CampaignUpdateResponse> {
    await this.authorize(actingUserId, id, "campaign.update");
    return toUpdateResponse(
      await this.repository.createUpdate(id, actingUserId, dto.note.trim()),
    );
  }

  /** Recorded metrics, latest recording day first. Reading needs campaign.read. */
  async listMetrics(
    actingUserId: string,
    id: string,
    query: ListCampaignMetricsQueryDto,
  ): Promise<PaginatedCampaignMetricsResponse> {
    await this.authorize(actingUserId, id, "campaign.read");
    const { items, total } = await this.repository.listMetrics(
      id,
      query.key,
      query.page,
      query.pageSize,
    );
    return {
      items: items.map(toMetricResponse),
      page: query.page,
      pageSize: query.pageSize,
      total,
    };
  }

  /**
   * Records a metric exactly as given. Nothing is computed from it. Only the
   * campaign's own department (or Super Admin) records metrics.
   */
  async recordMetric(
    actingUserId: string,
    id: string,
    dto: RecordCampaignMetricDto,
  ): Promise<CampaignMetricResponse> {
    await this.authorize(actingUserId, id, "campaign.update");
    const recordedOn = new Date(`${dto.recordedOn}T00:00:00.000Z`);
    if (
      Number.isNaN(recordedOn.getTime()) ||
      recordedOn.toISOString().slice(0, 10) !== dto.recordedOn
    ) {
      throw campaignMetricDateInvalid();
    }
    return toMetricResponse(
      await this.repository.createMetric(id, {
        key: dto.key,
        value: dto.value.toFixed(2),
        recordedOn,
        sourceNote: dto.sourceNote?.trim() ?? null,
        recordedById: actingUserId,
      }),
    );
  }

  async listActivities(
    actingUserId: string,
    id: string,
    query: ListCampaignActivitiesQueryDto,
  ): Promise<PaginatedCampaignActivitiesResponse> {
    await this.authorize(actingUserId, id, "campaign.read");

    const { items, total } = await this.repository.listActivities(id, {
      ...(query.status ? { status: query.status } : {}),
      page: query.page,
      pageSize: query.pageSize,
    });
    return {
      items: items.map(toActivityResponse),
      page: query.page,
      pageSize: query.pageSize,
      total,
    };
  }

  /** Exported application query for modules extending a shared activity. */
  async getActivity(
    actingUserId: string,
    campaignId: string,
    activityId: string,
  ): Promise<CampaignActivityResponse> {
    await this.authorize(actingUserId, campaignId, "campaign.read");
    const activity = await this.repository.findActivity(campaignId, activityId);
    if (!activity) throw campaignActivityNotFound();
    return toActivityResponse(activity);
  }

  async createActivity(
    actingUserId: string,
    id: string,
    dto: CreateCampaignActivityDto,
  ): Promise<CampaignActivityResponse> {
    await this.authorize(actingUserId, id, "campaign.activity.manage");

    const startAt = dto.startAt ? new Date(dto.startAt) : undefined;
    const endAt = dto.endAt ? new Date(dto.endAt) : undefined;
    assertActivityScheduleOrdered(startAt ?? null, endAt ?? null);

    const result = await this.repository.createActivity(id, {
      name: dto.name.trim(),
      ...(dto.description !== undefined
        ? { description: dto.description.trim() }
        : {}),
      ...(dto.status !== undefined ? { status: dto.status } : {}),
      ...(startAt ? { startAt } : {}),
      ...(endAt ? { endAt } : {}),
    });
    if (result === "campaign_not_found") {
      throw campaignNotFound();
    }
    return toActivityResponse(result);
  }

  async updateActivity(
    actingUserId: string,
    id: string,
    activityId: string,
    dto: UpdateCampaignActivityDto,
  ): Promise<CampaignActivityResponse> {
    await this.authorize(actingUserId, id, "campaign.activity.manage");

    const activity = await this.repository.findActivity(id, activityId);
    if (!activity) {
      throw campaignActivityNotFound();
    }
    assertActivityScheduleOrdered(
      resolveInstant(dto.startAt, activity.startAt),
      resolveInstant(dto.endAt, activity.endAt),
    );

    const result = await this.repository.updateActivity(id, activityId, {
      ...(dto.name !== undefined ? { name: dto.name.trim() } : {}),
      ...(dto.description !== undefined
        ? {
            description:
              dto.description === null ? null : dto.description.trim(),
          }
        : {}),
      ...(dto.status !== undefined ? { status: dto.status } : {}),
      ...(dto.startAt !== undefined
        ? { startAt: dto.startAt === null ? null : new Date(dto.startAt) }
        : {}),
      ...(dto.endAt !== undefined
        ? { endAt: dto.endAt === null ? null : new Date(dto.endAt) }
        : {}),
    });
    if (result === "not_found") {
      throw campaignActivityNotFound();
    }
    return toActivityResponse(result);
  }

  async removeActivity(
    actingUserId: string,
    id: string,
    activityId: string,
    requestId: string,
  ): Promise<void> {
    await this.authorize(actingUserId, id, "campaign.activity.manage");

    const result = await this.repository.deleteActivity(
      id,
      activityId,
      this.talentAssignments.archiveHook(actingUserId, requestId),
    );
    if (result === "not_found") {
      throw campaignActivityNotFound();
    }
  }
}

function isCheckViolation(adapterError: unknown): boolean {
  if (
    !adapterError ||
    typeof adapterError !== "object" ||
    !("cause" in adapterError)
  ) {
    return false;
  }
  const cause = adapterError.cause;
  return (
    !!cause &&
    typeof cause === "object" &&
    "originalCode" in cause &&
    cause.originalCode === "23514"
  );
}

/** The effective instant of a field after a patch: the new value, or the current one. */
function resolveInstant(
  patched: string | null | undefined,
  current: Date | null,
): Date | null {
  if (patched === undefined) {
    return current;
  }
  return patched === null ? null : new Date(patched);
}

function assertScheduleOrdered(startAt: Date | null, endAt: Date | null): void {
  if (startAt && endAt && endAt.getTime() < startAt.getTime()) {
    throw campaignScheduleInvalid();
  }
}

function assertActivityScheduleOrdered(
  startAt: Date | null,
  endAt: Date | null,
): void {
  if (startAt && endAt && endAt.getTime() < startAt.getTime()) {
    throw campaignActivityScheduleInvalid();
  }
}

/** EVE-231: a campaign links to at most one project, production or artist. */
function assertSingleLink(
  projectId: string | null,
  productionId: string | null,
  talentId: string | null,
): void {
  const links = [projectId, productionId, talentId].filter(Boolean).length;
  if (links > 1) {
    throw campaignRelatedLinkConflict();
  }
}

/** A campaign relates to one subject - an event or a product - or none. */
function assertSingleSubject(
  eventId: string | null,
  productName: string | null,
): void {
  if (eventId !== null && productName !== null) {
    throw campaignRelatedSubjectConflict();
  }
}

function toCampaignResponse(record: CampaignRecord): CampaignResponse {
  return {
    id: record.id,
    workspaceId: record.workspaceId,
    name: record.name,
    campaignType: record.campaignType,
    description: record.description,
    audience: record.audience,
    status: record.status,
    startAt: record.startAt ? record.startAt.toISOString() : null,
    endAt: record.endAt ? record.endAt.toISOString() : null,
    eventId: record.eventId,
    departmentId: record.departmentId,
    productName: record.productName,
    objectives: record.objectives,
    projectId: record.projectId,
    productionId: record.productionId,
    talentId: record.talentId,
    progress: record.progress,
    manager: record.manager,
    teams: record.teams,
    participants: record.participants,
    createdBy: record.createdBy,
    createdAt: record.createdAt.toISOString(),
    updatedAt: record.updatedAt.toISOString(),
  };
}

function toUpdateResponse(record: {
  id: string;
  campaignId: string;
  note: string;
  createdAt: Date;
  author: {
    id: string;
    email: string;
    firstName: string | null;
    lastName: string | null;
  } | null;
}): CampaignUpdateResponse {
  return {
    id: record.id,
    campaignId: record.campaignId,
    note: record.note,
    author: record.author,
    createdAt: record.createdAt.toISOString(),
  };
}

function toMetricResponse(record: {
  id: string;
  campaignId: string;
  key: CampaignMetricResponse["key"];
  value: { toFixed: (digits: number) => string };
  recordedOn: Date;
  sourceNote: string | null;
  createdAt: Date;
  recordedBy: {
    id: string;
    email: string;
    firstName: string | null;
    lastName: string | null;
  } | null;
}): CampaignMetricResponse {
  return {
    id: record.id,
    campaignId: record.campaignId,
    key: record.key,
    value: record.value.toFixed(2),
    recordedOn: record.recordedOn.toISOString().slice(0, 10),
    sourceNote: record.sourceNote,
    recordedBy: record.recordedBy,
    createdAt: record.createdAt.toISOString(),
  };
}

function toActivityResponse(
  record: CampaignActivityRecord,
): CampaignActivityResponse {
  return {
    id: record.id,
    campaignId: record.campaignId,
    name: record.name,
    description: record.description,
    status: record.status,
    startAt: record.startAt ? record.startAt.toISOString() : null,
    endAt: record.endAt ? record.endAt.toISOString() : null,
    createdAt: record.createdAt.toISOString(),
    updatedAt: record.updatedAt.toISOString(),
  };
}
