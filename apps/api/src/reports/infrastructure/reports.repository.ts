import { Injectable } from "@nestjs/common";

import {
  AuditActorKind,
  AuditOutcome,
  OutboxActorKind,
  Prisma,
  type ReportReviewOutcome,
  type ReportStatus,
  type ReportType,
} from "../../generated/prisma/client.js";
import { AuditWriterService } from "../../audit/audit-writer.service.js";
import { OutboxWriterService } from "../../outbox/outbox-writer.service.js";
import { DatabaseService } from "../../database/database.service.js";
import { platformRole } from "../../common/security/department-access.policy.js";
import {
  reportConcurrentChange,
  reportDuplicate,
  reportInvalidTransition,
} from "../reports.errors.js";
import type { Sections } from "../reports.policy.js";
import { ReportsSmsService } from "../reports-sms.service.js";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const PERSON = {
  id: true,
  email: true,
  firstName: true,
  lastName: true,
} as const;
const include = {
  workspaces: { select: { workspaceId: true } },
  author: { select: PERSON },
  reportTo: { select: PERSON },
  sources: {
    select: {
      sourceReport: {
        select: {
          id: true,
          title: true,
          status: true,
          type: true,
          periodStart: true,
          periodEnd: true,
          authorId: true,
          departmentId: true,
          author: { select: PERSON },
        },
      },
    },
  },
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
  /** Departments the caller oversees read-only (EVE-229). */
  overseenDepartmentIds?: string[];
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
  description: string | null;
  periodStart: Date;
  periodEnd: Date;
  departmentId: string | null;
  workspaceIds: string[];
  sections: Sections;
  /** Consolidation sources (Admin only); undefined leaves them untouched. */
  sourceReportIds?: string[];
}

function visibilityWhere(
  visibility: ReportVisibility,
): Prisma.ReportWhereInput {
  if (visibility.organization) return {};
  const or: Prisma.ReportWhereInput[] = [];
  if (visibility.departmentId)
    or.push({ departmentId: visibility.departmentId });
  if (visibility.overseenDepartmentIds?.length)
    or.push({ departmentId: { in: visibility.overseenDepartmentIds } });
  if (visibility.selfUserId) or.push({ authorId: visibility.selfUserId });
  return { OR: or };
}

@Injectable()
export class ReportsRepository {
  constructor(
    private readonly db: DatabaseService,
    private readonly audit: AuditWriterService,
    private readonly outbox: OutboxWriterService,
    private readonly reportsSms: ReportsSmsService,
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

  /** `SELECT ... FOR UPDATE` + a re-check against the current visibility,
   * inside the caller's open transaction - the same concurrency-safe
   * attachment-finalization lock `expenses.repository.ts` uses, so a
   * finalize can never race a concurrent department reassignment past the
   * caller's earlier authorization check. */
  async lockAttachmentAccess(
    tx: Prisma.TransactionClient,
    reportId: string,
    visibility: ReportVisibility,
  ): Promise<"visible" | "forbidden" | "not_found"> {
    if (!UUID.test(reportId)) return "not_found";
    const locked = await tx.$queryRaw<Array<{ id: string }>>(
      Prisma.sql`SELECT id FROM reports WHERE id = ${reportId}::uuid FOR UPDATE`,
    );
    if (locked.length !== 1) return "not_found";
    const visible = await tx.report.count({
      where: { AND: [{ id: reportId }, visibilityWhere(visibility)] },
    });
    return visible === 1 ? "visible" : "forbidden";
  }

  async createAttachment(
    tx: Prisma.TransactionClient,
    input: { reportId: string; fileId: string; attachedById: string },
  ): Promise<void> {
    await tx.reportAttachment.create({
      data: {
        attachedById: input.attachedById,
        managedFileId: input.fileId,
        reportId: input.reportId,
      },
    });
  }

  async hasAttachment(reportId: string, fileId: string): Promise<boolean> {
    if (!UUID.test(reportId) || !UUID.test(fileId)) return false;
    return (
      (await this.db.reportAttachment.count({
        where: { reportId, managedFileId: fileId },
      })) === 1
    );
  }

  async listAttachmentFileIds(
    reportId: string,
    page: number,
    pageSize: number,
  ): Promise<{ fileIds: string[]; total: number }> {
    if (!UUID.test(reportId)) return { fileIds: [], total: 0 };
    const where: Prisma.ReportAttachmentWhereInput = { reportId };
    const [attachments, total] = await Promise.all([
      this.db.reportAttachment.findMany({
        where,
        select: { managedFileId: true },
        orderBy: [{ createdAt: "desc" }, { id: "desc" }],
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
      this.db.reportAttachment.count({ where }),
    ]);
    return {
      fileIds: attachments.map(({ managedFileId }) => managedFileId),
      total,
    };
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
          description: data.description,
          periodStart: data.periodStart,
          periodEnd: data.periodEnd,
          departmentId: data.departmentId,
          ...data.sections,
          workspaces: {
            create: data.workspaceIds.map((workspaceId) => ({ workspaceId })),
          },
          ...(data.sourceReportIds?.length
            ? {
                sources: {
                  create: data.sourceReportIds.map((sourceReportId) => ({
                    sourceReportId,
                  })),
                },
              }
            : {}),
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
            description: data.description,
            periodStart: data.periodStart,
            periodEnd: data.periodEnd,
            departmentId: data.departmentId,
            ...data.sections,
            status: "DRAFT",
            submittedAt: null,
            reviewedAt: null,
            reviewerId: null,
            reportToId: null,
            updatedAt: new Date(),
          },
        });
        if (changed.count !== 1) throw reportConcurrentChange();
        if (data.sourceReportIds !== undefined) {
          await tx.reportSource.deleteMany({ where: { reportId: id } });
          if (data.sourceReportIds.length)
            await tx.reportSource.createMany({
              data: data.sourceReportIds.map((sourceReportId) => ({
                reportId: id,
                sourceReportId,
              })),
            });
        }
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
    reportToId: string | null,
  ): Promise<ReportRecord> {
    return this.db.$transaction(async (tx) => {
      const submittedAt = new Date();
      const changed = await tx.report.updateMany({
        where: {
          id,
          updatedAt: expectedUpdatedAt,
          status: "DRAFT",
        },
        data: {
          status: "SUBMITTED",
          submittedAt,
          reviewedAt: null,
          reviewerId: null,
          reportToId,
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
      await this.outbox.append(tx, {
        name: "report.submitted",
        version: 1,
        actorKind: OutboxActorKind.USER,
        actorUserId: actorId,
        correlationId: requestId,
        resourceType: "report",
        resourceId: id,
        consumers: [{ consumerName: "notifications", consumerVersion: 1 }],
      });
      await this.reportsSms.enqueueSubmitted(tx, {
        reportId: id,
        designatedRecipientId: reportToId,
        actorUserId: actorId,
        submittedAt,
        requestId,
      });
      return tx.report.findUniqueOrThrow({ where: { id }, include });
    });
  }

  /** Re-routes a submitted, not-yet-reviewed report to another recipient
   * (Super Admin only, checked by the service). Audited, and the new
   * recipient is notified through the usual report.submitted event. */
  async setRecipient(
    id: string,
    reportToId: string,
    actorId: string,
    requestId: string,
  ): Promise<ReportRecord> {
    return this.db.$transaction(async (tx) => {
      const before = await tx.report.findUnique({
        where: { id },
        select: { reportToId: true, submittedAt: true },
      });
      const changed = await tx.report.updateMany({
        where: { id, status: "SUBMITTED" },
        data: { reportToId, reviewerId: null, updatedAt: new Date() },
      });
      if (changed.count !== 1) throw reportInvalidTransition();
      await this.audit.append(tx, {
        action: "report.recipient_changed",
        actorKind: AuditActorKind.USER,
        actorUserId: actorId,
        requestId,
        resourceType: "report",
        resourceId: id,
        metadata: { from: before?.reportToId ?? null, to: reportToId },
        outcome: AuditOutcome.SUCCEEDED,
      });
      await this.outbox.append(tx, {
        name: "report.submitted",
        version: 1,
        actorKind: OutboxActorKind.USER,
        actorUserId: actorId,
        correlationId: requestId,
        resourceType: "report",
        resourceId: id,
        consumers: [{ consumerName: "notifications", consumerVersion: 1 }],
      });
      await this.reportsSms.enqueueSubmitted(tx, {
        reportId: id,
        designatedRecipientId: reportToId,
        actorUserId: actorId,
        submittedAt: before?.submittedAt ?? null,
        requestId,
      });
      return tx.report.findUniqueOrThrow({ where: { id }, include });
    });
  }

  /** Active manager and designated reporting Admin of a department. */
  async getDepartmentRouting(departmentId: string | null): Promise<{
    managerId: string | null;
    reportingAdminId: string | null;
    overseeingManagerId: string | null;
  }> {
    if (!departmentId || !UUID.test(departmentId))
      return {
        managerId: null,
        reportingAdminId: null,
        overseeingManagerId: null,
      };
    const department = await this.db.department.findUnique({
      where: { id: departmentId },
      select: {
        manager: { select: { id: true, status: true } },
        // EVE-229: the overseeing department's active manager, who must
        // still be a Department Manager working in that active department.
        oversightDepartment: {
          select: {
            id: true,
            deactivatedAt: true,
            manager: {
              select: {
                id: true,
                status: true,
                departmentId: true,
                roleAssignment: {
                  select: { role: { select: { name: true, isSystem: true } } },
                },
              },
            },
          },
        },
        reportingAdmin: {
          select: {
            id: true,
            status: true,
            roleAssignment: {
              select: { role: { select: { name: true, isSystem: true } } },
            },
          },
        },
      },
    });
    const admin = department?.reportingAdmin;
    const adminOk =
      admin?.status === "ACTIVE" &&
      admin.roleAssignment?.role.isSystem === true &&
      admin.roleAssignment.role.name === "Admin";
    const overseeing = department?.oversightDepartment;
    const overseer = overseeing?.manager;
    const overseerOk =
      !!overseeing &&
      overseeing.deactivatedAt === null &&
      overseer?.status === "ACTIVE" &&
      overseer.departmentId === overseeing.id &&
      overseer.roleAssignment?.role.isSystem === true &&
      platformRole(overseer.roleAssignment.role.name) === "DEPARTMENT_MANAGER";
    return {
      managerId:
        department?.manager?.status === "ACTIVE" ? department.manager.id : null,
      reportingAdminId: adminOk && admin ? admin.id : null,
      overseeingManagerId: overseerOk && overseer ? overseer.id : null,
    };
  }

  async listActiveSuperAdminIds(): Promise<string[]> {
    const rows = await this.db.user.findMany({
      where: {
        status: "ACTIVE",
        roleAssignment: { role: { name: "Super Admin", isSystem: true } },
      },
      select: { id: true },
      orderBy: { id: "asc" },
    });
    return rows.map((row) => row.id);
  }

  async findRecipientUser(userId: string): Promise<{
    id: string;
    active: boolean;
    departmentId: string | null;
    roleName: string | null;
    roleIsSystem: boolean;
  } | null> {
    if (!UUID.test(userId)) return null;
    const user = await this.db.user.findUnique({
      where: { id: userId },
      select: {
        id: true,
        status: true,
        departmentId: true,
        roleAssignment: {
          select: { role: { select: { name: true, isSystem: true } } },
        },
      },
    });
    if (!user) return null;
    return {
      id: user.id,
      active: user.status === "ACTIVE",
      departmentId: user.departmentId,
      roleName: user.roleAssignment?.role.name ?? null,
      roleIsSystem: user.roleAssignment?.role.isSystem ?? false,
    };
  }

  async listPeople(ids: string[]): Promise<
    {
      id: string;
      email: string;
      firstName: string | null;
      lastName: string | null;
    }[]
  > {
    if (!ids.length) return [];
    return this.db.user.findMany({
      where: { id: { in: ids.filter((id) => UUID.test(id)) } },
      select: PERSON,
      orderBy: [{ lastName: "asc" }, { firstName: "asc" }],
    });
  }

  /** The facts needed to validate consolidation sources. */
  async findSourceCandidates(ids: string[]): Promise<
    {
      id: string;
      status: ReportStatus;
      authorRoleName: string | null;
      authorRoleIsSystem: boolean;
    }[]
  > {
    const rows = await this.db.report.findMany({
      where: { id: { in: ids.filter((id) => UUID.test(id)) } },
      select: {
        id: true,
        status: true,
        author: {
          select: {
            roleAssignment: {
              select: { role: { select: { name: true, isSystem: true } } },
            },
          },
        },
      },
    });
    return rows.map((row) => ({
      id: row.id,
      status: row.status,
      authorRoleName: row.author.roleAssignment?.role.name ?? null,
      authorRoleIsSystem: row.author.roleAssignment?.role.isSystem ?? false,
    }));
  }

  /** Marks a submitted report as actively being looked at (EOM-01's
   * "Under Review" state) - optional for every report type: a reviewer may
   * still move straight from SUBMITTED to a final decision via review()
   * without ever calling this. */
  async startReview(
    id: string,
    expectedUpdatedAt: Date,
    reviewerId: string,
    requestId: string,
  ): Promise<ReportRecord> {
    return this.db.$transaction(async (tx) => {
      const changed = await tx.report.updateMany({
        where: { id, updatedAt: expectedUpdatedAt, status: "SUBMITTED" },
        data: {
          status: "UNDER_REVIEW",
          reviewerId,
          updatedAt: new Date(),
        },
      });
      if (changed.count !== 1) throw reportInvalidTransition();
      await this.audit.append(tx, {
        action: "report.review_started",
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
        where: {
          id,
          updatedAt: expectedUpdatedAt,
          status: { in: ["SUBMITTED", "UNDER_REVIEW"] },
        },
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
      await this.outbox.append(tx, {
        name: "report.reviewed",
        version: 1,
        actorKind: OutboxActorKind.USER,
        actorUserId: reviewerId,
        correlationId: requestId,
        resourceType: "report",
        resourceId: id,
        payload: { outcome },
        consumers: [{ consumerName: "notifications", consumerVersion: 1 }],
      });
      return tx.report.findUniqueOrThrow({ where: { id }, include });
    });
  }
}
