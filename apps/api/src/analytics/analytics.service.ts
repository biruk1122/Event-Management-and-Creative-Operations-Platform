import { HttpException, Injectable, NotFoundException } from "@nestjs/common";
import { CampaignsAnalyticsQuery } from "../campaigns/campaigns-analytics.query.js";
import { PermissionsService } from "../common/security/permissions.service.js";
import { DepartmentsAnalyticsQuery } from "../departments/departments-analytics.query.js";
import { EventsAnalyticsQuery } from "../events/events-analytics.query.js";
import { CampaignType } from "../generated/prisma/client.js";
import { ProductionsAnalyticsQuery } from "../productions/productions-analytics.query.js";
import { ProjectsAnalyticsQuery } from "../projects/projects-analytics.query.js";
import { PromotionAnalyticsQuery } from "../promotion/promotion-analytics.query.js";
import { TasksAnalyticsQuery } from "../tasks/tasks-analytics.query.js";
import { UsersAnalyticsQuery } from "../users/users-analytics.query.js";
import type {
  AnalyticsPeriodDto,
  CampaignAnalyticsDto,
  DepartmentAnalyticsDto,
  EmployeeAnalyticsDto,
  EventAnalyticsDto,
  PromotionAnalyticsDto,
} from "./analytics.dto.js";
import type {
  AnalyticsMeta,
  MonthlyAnalyticsItem,
  MonthlyAnalyticsResponse,
  ProgressAnalyticsPageResponse,
  PromotionAnalyticsResponse,
  TaskAnalyticsResponse,
  WorkAnalyticsPageResponse,
} from "./analytics.contracts.js";
import {
  analyticsScope,
  analyticsPeriod,
  analyticsPage,
} from "./analytics.policy.js";
import { analyticsUnavailable } from "./analytics.errors.js";

@Injectable()
export class AnalyticsService {
  constructor(
    private readonly permissions: PermissionsService,
    private readonly tasks: TasksAnalyticsQuery,
    private readonly departments: DepartmentsAnalyticsQuery,
    private readonly users: UsersAnalyticsQuery,
    private readonly events: EventsAnalyticsQuery,
    private readonly campaigns: CampaignsAnalyticsQuery,
    private readonly promotion: PromotionAnalyticsQuery,
    private readonly projects: ProjectsAnalyticsQuery,
    private readonly productions: ProductionsAnalyticsQuery,
  ) {}

  private async execute<T>(
    userId: string,
    key: string,
    allowDepartment: boolean,
    read: (
      scope: "organization" | "department",
      meta: AnalyticsMeta,
    ) => Promise<T>,
  ): Promise<T> {
    try {
      const scope = analyticsScope(
        await this.permissions.getEffectiveGrants(userId),
        key,
        allowDepartment,
      );
      return await read(scope, {
        asOf: new Date().toISOString(),
        freshness: "live-current-state",
      });
    } catch (error) {
      if (error instanceof HttpException) throw error;
      // ProblemDetailsFilter supplies safe structured logs and the request ID.
      // Never turn a failed/timed-out projection into successful zero counts.
      throw analyticsUnavailable();
    }
  }

  taskCompletion(
    userId: string,
    dto: AnalyticsPeriodDto,
  ): Promise<TaskAnalyticsResponse> {
    return this.execute(
      userId,
      "analytics.management.read",
      false,
      async (_scope, meta) => {
        const period = analyticsPeriod(dto);
        return {
          ...meta,
          from: dto.from,
          toExclusive: dto.toExclusive,
          counts: await this.tasks.organization(period, new Date(meta.asOf)),
        };
      },
    );
  }
  departmentPerformance(
    userId: string,
    dto: DepartmentAnalyticsDto,
  ): Promise<WorkAnalyticsPageResponse> {
    return this.execute(
      userId,
      "analytics.department_performance.read",
      true,
      async (scope, meta) => {
        const period = analyticsPeriod(dto),
          page = analyticsPage(dto);
        const ownDepartment =
          scope === "department"
            ? await this.users.departmentOf(userId)
            : undefined;
        const selected = await this.departments.page(
          page,
          dto.departmentId,
          ownDepartment,
        );
        const items = await this.tasks.departments(
          selected.items.map((row) => row.id),
          period,
          new Date(meta.asOf),
        );
        return {
          ...meta,
          from: dto.from,
          toExclusive: dto.toExclusive,
          total: selected.total,
          ...page,
          items,
        };
      },
    );
  }
  employeePerformance(
    userId: string,
    dto: EmployeeAnalyticsDto,
  ): Promise<WorkAnalyticsPageResponse> {
    return this.execute(
      userId,
      "analytics.employee_performance.read",
      false,
      async (_scope, meta) => {
        const period = analyticsPeriod(dto),
          page = analyticsPage(dto);
        const selected = await this.users.page(page, dto.employeeId);
        const items = await this.tasks.employees(
          selected.items.map((row) => row.id),
          period,
          new Date(meta.asOf),
        );
        return {
          ...meta,
          from: dto.from,
          toExclusive: dto.toExclusive,
          total: selected.total,
          ...page,
          items,
        };
      },
    );
  }
  eventProgress(
    userId: string,
    dto: EventAnalyticsDto,
  ): Promise<ProgressAnalyticsPageResponse> {
    return this.execute(
      userId,
      "analytics.management.read",
      false,
      async (_scope, meta) => {
        const page = analyticsPage(dto),
          selected = await this.events.page(page, dto.eventId);
        const counts = await this.tasks.workspaceProgress(
          selected.items.map((row) => row.workspaceId),
        );
        const items = selected.items.map((event) => {
          const count = counts.find((row) => row.id === event.workspaceId)!;
          return {
            id: event.id,
            total: count.total,
            completed: count.completed,
            percent: count.percent,
          };
        });
        return { ...meta, total: selected.total, ...page, items };
      },
    );
  }
  campaignProgress(
    userId: string,
    dto: CampaignAnalyticsDto,
  ): Promise<ProgressAnalyticsPageResponse> {
    return this.execute(
      userId,
      "analytics.management.read",
      false,
      async (_scope, meta) => {
        const page = analyticsPage(dto),
          selected = await this.campaigns.page(
            page,
            dto.campaignType,
            dto.campaignId,
          );
        return {
          ...meta,
          total: selected.total,
          ...page,
          items: await this.campaigns.progress(
            selected.items.map((row) => row.id),
          ),
        };
      },
    );
  }
  promotionPerformance(
    userId: string,
    dto: PromotionAnalyticsDto,
  ): Promise<PromotionAnalyticsResponse> {
    return this.execute(
      userId,
      "analytics.management.read",
      false,
      async (_scope, meta) => {
        const selected = await this.campaigns.page(
          { page: 1, pageSize: 1 },
          CampaignType.PROMOTION,
          dto.campaignId,
        );
        if (!selected.items.length)
          throw new NotFoundException({
            code: "ANALYTICS_SUBJECT_NOT_FOUND",
            detail: "No promotion campaign exists with that id.",
          });
        return {
          ...meta,
          campaignId: dto.campaignId,
          items: await this.promotion.channels(dto.campaignId),
        };
      },
    );
  }
  monthlyActivity(
    userId: string,
    dto: AnalyticsPeriodDto,
  ): Promise<MonthlyAnalyticsResponse> {
    return this.execute(
      userId,
      "analytics.management.read",
      false,
      async (_scope, meta) => {
        const period = analyticsPeriod(dto, true);
        const sources = await Promise.all([
          this.tasks.creation(period),
          this.events.creation(period),
          this.projects.creation(period),
          this.productions.creation(period),
          this.campaigns.creation(period),
          this.tasks.completions(period),
        ]);
        const items: MonthlyAnalyticsItem[] = [];
        for (
          const cursor = new Date(period.from);
          cursor < period.toExclusive;
          cursor.setUTCMonth(cursor.getUTCMonth() + 1)
        ) {
          const month = cursor.toISOString().slice(0, 7);
          const counts = sources.map(
            (rows) => rows.find((row) => row.month === month)?.total ?? 0,
          );
          items.push({
            month,
            tasksCreated: counts[0]!,
            eventsCreated: counts[1]!,
            projectsCreated: counts[2]!,
            productionsCreated: counts[3]!,
            campaignsCreated: counts[4]!,
            tasksCompleted: counts[5]!,
          });
        }
        return { ...meta, from: dto.from, toExclusive: dto.toExclusive, items };
      },
    );
  }
}
