import { Injectable } from "@nestjs/common";

import {
  AuditActorKind,
  AuditOutcome,
  CampaignActivityStatus,
  Prisma,
  WorkspaceKind,
  type CampaignStatus,
  type CampaignMetricKey,
  type CampaignType,
} from "../../generated/prisma/client.js";
import type { ArchiveHook } from "../../common/archive/archive-hook.js";
import { AuditWriterService } from "../../audit/audit-writer.service.js";
import { DatabaseService } from "../../database/database.service.js";

/** Who made a change, for the audit record written in the same transaction. */
export interface CampaignAuditContext {
  actorUserId: string;
  requestId: string;
}

export interface CampaignPersonRecord {
  id: string;
  email: string;
  firstName: string | null;
  lastName: string | null;
}

export interface CampaignTeamRecord {
  id: string;
  name: string;
}

export interface CampaignProgressRecord {
  completedActivities: number;
  totalActivities: number;
  percent: number | null;
}

/**
 * The campaign's own columns plus the composition of its connected workspace
 * read through the 1:1 relation - the manager, assigned teams, and assigned
 * participants that WSP-01 anchors on the workspace - and the progress derived
 * from its activities. `budgetAmount` / `budgetCurrency` are carried so the
 * service can serve them through the sensitive budget routes only.
 */
export interface CampaignRecord {
  id: string;
  workspaceId: string;
  name: string;
  campaignType: CampaignType;
  description: string | null;
  audience: string | null;
  status: CampaignStatus;
  startAt: Date | null;
  endAt: Date | null;
  eventId: string | null;
  departmentId: string | null;
  productName: string | null;
  objectives: string | null;
  projectId: string | null;
  productionId: string | null;
  talentId: string | null;
  budgetAmount: string | null;
  budgetCurrency: string | null;
  progress: CampaignProgressRecord;
  manager: CampaignPersonRecord | null;
  teams: CampaignTeamRecord[];
  participants: CampaignPersonRecord[];
  createdBy: CampaignPersonRecord | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface CampaignActivityRecord {
  id: string;
  campaignId: string;
  name: string;
  description: string | null;
  status: CampaignActivityStatus;
  startAt: Date | null;
  endAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface CampaignVisibility {
  organization: boolean;
  departmentId?: string;
  /** Departments the caller oversees read-only (EVE-229); reads only. */
  overseenDepartmentIds?: string[];
}

export interface ListCampaignsInput {
  visibility?: CampaignVisibility;
  status?: CampaignStatus;
  campaignType?: CampaignType;
  eventId?: string;
  departmentId?: string;
  managerId?: string;
  search?: string;
  startingAfter?: Date;
  startingBefore?: Date;
  page: number;
  pageSize: number;
}

export interface CreateCampaignInput {
  name: string;
  campaignType: CampaignType;
  description?: string;
  audience?: string;
  startAt?: Date;
  endAt?: Date;
  eventId?: string;
  departmentId?: string;
  productName?: string;
  objectives?: string;
  projectId?: string;
  productionId?: string;
  talentId?: string;
  managerId?: string;
  createdById: string;
}

export interface UpdateCampaignFields {
  name?: string;
  campaignType?: CampaignType;
  description?: string | null;
  audience?: string | null;
  startAt?: Date | null;
  endAt?: Date | null;
  eventId?: string | null;
  productName?: string | null;
  objectives?: string | null;
  projectId?: string | null;
  productionId?: string | null;
  talentId?: string | null;
}

export interface ListCampaignActivitiesInput {
  status?: CampaignActivityStatus;
  page: number;
  pageSize: number;
}

export interface CreateCampaignActivityInput {
  name: string;
  description?: string;
  status?: CampaignActivityStatus;
  startAt?: Date;
  endAt?: Date;
}

export interface UpdateCampaignActivityFields {
  name?: string;
  description?: string | null;
  status?: CampaignActivityStatus;
  startAt?: Date | null;
  endAt?: Date | null;
}

const PRISMA_ERROR = {
  uniqueViolation: "P2002",
  foreignKeyViolation: "P2003",
  recordNotFound: "P2025",
} as const;

function isPrismaError(error: unknown, code: string): boolean {
  return (
    error instanceof Prisma.PrismaClientKnownRequestError && error.code === code
  );
}

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * A path segment arrives as a raw string. A value that is not a UUID cannot
 * match any row, and handing it to a `@db.Uuid` column makes the driver raise
 * `22P02`, which would surface as a 500. Treating it as "no such row" keeps
 * those routes returning a clean not-found.
 */
function isUuid(value: string): boolean {
  return UUID_PATTERN.test(value);
}

const CAMPAIGN_UPDATE_SELECT = {
  id: true,
  campaignId: true,
  note: true,
  createdAt: true,
  author: {
    select: { id: true, email: true, firstName: true, lastName: true },
  },
} as const;

const CAMPAIGN_METRIC_SELECT = {
  id: true,
  campaignId: true,
  key: true,
  value: true,
  recordedOn: true,
  sourceNote: true,
  createdAt: true,
  recordedBy: {
    select: { id: true, email: true, firstName: true, lastName: true },
  },
} as const;

const PERSON_SELECT = {
  id: true,
  email: true,
  firstName: true,
  lastName: true,
} as const;

const CAMPAIGN_SELECT = {
  id: true,
  workspaceId: true,
  name: true,
  campaignType: true,
  description: true,
  audience: true,
  status: true,
  startAt: true,
  endAt: true,
  eventId: true,
  departmentId: true,
  productName: true,
  objectives: true,
  projectId: true,
  productionId: true,
  talentId: true,
  budgetAmount: true,
  budgetCurrency: true,
  createdBy: { select: PERSON_SELECT },
  createdAt: true,
  updatedAt: true,
  workspace: {
    select: {
      manager: { select: PERSON_SELECT },
      teams: { select: { team: { select: { id: true, name: true } } } },
      participants: { select: { user: { select: PERSON_SELECT } } },
    },
  },
} as const;

type RawCampaign = Prisma.CampaignGetPayload<{
  select: typeof CAMPAIGN_SELECT;
}>;

const ACTIVITY_SELECT = {
  id: true,
  campaignId: true,
  name: true,
  description: true,
  status: true,
  startAt: true,
  endAt: true,
  createdAt: true,
  updatedAt: true,
} as const;

function visibleWhere(
  visibility: CampaignVisibility | undefined,
): Prisma.CampaignWhereInput {
  if (!visibility || visibility.organization) return {};
  const departmentIds = [
    ...(visibility.departmentId ? [visibility.departmentId] : []),
    ...(visibility.overseenDepartmentIds ?? []),
  ];
  return departmentIds.length > 0
    ? { departmentId: { in: departmentIds } }
    : { id: { in: [] } };
}

function byName(a: CampaignTeamRecord, b: CampaignTeamRecord): number {
  return a.name.localeCompare(b.name);
}

function byPerson(a: CampaignPersonRecord, b: CampaignPersonRecord): number {
  return (
    (a.lastName ?? "").localeCompare(b.lastName ?? "") ||
    (a.firstName ?? "").localeCompare(b.firstName ?? "") ||
    a.email.localeCompare(b.email)
  );
}

const EMPTY_PROGRESS: CampaignProgressRecord = {
  completedActivities: 0,
  totalActivities: 0,
  percent: null,
};

/**
 * Cancelled activities are excluded; `percent` is the rounded share of the
 * remaining activities that are completed, and null when none remain.
 */
function progressFromCounts(
  counts: Partial<Record<CampaignActivityStatus, number>>,
): CampaignProgressRecord {
  const completed = counts[CampaignActivityStatus.COMPLETED] ?? 0;
  const total =
    (counts[CampaignActivityStatus.PLANNED] ?? 0) +
    (counts[CampaignActivityStatus.IN_PROGRESS] ?? 0) +
    completed;
  return {
    completedActivities: completed,
    totalActivities: total,
    percent: total === 0 ? null : Math.round((completed * 100) / total),
  };
}

function toRecord(
  raw: RawCampaign,
  progress: CampaignProgressRecord,
): CampaignRecord {
  return {
    id: raw.id,
    workspaceId: raw.workspaceId,
    name: raw.name,
    campaignType: raw.campaignType,
    description: raw.description,
    audience: raw.audience,
    status: raw.status,
    startAt: raw.startAt,
    endAt: raw.endAt,
    eventId: raw.eventId,
    departmentId: raw.departmentId,
    productName: raw.productName,
    objectives: raw.objectives,
    projectId: raw.projectId,
    productionId: raw.productionId,
    talentId: raw.talentId,
    budgetAmount:
      raw.budgetAmount === null ? null : raw.budgetAmount.toFixed(2),
    // A `@db.Char(3)` reads back space-padded; the CHECK guarantees three
    // letters, so trimming is safe and keeps the contract clean.
    budgetCurrency:
      raw.budgetCurrency === null ? null : raw.budgetCurrency.trim(),
    progress,
    manager: raw.workspace.manager ?? null,
    teams: raw.workspace.teams
      .map((assignment) => assignment.team)
      .sort(byName),
    participants: raw.workspace.participants
      .map((participation) => participation.user)
      .sort(byPerson),
    createdBy: raw.createdBy ?? null,
    createdAt: raw.createdAt,
    updatedAt: raw.updatedAt,
  };
}

/** Only the keys the caller actually set, so a patch never nulls a field by omission. */
function updateData(fields: UpdateCampaignFields): Prisma.CampaignUpdateInput {
  const data: Prisma.CampaignUpdateInput = {};
  if (fields.name !== undefined) data.name = fields.name;
  if (fields.campaignType !== undefined) {
    data.campaignType = fields.campaignType;
  }
  if (fields.description !== undefined) data.description = fields.description;
  if (fields.audience !== undefined) data.audience = fields.audience;
  if (fields.startAt !== undefined) data.startAt = fields.startAt;
  if (fields.endAt !== undefined) data.endAt = fields.endAt;
  if (fields.productName !== undefined) data.productName = fields.productName;
  if (fields.objectives !== undefined) data.objectives = fields.objectives;
  // Project, production and artist links are written by `update`, in steps.
  if (fields.eventId !== undefined) {
    data.event = fields.eventId
      ? { connect: { id: fields.eventId } }
      : { disconnect: true };
  }
  return data;
}

function activityUpdateData(
  fields: UpdateCampaignActivityFields,
): Prisma.CampaignActivityUpdateInput {
  const data: Prisma.CampaignActivityUpdateInput = {};
  if (fields.name !== undefined) data.name = fields.name;
  if (fields.description !== undefined) data.description = fields.description;
  if (fields.status !== undefined) data.status = fields.status;
  if (fields.startAt !== undefined) data.startAt = fields.startAt;
  if (fields.endAt !== undefined) data.endAt = fields.endAt;
  return data;
}

@Injectable()
export class CampaignsRepository {
  constructor(
    private readonly db: DatabaseService,
    private readonly audit: AuditWriterService,
  ) {}

  /**
   * Activity counts per campaign in one grouped query, so a page of campaigns
   * costs one extra round trip rather than one per row.
   */
  private async progressFor(
    campaignIds: string[],
  ): Promise<Map<string, CampaignProgressRecord>> {
    const result = new Map<string, CampaignProgressRecord>();
    if (campaignIds.length === 0) {
      return result;
    }
    const groups = await this.db.campaignActivity.groupBy({
      by: ["campaignId", "status"],
      where: { campaignId: { in: campaignIds }, archivedAt: null },
      _count: { _all: true },
    });
    const counts = new Map<
      string,
      Partial<Record<CampaignActivityStatus, number>>
    >();
    for (const group of groups) {
      const forCampaign = counts.get(group.campaignId) ?? {};
      forCampaign[group.status] = group._count._all;
      counts.set(group.campaignId, forCampaign);
    }
    for (const id of campaignIds) {
      const forCampaign = counts.get(id);
      result.set(
        id,
        forCampaign ? progressFromCounts(forCampaign) : EMPTY_PROGRESS,
      );
    }
    return result;
  }

  /** Reads one campaign's derived progress; an unknown id has no progress. */
  private async readRecord(raw: RawCampaign): Promise<CampaignRecord> {
    const progress = await this.progressFor([raw.id]);
    return toRecord(raw, progress.get(raw.id) ?? EMPTY_PROGRESS);
  }

  async list(
    input: ListCampaignsInput,
  ): Promise<{ items: CampaignRecord[]; total: number }> {
    const startAt =
      input.startingAfter || input.startingBefore
        ? {
            ...(input.startingAfter ? { gte: input.startingAfter } : {}),
            ...(input.startingBefore ? { lte: input.startingBefore } : {}),
          }
        : undefined;

    const where: Prisma.CampaignWhereInput = {
      AND: [visibleWhere(input.visibility), { archivedAt: null }],
      ...(input.status ? { status: input.status } : {}),
      ...(input.campaignType ? { campaignType: input.campaignType } : {}),
      ...(input.eventId ? { eventId: input.eventId } : {}),
      ...(input.departmentId ? { departmentId: input.departmentId } : {}),
      ...(input.managerId ? { workspace: { managerId: input.managerId } } : {}),
      ...(input.search
        ? { name: { contains: input.search, mode: "insensitive" } }
        : {}),
      ...(startAt ? { startAt } : {}),
    };

    const [items, total] = await Promise.all([
      this.db.campaign.findMany({
        where,
        select: CAMPAIGN_SELECT,
        // `id` (uuidv7) is the tiebreaker so pagination stays deterministic
        // when two campaigns share a `created_at` value.
        orderBy: [{ createdAt: "asc" }, { id: "asc" }],
        skip: (input.page - 1) * input.pageSize,
        take: input.pageSize,
      }),
      this.db.campaign.count({ where }),
    ]);

    const progress = await this.progressFor(items.map((item) => item.id));
    return {
      items: items.map((item) =>
        toRecord(item, progress.get(item.id) ?? EMPTY_PROGRESS),
      ),
      total,
    };
  }

  async findById(id: string): Promise<CampaignRecord | null> {
    if (!isUuid(id)) {
      return null;
    }
    const raw = await this.db.campaign.findFirst({
      where: { id, archivedAt: null },
      select: CAMPAIGN_SELECT,
    });
    return raw ? this.readRecord(raw) : null;
  }

  private async eventExists(id: string): Promise<boolean> {
    if (!isUuid(id)) {
      return false;
    }
    const event = await this.db.event.findFirst({
      where: { id, archivedAt: null },
      select: { id: true },
    });
    return event !== null;
  }

  async findUserDepartmentId(userId: string): Promise<string | null> {
    if (!isUuid(userId)) return null;
    const user = await this.db.user.findUnique({
      where: { id: userId },
      select: { departmentId: true },
    });
    return user?.departmentId ?? null;
  }

  async departmentExists(id: string): Promise<boolean> {
    if (!isUuid(id)) return false;
    return (await this.db.department.count({ where: { id } })) === 1;
  }

  /**
   * Creates the connected workspace (`kind = CAMPAIGN`) and the campaign
   * together in one transaction - the pairing CAM-01 assigned to this slice.
   * The optional `eventId` is resolved before the transaction, rather than
   * caught from the transaction's own foreign-key violation, because the
   * workspace's `managerId` FK and the campaign's `eventId` FK could otherwise
   * both fail in the same statement with no reliable way to tell them apart.
   */
  async create(
    input: CreateCampaignInput,
  ): Promise<
    CampaignRecord | "manager_not_found" | "event_not_found" | "link_not_found"
  > {
    if (input.eventId && !(await this.eventExists(input.eventId))) {
      return "event_not_found";
    }
    if (await this.relatedLinkMissing(input)) {
      return "link_not_found";
    }
    try {
      const created = await this.db.$transaction(async (tx) => {
        const workspace = await tx.workspace.create({
          data: {
            kind: WorkspaceKind.CAMPAIGN,
            ...(input.managerId ? { managerId: input.managerId } : {}),
          },
          select: { id: true },
        });
        return tx.campaign.create({
          data: {
            workspaceId: workspace.id,
            name: input.name,
            campaignType: input.campaignType,
            createdById: input.createdById,
            ...(input.description !== undefined
              ? { description: input.description }
              : {}),
            ...(input.audience !== undefined
              ? { audience: input.audience }
              : {}),
            ...(input.startAt !== undefined ? { startAt: input.startAt } : {}),
            ...(input.endAt !== undefined ? { endAt: input.endAt } : {}),
            ...(input.eventId ? { eventId: input.eventId } : {}),
            ...(input.departmentId ? { departmentId: input.departmentId } : {}),
            ...(input.productName !== undefined
              ? { productName: input.productName }
              : {}),
            ...(input.objectives !== undefined
              ? { objectives: input.objectives }
              : {}),
            ...(input.projectId ? { projectId: input.projectId } : {}),
            ...(input.productionId ? { productionId: input.productionId } : {}),
            ...(input.talentId ? { talentId: input.talentId } : {}),
          },
          select: CAMPAIGN_SELECT,
        });
      });
      // A new campaign has no activities yet.
      return toRecord(created, EMPTY_PROGRESS);
    } catch (error) {
      if (isPrismaError(error, PRISMA_ERROR.foreignKeyViolation)) {
        return "manager_not_found";
      }
      throw error;
    }
  }

  /** True when a project, production or artist this input names does not exist. */
  async relatedLinkMissing(input: {
    projectId?: string | null | undefined;
    productionId?: string | null | undefined;
    talentId?: string | null | undefined;
  }): Promise<boolean> {
    const checks: Promise<number>[] = [];
    if (input.projectId) {
      checks.push(this.db.project.count({ where: { id: input.projectId } }));
    }
    if (input.productionId) {
      checks.push(
        this.db.production.count({ where: { id: input.productionId } }),
      );
    }
    if (input.talentId) {
      checks.push(this.db.talent.count({ where: { id: input.talentId } }));
    }
    const counts = await Promise.all(checks);
    return counts.some((count) => count === 0);
  }

  async update(
    id: string,
    fields: UpdateCampaignFields,
  ): Promise<
    CampaignRecord | "not_found" | "event_not_found" | "link_not_found"
  > {
    if (!isUuid(id)) {
      return "not_found";
    }
    // Only a link being added or moved is checked; an existing archived link is kept.
    const current = await this.db.campaign.findFirst({
      where: { id, archivedAt: null },
      select: { eventId: true },
    });
    if (!current) {
      return "not_found";
    }
    if (
      fields.eventId !== undefined &&
      fields.eventId !== null &&
      fields.eventId !== current.eventId &&
      !(await this.eventExists(fields.eventId))
    ) {
      return "event_not_found";
    }
    if (
      await this.relatedLinkMissing({
        projectId: fields.projectId,
        productionId: fields.productionId,
        talentId: fields.talentId,
      })
    ) {
      return "link_not_found";
    }
    try {
      const updated = await this.db.$transaction(async (tx) => {
        // The one-related-link CHECK is evaluated per statement, and Prisma may
        // run a connect before a disconnect in one update. So a link change is
        // written in two checked steps: clear all three, then set the final
        // values. Both happen in this transaction.
        if (
          fields.projectId !== undefined ||
          fields.productionId !== undefined ||
          fields.talentId !== undefined
        ) {
          const existing = await tx.campaign.findFirstOrThrow({
            where: { id },
            select: { projectId: true, productionId: true, talentId: true },
          });
          const next = {
            projectId:
              fields.projectId !== undefined
                ? fields.projectId
                : existing.projectId,
            productionId:
              fields.productionId !== undefined
                ? fields.productionId
                : existing.productionId,
            talentId:
              fields.talentId !== undefined
                ? fields.talentId
                : existing.talentId,
          };
          await tx.campaign.updateMany({
            where: { id },
            data: { projectId: null, productionId: null, talentId: null },
          });
          await tx.campaign.updateMany({ where: { id }, data: next });
        }
        return tx.campaign.update({
          where: { id, archivedAt: null },
          data: updateData(fields),
          select: CAMPAIGN_SELECT,
        });
      });
      return await this.readRecord(updated);
    } catch (error) {
      if (isPrismaError(error, PRISMA_ERROR.recordNotFound)) {
        return "not_found";
      }
      throw error;
    }
  }

  /**
   * Moves the campaign from `expectedStatus` to `status` atomically: the write
   * only applies while the row still has the status the caller validated the
   * transition against. Without that guard two concurrent transitions both
   * pass the lifecycle check on the same stale read and the later write wins,
   * for example a Cancelled campaign reactivated by a racing request. Returns
   * `"status_changed"` when another request moved the campaign first.
   */
  async updateStatus(
    id: string,
    expectedStatus: CampaignStatus,
    status: CampaignStatus,
    audit?: CampaignAuditContext,
  ): Promise<CampaignRecord | "not_found" | "status_changed"> {
    if (!isUuid(id)) {
      return "not_found";
    }
    const count = await this.db.$transaction(async (tx) => {
      const moved = await tx.campaign.updateMany({
        where: { id, status: expectedStatus, archivedAt: null },
        data: { status },
      });
      if (moved.count > 0 && audit) {
        const { workspaceId, campaignType } =
          await tx.campaign.findUniqueOrThrow({
            where: { id },
            select: { workspaceId: true, campaignType: true },
          });
        await this.audit.append(tx, {
          actorKind: AuditActorKind.USER,
          actorUserId: audit.actorUserId,
          requestId: audit.requestId,
          action: "campaign.status_changed",
          resourceType: "campaign",
          resourceId: id,
          workspaceContext: workspaceId,
          outcome: AuditOutcome.SUCCEEDED,
          metadata: { from: expectedStatus, to: status, campaignType },
        });
      }
      return moved.count;
    });
    const record = await this.findById(id);
    if (!record) {
      return "not_found";
    }
    return count === 0 ? "status_changed" : record;
  }

  /** The updates log for one campaign, newest first. Append-only. */
  async listUpdates(campaignId: string, page: number, pageSize: number) {
    if (!isUuid(campaignId)) return { items: [], total: 0 };
    const where: Prisma.CampaignUpdateWhereInput = { campaignId };
    const [items, total] = await Promise.all([
      this.db.campaignUpdate.findMany({
        where,
        select: CAMPAIGN_UPDATE_SELECT,
        orderBy: [{ createdAt: "desc" }, { id: "desc" }],
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
      this.db.campaignUpdate.count({ where }),
    ]);
    return { items, total };
  }

  async createUpdate(campaignId: string, authorId: string, note: string) {
    return this.db.campaignUpdate.create({
      data: { campaignId, authorId, note },
      select: CAMPAIGN_UPDATE_SELECT,
    });
  }

  /** Recorded metrics for one campaign, latest recording day first. Append-only. */
  async listMetrics(
    campaignId: string,
    key: CampaignMetricKey | undefined,
    page: number,
    pageSize: number,
  ) {
    if (!isUuid(campaignId)) return { items: [], total: 0 };
    const where: Prisma.CampaignMetricWhereInput = {
      campaignId,
      ...(key ? { key } : {}),
    };
    const [items, total] = await Promise.all([
      this.db.campaignMetric.findMany({
        where,
        select: CAMPAIGN_METRIC_SELECT,
        orderBy: [
          { recordedOn: "desc" },
          { createdAt: "desc" },
          { id: "desc" },
        ],
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
      this.db.campaignMetric.count({ where }),
    ]);
    return { items, total };
  }

  async createMetric(
    campaignId: string,
    input: {
      key: CampaignMetricKey;
      value: string;
      recordedOn: Date;
      sourceNote: string | null;
      recordedById: string;
    },
  ) {
    return this.db.campaignMetric.create({
      data: { campaignId, ...input },
      select: CAMPAIGN_METRIC_SELECT,
    });
  }

  async setBudget(
    id: string,
    amount: string | null,
    currency: string | null,
  ): Promise<CampaignRecord | "not_found"> {
    if (!isUuid(id)) {
      return "not_found";
    }
    try {
      const updated = await this.db.campaign.update({
        where: { id, archivedAt: null },
        data: { budgetAmount: amount, budgetCurrency: currency },
        select: CAMPAIGN_SELECT,
      });
      return await this.readRecord(updated);
    } catch (error) {
      if (isPrismaError(error, PRISMA_ERROR.recordNotFound)) {
        return "not_found";
      }
      throw error;
    }
  }

  /**
   * Removes the campaign (its activities cascade) and then its connected
   * workspace in one transaction. The workspace FK is `ON DELETE RESTRICT`, so
   * the campaign must go first; an attached managed file also `RESTRICT`s the
   * workspace delete, reported as `"has_managed_files"` (the same accounting
   * `EventsRepository` does).
   */
  async delete(
    id: string,
    archive: ArchiveHook,
  ): Promise<"deleted" | "archived" | "not_found" | "has_managed_files"> {
    if (!isUuid(id)) {
      return "not_found";
    }
    try {
      return await this.db.$transaction(async (tx) => {
        const campaign = await tx.campaign.findFirst({
          where: { id, archivedAt: null },
          select: {
            workspaceId: true,
            name: true,
            workspace: { select: { managerId: true } },
          },
        });
        if (!campaign) return "not_found";
        // Talent assignment history references the campaign's activities; the campaign is kept, so it is archived instead of deleted.
        if (
          (await tx.promotionActivityTalent.count({
            where: { promotionActivity: { campaignId: id } },
          })) > 0
        ) {
          await tx.campaign.update({
            where: { id },
            data: { archivedAt: new Date() },
          });
          const activities = await tx.campaignActivity.findMany({
            where: { campaignId: id, promotion: { isNot: null } },
            select: { id: true, name: true },
          });
          await archive(tx, {
            label: campaign.name,
            workspaceManagerId: campaign.workspace.managerId,
            works: activities.map((activity) => ({
              kind: "PROMOTION" as const,
              workId: activity.id,
              workName: activity.name,
            })),
          });
          return "archived";
        }
        // A detached/rejected file remains for retention cleanup, but no
        // longer needs to retain a campaign workspace that is being removed.
        await tx.managedFile.updateMany({
          where: {
            intentWorkspaceId: campaign.workspaceId,
            state: "UNAVAILABLE",
          },
          data: { intentWorkspaceId: null },
        });
        await tx.campaign.delete({ where: { id } });
        await tx.workspace.delete({ where: { id: campaign.workspaceId } });
        return "deleted";
      });
    } catch (error) {
      if (isPrismaError(error, PRISMA_ERROR.recordNotFound)) {
        return "not_found";
      }
      if (isPrismaError(error, PRISMA_ERROR.foreignKeyViolation)) {
        return "has_managed_files";
      }
      throw error;
    }
  }

  async listActivities(
    campaignId: string,
    input: ListCampaignActivitiesInput,
  ): Promise<{ items: CampaignActivityRecord[]; total: number }> {
    if (!isUuid(campaignId)) {
      return { items: [], total: 0 };
    }
    const where: Prisma.CampaignActivityWhereInput = {
      campaignId,
      archivedAt: null,
      ...(input.status ? { status: input.status } : {}),
    };
    const [items, total] = await Promise.all([
      this.db.campaignActivity.findMany({
        where,
        select: ACTIVITY_SELECT,
        // Scheduled work first (unscheduled last), then creation order; `id`
        // (uuidv7) keeps pagination deterministic.
        orderBy: [
          { startAt: { sort: "asc", nulls: "last" } },
          { createdAt: "asc" },
          { id: "asc" },
        ],
        skip: (input.page - 1) * input.pageSize,
        take: input.pageSize,
      }),
      this.db.campaignActivity.count({ where }),
    ]);
    return { items, total };
  }

  async findActivity(
    campaignId: string,
    activityId: string,
  ): Promise<CampaignActivityRecord | null> {
    if (!isUuid(campaignId) || !isUuid(activityId)) {
      return null;
    }
    return this.db.campaignActivity.findFirst({
      where: { id: activityId, campaignId, archivedAt: null },
      select: ACTIVITY_SELECT,
    });
  }

  async createActivity(
    campaignId: string,
    input: CreateCampaignActivityInput,
  ): Promise<CampaignActivityRecord | "campaign_not_found"> {
    if (!isUuid(campaignId)) {
      return "campaign_not_found";
    }
    try {
      return await this.db.campaignActivity.create({
        data: {
          campaignId,
          name: input.name,
          ...(input.description !== undefined
            ? { description: input.description }
            : {}),
          ...(input.status !== undefined ? { status: input.status } : {}),
          ...(input.startAt !== undefined ? { startAt: input.startAt } : {}),
          ...(input.endAt !== undefined ? { endAt: input.endAt } : {}),
        },
        select: ACTIVITY_SELECT,
      });
    } catch (error) {
      if (isPrismaError(error, PRISMA_ERROR.foreignKeyViolation)) {
        return "campaign_not_found";
      }
      throw error;
    }
  }

  async updateActivity(
    campaignId: string,
    activityId: string,
    fields: UpdateCampaignActivityFields,
  ): Promise<CampaignActivityRecord | "not_found"> {
    if (!isUuid(campaignId) || !isUuid(activityId)) {
      return "not_found";
    }
    try {
      return await this.db.campaignActivity.update({
        where: { id: activityId, campaignId, archivedAt: null },
        data: activityUpdateData(fields),
        select: ACTIVITY_SELECT,
      });
    } catch (error) {
      if (isPrismaError(error, PRISMA_ERROR.recordNotFound)) {
        return "not_found";
      }
      throw error;
    }
  }

  /**
   * Deletes an activity. An activity with talent assignment history is archived
   * instead, so the assignments and their work-item name snapshots are kept.
   */
  async deleteActivity(
    campaignId: string,
    activityId: string,
    archive: ArchiveHook,
  ): Promise<"deleted" | "archived" | "not_found"> {
    if (!isUuid(campaignId) || !isUuid(activityId)) {
      return "not_found";
    }
    try {
      return await this.db.$transaction(async (tx) => {
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
        if (
          (await tx.promotionActivityTalent.count({
            where: { campaignActivityId: activityId },
          })) > 0
        ) {
          await tx.campaignActivity.update({
            where: { id: activityId },
            data: { archivedAt: new Date() },
          });
          await archive(tx, {
            label: activity.name,
            workspaceManagerId: activity.campaign.workspace.managerId,
            works: [
              {
                kind: "PROMOTION",
                workId: activityId,
                workName: activity.name,
              },
            ],
          });
          return "archived";
        }
        await tx.campaignActivity.delete({
          where: { id: activityId, campaignId },
        });
        return "deleted";
      });
    } catch (error) {
      if (isPrismaError(error, PRISMA_ERROR.recordNotFound)) {
        return "not_found";
      }
      throw error;
    }
  }
}
