import { Injectable } from "@nestjs/common";

import type {
  CampaignStatus,
  PermissionScope,
} from "../generated/prisma/client.js";
import { permissionDenied } from "../common/security/security.errors.js";
import { PermissionsService } from "../common/security/permissions.service.js";
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
  campaignBudgetIncomplete,
  campaignHasManagedFiles,
  campaignInvalidTransition,
  campaignNotFound,
  campaignRelatedEventNotFound,
  campaignRelatedSubjectConflict,
  campaignScheduleInvalid,
  campaignTeamNotAssigned,
  campaignTeamNotFound,
  campaignUserNotFound,
} from "./campaigns.errors.js";
import { canTransition } from "./campaigns.lifecycle.js";
import type { CreateCampaignActivityDto } from "./dto/create-campaign-activity.dto.js";
import type { CreateCampaignDto } from "./dto/create-campaign.dto.js";
import type { ListCampaignActivitiesQueryDto } from "./dto/list-campaign-activities-query.dto.js";
import type { ListCampaignsQueryDto } from "./dto/list-campaigns-query.dto.js";
import type { SetCampaignBudgetDto } from "./dto/set-campaign-budget.dto.js";
import type { UpdateCampaignActivityDto } from "./dto/update-campaign-activity.dto.js";
import type { UpdateCampaignDto } from "./dto/update-campaign.dto.js";
import {
  CampaignsRepository,
  type CampaignActivityRecord,
  type CampaignRecord,
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
  ) {}

  private async requireGrant(
    actingUserId: string,
    permissionKey: string,
    scope: PermissionScope = "ORGANIZATION",
  ): Promise<void> {
    if (
      !(await this.permissions.hasGrant(actingUserId, permissionKey, scope))
    ) {
      throw permissionDenied();
    }
  }

  /** Loads a campaign or throws 404; used before a permission check on `:id` routes. */
  private async loadOrThrow(id: string): Promise<CampaignRecord> {
    const campaign = await this.repository.findById(id);
    if (!campaign) {
      throw campaignNotFound();
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
    await this.requireGrant(actingUserId, "campaign.read");

    const { items, total } = await this.repository.list({
      ...(query.status ? { status: query.status } : {}),
      ...(query.campaignType ? { campaignType: query.campaignType } : {}),
      ...(query.eventId ? { eventId: query.eventId } : {}),
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
    const campaign = await this.loadOrThrow(id);
    await this.requireGrant(actingUserId, "campaign.read");
    return toCampaignResponse(campaign);
  }

  async create(
    actingUserId: string,
    dto: CreateCampaignDto,
  ): Promise<CampaignResponse> {
    await this.requireGrant(actingUserId, "campaign.create");

    const startAt = dto.startAt ? new Date(dto.startAt) : undefined;
    const endAt = dto.endAt ? new Date(dto.endAt) : undefined;
    assertScheduleOrdered(startAt ?? null, endAt ?? null);
    assertSingleSubject(dto.eventId ?? null, dto.productName ?? null);

    const result = await this.repository.create({
      name: dto.name.trim(),
      campaignType: dto.campaignType,
      createdById: actingUserId,
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
    });

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
    const campaign = await this.loadOrThrow(id);
    await this.requireGrant(actingUserId, "campaign.update");

    assertScheduleOrdered(
      resolveInstant(dto.startAt, campaign.startAt),
      resolveInstant(dto.endAt, campaign.endAt),
    );
    assertSingleSubject(
      dto.eventId === undefined ? campaign.eventId : dto.eventId,
      dto.productName === undefined ? campaign.productName : dto.productName,
    );

    const result = await this.repository.update(id, {
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
    });

    if (result === "not_found") {
      throw campaignNotFound();
    }
    if (result === "event_not_found") {
      throw campaignRelatedEventNotFound();
    }
    return toCampaignResponse(result);
  }

  async transition(
    actingUserId: string,
    id: string,
    target: CampaignStatus,
  ): Promise<CampaignResponse> {
    const campaign = await this.loadOrThrow(id);
    await this.requireGrant(actingUserId, "campaign.transition_status");

    if (!canTransition(campaign.status, target)) {
      throw campaignInvalidTransition(campaign.status, target);
    }

    const result = await this.repository.updateStatus(id, target);
    if (result === "not_found") {
      throw campaignNotFound();
    }
    return toCampaignResponse(result);
  }

  async setManager(
    actingUserId: string,
    id: string,
    managerId: string | null,
  ): Promise<CampaignResponse> {
    const campaign = await this.loadOrThrow(id);
    await this.requireGrant(actingUserId, "campaign.assign");

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
    const campaign = await this.loadOrThrow(id);
    await this.requireGrant(actingUserId, "campaign.assign");

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
    const campaign = await this.loadOrThrow(id);
    await this.requireGrant(actingUserId, "campaign.assign");

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
    const campaign = await this.loadOrThrow(id);
    await this.requireGrant(actingUserId, "campaign.budget.read");
    return { amount: campaign.budgetAmount, currency: campaign.budgetCurrency };
  }

  async setBudget(
    actingUserId: string,
    id: string,
    dto: SetCampaignBudgetDto,
  ): Promise<CampaignBudgetResponse> {
    await this.loadOrThrow(id);
    await this.requireGrant(actingUserId, "campaign.budget.update");

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

  async remove(actingUserId: string, id: string): Promise<void> {
    await this.loadOrThrow(id);
    await this.requireGrant(actingUserId, "campaign.delete");

    const result = await this.repository.delete(id);
    if (result === "not_found") {
      throw campaignNotFound();
    }
    if (result === "has_managed_files") {
      throw campaignHasManagedFiles();
    }
  }

  async listActivities(
    actingUserId: string,
    id: string,
    query: ListCampaignActivitiesQueryDto,
  ): Promise<PaginatedCampaignActivitiesResponse> {
    await this.loadOrThrow(id);
    await this.requireGrant(actingUserId, "campaign.read");

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

  async createActivity(
    actingUserId: string,
    id: string,
    dto: CreateCampaignActivityDto,
  ): Promise<CampaignActivityResponse> {
    await this.loadOrThrow(id);
    await this.requireGrant(actingUserId, "campaign.activity.manage");

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
    await this.loadOrThrow(id);
    await this.requireGrant(actingUserId, "campaign.activity.manage");

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
  ): Promise<void> {
    await this.loadOrThrow(id);
    await this.requireGrant(actingUserId, "campaign.activity.manage");

    const result = await this.repository.deleteActivity(id, activityId);
    if (result === "not_found") {
      throw campaignActivityNotFound();
    }
  }
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
    productName: record.productName,
    progress: record.progress,
    manager: record.manager,
    teams: record.teams,
    participants: record.participants,
    createdBy: record.createdBy,
    createdAt: record.createdAt.toISOString(),
    updatedAt: record.updatedAt.toISOString(),
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
