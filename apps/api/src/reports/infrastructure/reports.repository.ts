import { Injectable } from "@nestjs/common";

import {
  AuditActorKind,
  AuditOutcome,
  Prisma,
  type ReportReviewOutcome,
  type ReportStatus,
  type ReportType,
} from "../../generated/prisma/client.js";
import { AuditWriterService } from "../../audit/audit-writer.service.js";
import { DatabaseService } from "../../database/database.service.js";
import {
  reportConcurrentChange,
  reportDuplicate,
  reportInvalidTransition,
} from "../reports.errors.js";
import type { Sections } from "../reports.policy.js";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const include = {
  workspaces: { select: { workspaceId: true } },
  reviews: {
    orderBy: [{ reviewedAt: "asc" }, { id: "asc" }],
    select: {
      id: true,
      reviewerId: true,
      outcome: true,
      note: true,
      reviewedAt: true,
    },
  },
} satisfies Prisma.ReportInclude;
export type ReportRecord = Prisma.ReportGetPayload<{ include: typeof include }>;

export interface ReportVisibility {
  organization: boolean;
  departmentId?: string;
  selfUserId?: string;
}

export interface ListReportsInput {
  visibility: ReportVisibility;
  type?: ReportType;
  status?: ReportStatus;
  authorId?: string;
  departmentId?: string;
  workspaceId?: string;
  periodFrom?: Date;
  periodTo?: Date;
  page: number;
  pageSize: number;
}

export interface ReportWrite {
  type: ReportType;
  title: string;
  periodStart: Date;
  periodEnd: Date;
  departmentId: string | null;
  workspaceIds: string[];
  sections: Sections;
}

function visibilityWhere(
  visibility: ReportVisibility,
): Prisma.ReportWhereInput {
  if (visibility.organization) return {};
  const or: Prisma.ReportWhereInput[] = [];
  if (visibility.departmentId)
    or.push({ departmentId: visibility.departmentId });
  if (visibility.selfUserId) or.push({ authorId: visibility.selfUserId });
  return { OR: or };
}

@Injectable()
export class ReportsRepository {
  constructor(
    private readonly db: DatabaseService,
    private readonly audit: AuditWriterService,
  ) {}

  async findUserDepartmentId(userId: string): Promise<string | null> {
    return (
      (
        await this.db.user.findUnique({
          where: { id: userId },
          select: { departmentId: true },
        })
      )?.departmentId ?? null
    );
  }

  async departmentExists(id: string): Promise<boolean> {
    if (!UUID.test(id)) return false;
    return (await this.db.department.count({ where: { id } })) > 0;
  }

  async findById(id: string): Promise<ReportRecord | null> {
    if (!UUID.test(id)) return null;
    return this.db.report.findUnique({ where: { id }, include });
  }

  async list(
    input: ListReportsInput,
  ): Promise<{ items: ReportRecord[]; total: number }> {
    const where: Prisma.ReportWhereInput = {
      ...visibilityWhere(input.visibility),
      ...(input.type ? { type: input.type } : {}),
      ...(input.status ? { status: input.status } : {}),
      ...(input.authorId ? { authorId: input.authorId } : {}),
      ...(input.departmentId ? { departmentId: input.departmentId } : {}),
      ...(input.workspaceId
        ? { workspaces: { some: { workspaceId: input.workspaceId } } }
        : {}),
      ...(input.periodFrom || input.periodTo
        ? {
            periodStart: {
              ...(input.periodFrom ? { gte: input.periodFrom } : {}),
              ...(input.periodTo ? { lte: input.periodTo } : {}),
            },
          }
        : {}),
    };
    const [items, total] = await this.db.$transaction([
      this.db.report.findMany({
        where,
        include,
        orderBy: [{ periodStart: "desc" }, { id: "desc" }],
        skip: (input.page - 1) * input.pageSize,
        take: input.pageSize,
      }),
      this.db.report.count({ where }),
    ]);
    return { items, total };
  }

  async create(authorId: string, data: ReportWrite): Promise<ReportRecord> {
    try {
      return await this.db.report.create({
        data: {
          authorId,
          type: data.type,
          title: data.title,
          periodStart: data.periodStart,
          periodEnd: data.periodEnd,
          departmentId: data.departmentId,
          ...data.sections,
          workspaces: {
            create: data.workspaceIds.map((workspaceId) => ({ workspaceId })),
          },
        },
        include,
      });
    } catch (error) {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === "P2002"
      )
        throw reportDuplicate();
      throw error;
    }
  }

  async updateDraft(
    id: string,
    expectedUpdatedAt: Date,
    data: ReportWrite,
  ): Promise<ReportRecord> {
    try {
      return await this.db.$transaction(async (tx) => {
        const changed = await tx.report.updateMany({
          where: {
            id,
            updatedAt: expectedUpdatedAt,
            status: { in: ["DRAFT", "CHANGES_REQUESTED"] },
          },
          data: {
            type: data.type,
            title: data.title,
            periodStart: data.periodStart,
            periodEnd: data.periodEnd,
            departmentId: data.departmentId,
            ...data.sections,
            status: "DRAFT",
            submittedAt: null,
            reviewedAt: null,
            reviewerId: null,
            updatedAt: new Date(),
          },
        });
        if (changed.count !== 1) throw reportConcurrentChange();
        await tx.reportWorkspace.deleteMany({ where: { reportId: id } });
        if (data.workspaceIds.length)
          await tx.reportWorkspace.createMany({
            data: data.workspaceIds.map((workspaceId) => ({
              reportId: id,
              workspaceId,
            })),
          });
        return tx.report.findUniqueOrThrow({ where: { id }, include });
      });
    } catch (error) {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === "P2002"
      )
        throw reportDuplicate();
      throw error;
    }
  }

  async submit(
    id: string,
    expectedUpdatedAt: Date,
    actorId: string,
    requestId: string,
  ): Promise<ReportRecord> {
    return this.db.$transaction(async (tx) => {
      const changed = await tx.report.updateMany({
        where: {
          id,
          updatedAt: expectedUpdatedAt,
          status: "DRAFT",
        },
        data: {
          status: "SUBMITTED",
          submittedAt: new Date(),
          reviewedAt: null,
          reviewerId: null,
          updatedAt: new Date(),
        },
      });
      if (changed.count !== 1) throw reportConcurrentChange();
      await this.audit.append(tx, {
        action: "report.submitted",
        actorKind: AuditActorKind.USER,
        actorUserId: actorId,
        requestId,
        resourceType: "report",
        resourceId: id,
        outcome: AuditOutcome.SUCCEEDED,
      });
      return tx.report.findUniqueOrThrow({ where: { id }, include });
    });
  }

  async review(
    id: string,
    expectedUpdatedAt: Date,
    reviewerId: string,
    outcome: ReportReviewOutcome,
    requestId: string,
    note?: string,
  ): Promise<ReportRecord> {
    return this.db.$transaction(async (tx) => {
      const reviewedAt = new Date();
      const changed = await tx.report.updateMany({
        where: { id, updatedAt: expectedUpdatedAt, status: "SUBMITTED" },
        data: {
          status: outcome,
          reviewerId,
          reviewedAt,
          updatedAt: reviewedAt,
        },
      });
      if (changed.count !== 1) throw reportInvalidTransition();
      await tx.reportReview.create({
        data: {
          reportId: id,
          reviewerId,
          outcome,
          ...(note ? { note } : {}),
          reviewedAt,
        },
      });
      await this.audit.append(tx, {
        action:
          outcome === "REVIEWED"
            ? "report.reviewed"
            : "report.changes_requested",
        actorKind: AuditActorKind.USER,
        actorUserId: reviewerId,
        requestId,
        resourceType: "report",
        resourceId: id,
        outcome: AuditOutcome.SUCCEEDED,
      });
      return tx.report.findUniqueOrThrow({ where: { id }, include });
    });
  }
}
