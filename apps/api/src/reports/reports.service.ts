import { Injectable } from "@nestjs/common";

import { PermissionsService } from "../common/security/permissions.service.js";
import { AuditWriterService } from "../audit/audit-writer.service.js";
import { permissionDenied } from "../common/security/security.errors.js";
import {
  AuditActorKind,
  AuditOutcome,
  type ReportType,
} from "../generated/prisma/client.js";
import { WorkspacesService } from "../workspaces/workspaces.service.js";
import { ProjectsReportFactsQuery } from "../projects/projects-report-facts.query.js";
import { TasksReportFactsQuery } from "../tasks/tasks-report-facts.query.js";
import type {
  CreateReportDto,
  ReviewReportDto,
  UpdateReportDto,
} from "./dto/report-input.dto.js";
import type { ListReportsQueryDto } from "./dto/list-reports-query.dto.js";
import {
  ReportsRepository,
  type ReportRecord,
  type ReportVisibility,
  type ReportWrite,
} from "./infrastructure/reports.repository.js";
import type {
  PaginatedReportsResponse,
  ReportDetailResponse,
  ReportResponse,
} from "./reports.contracts.js";
import {
  reportInvalidRange,
  reportInvalidTransition,
  reportNotFound,
  reportWorkspaceNotFound,
} from "./reports.errors.js";
import {
  canEdit,
  parsePeriod,
  SECTION_KEYS,
  type Sections,
  validateSections,
  validateSubmission,
} from "./reports.policy.js";

function dateOnly(date: Date): string {
  return date.toISOString().slice(0, 10);
}

function toResponse(report: ReportRecord): ReportResponse {
  return {
    id: report.id,
    type: report.type,
    title: report.title,
    periodStart: dateOnly(report.periodStart),
    periodEnd: dateOnly(report.periodEnd),
    authorId: report.authorId,
    departmentId: report.departmentId,
    status: report.status,
    problemsEncountered: report.problemsEncountered,
    nextDayPlan: report.nextDayPlan,
    departmentActivities: report.departmentActivities,
    majorAchievements: report.majorAchievements,
    challenges: report.challenges,
    nextWeekPlan: report.nextWeekPlan,
    departmentPerformance: report.departmentPerformance,
    employeePerformance: report.employeePerformance,
    submittedAt: report.submittedAt?.toISOString() ?? null,
    reviewedAt: report.reviewedAt?.toISOString() ?? null,
    reviewerId: report.reviewerId,
    workspaceIds: report.workspaces.map((link) => link.workspaceId),
    reviews: report.reviews.map((review) => ({
      id: review.id,
      reviewerId: review.reviewerId,
      outcome: review.outcome,
      note: review.note,
      reviewedAt: review.reviewedAt.toISOString(),
    })),
    createdAt: report.createdAt.toISOString(),
    updatedAt: report.updatedAt.toISOString(),
  };
}

function sectionsFrom(
  report: ReportRecord | CreateReportDto | UpdateReportDto,
): Sections {
  const sections: Sections = {};
  for (const key of SECTION_KEYS) {
    const value = report[key];
    if (value !== undefined) sections[key] = value;
  }
  return sections;
}

@Injectable()
export class ReportsService {
  constructor(
    private readonly repo: ReportsRepository,
    private readonly permissions: PermissionsService,
    private readonly workspaces: WorkspacesService,
    private readonly audit: AuditWriterService,
    private readonly taskFacts: TasksReportFactsQuery,
    private readonly projectFacts: ProjectsReportFactsQuery,
  ) {}

  private async visibility(
    userId: string,
    key: string,
  ): Promise<ReportVisibility> {
    const grants = await this.permissions.getEffectiveGrants(userId);
    const organization = grants.some(
      (g) => g.permissionKey === key && g.scope === "ORGANIZATION",
    );
    const department = grants.some(
      (g) => g.permissionKey === key && g.scope === "DEPARTMENT",
    );
    const self = grants.some(
      (g) => g.permissionKey === key && g.scope === "SELF",
    );
    if (!organization && !department && !self) throw permissionDenied();
    const departmentId = department
      ? await this.repo.findUserDepartmentId(userId)
      : null;
    return {
      organization,
      ...(departmentId ? { departmentId } : {}),
      ...(self ? { selfUserId: userId } : {}),
    };
  }

  private authorized(
    report: ReportRecord,
    visibility: ReportVisibility,
  ): boolean {
    return (
      visibility.organization ||
      (!!visibility.departmentId &&
        report.departmentId === visibility.departmentId) ||
      (!!visibility.selfUserId && report.authorId === visibility.selfUserId)
    );
  }

  private async load(
    userId: string,
    id: string,
    key: string,
  ): Promise<ReportRecord> {
    const visibility = await this.visibility(userId, key);
    const report = await this.repo.findById(id);
    if (!report) {
      if (!visibility.organization) throw permissionDenied();
      throw reportNotFound();
    }
    if (!this.authorized(report, visibility)) throw permissionDenied();
    return report;
  }

  private async checkWorkspaces(userId: string, ids: string[]): Promise<void> {
    for (const id of ids) {
      try {
        await this.workspaces.get(userId, id);
      } catch (error) {
        if (error instanceof Error && error.name === "NotFoundException")
          throw reportWorkspaceNotFound();
        throw error;
      }
    }
  }

  private async writeData(
    userId: string,
    input: CreateReportDto | UpdateReportDto,
    existing?: ReportRecord,
  ): Promise<ReportWrite> {
    const type = (input.type ?? existing?.type) as ReportType;
    const start =
      input.periodStart ?? (existing ? dateOnly(existing.periodStart) : "");
    const end =
      input.periodEnd ?? (existing ? dateOnly(existing.periodEnd) : "");
    const { from, to } = parsePeriod(type, start, end);
    const departmentId =
      input.departmentId ??
      (existing
        ? existing.departmentId
        : await this.repo.findUserDepartmentId(userId));
    const visibility = await this.visibility(userId, "report.create");
    if (
      !visibility.organization &&
      !(
        (visibility.departmentId && departmentId === visibility.departmentId) ||
        (visibility.selfUserId === userId &&
          (departmentId === (await this.repo.findUserDepartmentId(userId)) ||
            (existing?.authorId === userId &&
              departmentId === existing.departmentId)))
      )
    )
      throw permissionDenied();
    if (departmentId && !(await this.repo.departmentExists(departmentId)))
      throw permissionDenied();
    const workspaceIds =
      input.workspaceIds ??
      existing?.workspaces.map((link) => link.workspaceId) ??
      [];
    await this.checkWorkspaces(userId, workspaceIds);
    const sections: Sections = {
      ...(existing && existing.type === type
        ? sectionsFrom(existing)
        : Object.fromEntries(SECTION_KEYS.map((key) => [key, null]))),
      ...sectionsFrom(input),
    };
    validateSections(type, sections);
    return {
      type,
      title: (input.title ?? existing?.title ?? "").trim(),
      periodStart: from,
      periodEnd: to,
      departmentId: departmentId ?? null,
      workspaceIds,
      sections,
    };
  }

  async list(
    userId: string,
    query: ListReportsQueryDto,
  ): Promise<PaginatedReportsResponse> {
    const visibility = await this.visibility(userId, "report.read");
    let periodFrom: Date | undefined;
    let periodTo: Date | undefined;
    if (query.periodFrom) periodFrom = parseDate(query.periodFrom);
    if (query.periodTo) periodTo = parseDate(query.periodTo);
    if (!!periodFrom !== !!periodTo) throw reportInvalidRange();
    if (
      periodFrom &&
      periodTo &&
      (periodTo < periodFrom ||
        periodTo.getTime() - periodFrom.getTime() > 366 * 86_400_000)
    )
      throw reportInvalidRange();
    const result = await this.repo.list({
      visibility,
      ...(query.type ? { type: query.type } : {}),
      ...(query.status ? { status: query.status } : {}),
      ...(query.authorId ? { authorId: query.authorId } : {}),
      ...(query.departmentId ? { departmentId: query.departmentId } : {}),
      ...(query.workspaceId ? { workspaceId: query.workspaceId } : {}),
      ...(periodFrom ? { periodFrom } : {}),
      ...(periodTo ? { periodTo } : {}),
      page: query.page,
      pageSize: query.pageSize,
    });
    return {
      items: result.items.map(toResponse),
      page: query.page,
      pageSize: query.pageSize,
      total: result.total,
    };
  }

  async get(userId: string, id: string): Promise<ReportDetailResponse> {
    const report = await this.load(userId, id, "report.read");
    const asOf = new Date();
    const endExclusive = new Date(report.periodEnd.getTime() + 86_400_000);
    const [tasks, projects] = await Promise.all([
      this.taskFacts.forAuthor(
        report.authorId,
        report.periodStart,
        endExclusive,
        asOf,
      ),
      report.type === "MONTHLY"
        ? this.projectFacts.forAuthor(report.authorId)
        : Promise.resolve(null),
    ]);
    return {
      ...toResponse(report),
      facts: {
        asOf: asOf.toISOString(),
        completedTasksInPeriod: tasks.completedInPeriod,
        inProgressTasksNow: tasks.inProgressNow,
        pendingTasksNow: tasks.pendingNow,
        overdueTasksNow: tasks.overdueNow,
        totalProjectsNow: projects?.totalNow ?? null,
        completedProjectsNow: projects?.completedNow ?? null,
        activeProjectsNow: projects?.activeNow ?? null,
      },
    };
  }

  async create(
    userId: string,
    input: CreateReportDto,
  ): Promise<ReportResponse> {
    const data = await this.writeData(userId, input);
    return toResponse(await this.repo.create(userId, data));
  }

  async update(
    userId: string,
    id: string,
    input: UpdateReportDto,
  ): Promise<ReportResponse> {
    const report = await this.load(userId, id, "report.create");
    if (report.authorId !== userId) throw permissionDenied();
    if (!canEdit(report.status)) throw reportInvalidTransition();
    const data = await this.writeData(userId, input, report);
    return toResponse(await this.repo.updateDraft(id, report.updatedAt, data));
  }

  async submit(
    userId: string,
    id: string,
    requestId: string,
  ): Promise<ReportResponse> {
    const report = await this.load(userId, id, "report.submit");
    if (report.authorId !== userId) throw permissionDenied();
    if (report.status !== "DRAFT") throw reportInvalidTransition();
    validateSubmission(report.type, sectionsFrom(report));
    return toResponse(
      await this.repo.submit(id, report.updatedAt, userId, requestId),
    );
  }

  async review(
    userId: string,
    id: string,
    input: ReviewReportDto,
    requestId: string,
  ): Promise<ReportResponse> {
    const report = await this.load(userId, id, "report.review");
    if (report.status !== "SUBMITTED") throw reportInvalidTransition();
    if (report.authorId === userId) throw permissionDenied();
    return toResponse(
      await this.repo.review(
        id,
        report.updatedAt,
        userId,
        input.outcome,
        requestId,
        input.note,
      ),
    );
  }

  async export(userId: string, id: string, requestId: string): Promise<string> {
    const report = await this.get(userId, id);
    await this.audit.record({
      action: "report.exported",
      actorKind: AuditActorKind.USER,
      actorUserId: userId,
      requestId,
      resourceType: "report",
      resourceId: id,
      outcome: AuditOutcome.SUCCEEDED,
    });
    return JSON.stringify(report, null, 2);
  }
}

function parseDate(value: string): Date {
  const date = new Date(`${value}T00:00:00.000Z`);
  if (Number.isNaN(date.getTime()) || dateOnly(date) !== value)
    throw reportInvalidRange();
  return date;
}
