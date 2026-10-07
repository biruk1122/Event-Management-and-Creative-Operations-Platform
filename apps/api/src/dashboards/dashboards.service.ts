import {
  HttpException,
  Injectable,
  Logger,
  ServiceUnavailableException,
} from "@nestjs/common";
import { AnalyticsService } from "../analytics/analytics.service.js";
import { PermissionsService } from "../common/security/permissions.service.js";
import type {
  ReadContext,
  ScopedRead,
  OperationalList,
  OperationalItem,
} from "../common/queries/operational-read.js";
import { DatabaseService } from "../database/database.service.js";
import { EventsDashboardQuery } from "../events/events-dashboard.query.js";
import { ProjectsDashboardQuery } from "../projects/projects-dashboard.query.js";
import { CampaignsDashboardQuery } from "../campaigns/campaigns-dashboard.query.js";
import { TasksDashboardQuery } from "../tasks/tasks-dashboard.query.js";
import { MeetingsDashboardQuery } from "../meetings/meetings-dashboard.query.js";
import { TodoDashboardQuery } from "../todo/todo-dashboard.query.js";
import { CalendarDashboardQuery } from "../calendar/calendar-dashboard.query.js";
import { DiscussDashboardQuery } from "../discuss/discuss-dashboard.query.js";
import { UsersDashboardQuery } from "../users/users-dashboard.query.js";
import { TalentDashboardQuery } from "../talent/talent-dashboard.query.js";
import { UsersAnalyticsQuery } from "../users/users-analytics.query.js";
import { CampaignType } from "../generated/prisma/client.js";
import type {
  DashboardData,
  DashboardCard,
  DashboardResponse,
} from "./dashboards.contracts.js";
import type { DashboardQueryDto } from "./dashboards.dto.js";
import {
  dashboardQuery,
  requireAudience,
  type Audience,
  type CardKey,
} from "./dashboards.policy.js";

@Injectable()
export class DashboardsService {
  private readonly logger = new Logger(DashboardsService.name);
  constructor(
    private readonly permissions: PermissionsService,
    private readonly users: UsersAnalyticsQuery,
    private readonly db: DatabaseService,
    private readonly analytics: AnalyticsService,
    private readonly events: EventsDashboardQuery,
    private readonly projects: ProjectsDashboardQuery,
    private readonly campaigns: CampaignsDashboardQuery,
    private readonly tasks: TasksDashboardQuery,
    private readonly meetings: MeetingsDashboardQuery,
    private readonly todo: TodoDashboardQuery,
    private readonly calendar: CalendarDashboardQuery,
    private readonly discuss: DiscussDashboardQuery,
    private readonly people: UsersDashboardQuery,
    private readonly talent: TalentDashboardQuery,
  ) {}
  async read(
    userId: string,
    audience: Audience,
    dto: DashboardQueryDto,
    requestId: string,
  ): Promise<DashboardResponse> {
    const now = new Date(),
      q = dashboardQuery(audience, dto, now);
    let ctx: ReadContext;
    try {
      const grants = await this.permissions.getEffectiveGrants(userId);
      requireAudience(grants, audience);
      ctx = {
        userId,
        grants,
        departmentId: grants.some((g) => g.scope === "DEPARTMENT")
          ? await this.users.departmentOf(userId)
          : null,
        selfOnly: audience === "employee",
      };
    } catch (error) {
      if (error instanceof HttpException) throw error;
      this.logger.warn(
        { requestId, code: "DASHBOARD_UNAVAILABLE" },
        "Dashboard access resolution failed",
      );
      throw new ServiceUnavailableException({
        code: "DASHBOARD_UNAVAILABLE",
        detail: "Dashboard access could not be resolved.",
      });
    }
    const memo = new Map<string, Promise<unknown>>();
    const cached = <T>(key: string, read: () => Promise<T>): Promise<T> => {
      if (!memo.has(key)) memo.set(key, read());
      return memo.get(key) as Promise<T>;
    };
    const card = async (
      key: string,
      read: () => Promise<ScopedRead<DashboardData>>,
    ): Promise<DashboardCard> => {
      try {
        const result = await read(),
          data = result.data;
        const empty =
          "items" in data && data.items.length === 0 && !("count" in data);
        return {
          state: empty ? "empty" : "ready",
          scope: result.scope,
          asOf: now.toISOString(),
          data,
        };
      } catch (error) {
        if (
          error instanceof HttpException &&
          [401, 403].includes(error.getStatus())
        )
          return { state: "denied" };
        const notFound =
          error instanceof HttpException && error.getStatus() === 404;
        this.logger.warn(
          {
            requestId,
            card: key,
            code: notFound
              ? "DASHBOARD_SELECTION_UNAVAILABLE"
              : "DASHBOARD_SOURCE_UNAVAILABLE",
          },
          "Dashboard source read failed",
        );
        return {
          state: "unavailable",
          code: notFound
            ? "DASHBOARD_SELECTION_UNAVAILABLE"
            : "DASHBOARD_SOURCE_UNAVAILABLE",
          retryable: !notFound,
          requestId,
        };
      }
    };
    const merge = async (
      key: string,
      sources: Record<string, () => Promise<ScopedRead<OperationalList>>>,
    ): Promise<DashboardCard> => {
      const states: Record<string, DashboardCard> = {};
      // Sequential within a card; global worker queue and read limiter cap fan-out.
      for (const [source, read] of Object.entries(sources))
        states[source] = await card(key + ":" + source, read);
      if (Object.values(states).every((s) => s.state === "denied"))
        return { state: "denied" };
      const items = Object.values(states).flatMap((s) =>
        s.data && "items" in s.data ? (s.data.items as OperationalItem[]) : [],
      );
      const unique = [
        ...new Map(items.map((i) => [i.kind + ":" + i.id, i])).values(),
      ];
      const time = (i: OperationalItem) =>
        key.includes("Deadlines") || key === "todayDeadlines"
          ? (i.dueAt ??
            (i.dueDate
              ? i.dueDate + "T" + (i.dueTime ?? "00:00:00")
              : undefined) ??
            i.endAt ??
            "")
          : (i.startAt ?? "");
      unique.sort(
        (a, b) =>
          time(a).localeCompare(time(b)) ||
          a.kind.localeCompare(b.kind) ||
          a.id.localeCompare(b.id),
      );
      const data = {
        items: unique.slice(0, q.limit),
        hasMore:
          unique.length > q.limit ||
          Object.values(states).some(
            (s) => s.data && "hasMore" in s.data && s.data.hasMore,
          ),
      };
      const incomplete = Object.values(states).some(
        (s) => s.state === "unavailable" || s.state === "denied",
      );
      const scopes = Object.values(states).flatMap((s) =>
        s.scope ? [s.scope] : [],
      );
      const scope = ctx.selfOnly
        ? "self"
        : scopes.includes("organization")
          ? "organization"
          : scopes.includes("department")
            ? "department"
            : "self";
      const summaries = Object.fromEntries(
        Object.entries(states).map(([name, state]) => {
          const summary = { ...state };
          delete summary.data;
          return [name, summary];
        }),
      );
      return {
        state: incomplete ? "partial" : data.items.length ? "ready" : "empty",
        scope,
        asOf: now.toISOString(),
        data,
        sources: summaries,
      };
    };
    const analytics =
      (method: () => Promise<DashboardData>, department = false) =>
      async () => {
        const grants = ctx.grants.filter(
          (g) =>
            g.permissionKey ===
            (department
              ? "analytics.department_performance.read"
              : "analytics.management.read"),
        );
        const scope = grants.some((g) =>
          ["MANAGEMENT", "ORGANIZATION"].includes(g.scope),
        )
          ? ("organization" as const)
          : ("department" as const);
        return { scope, data: await method() };
      };
    const readCard = async (key: CardKey): Promise<DashboardCard> => {
      const today = q.today,
        up = q.upcoming;
      switch (key) {
        case "totalEvents":
        case "upcomingEvents":
          return card(key, async () => {
            const r = await cached("events-count", () =>
              this.events.counts(ctx, up),
            );
            return { scope: r.scope, data: { count: r.data[key] } };
          });
        case "pendingTasks":
        case "completedTasks":
        case "overdueTasks":
          return card(key, async () => {
            const r = await cached("tasks-count", () =>
              this.tasks.counts(ctx, now),
            );
            return { scope: r.scope, data: { count: r.data[key] } };
          });
        case "activeProjects":
          return card(key, async () => {
            const r = await this.projects.counts(ctx);
            return { scope: r.scope, data: { count: r.data.activeProjects } };
          });
        case "activeCampaigns":
          return card(key, () => this.campaigns.count(ctx));
        case "activeEmployees":
          return card(key, () => this.people.count(ctx));
        case "activeTalents":
          return card(key, () => this.talent.count(ctx));
        case "todayEvents":
          return card(key, () => this.events.list(ctx, false, today));
        case "todayMeetings":
          return card(key, () => this.meetings.list(ctx, false, today));
        case "upcomingMeetings":
        case "myUpcomingMeetings":
          return card(key, () => this.meetings.list(ctx, true, up));
        case "attentionTasks":
          return card(key, () => this.tasks.list(ctx, "attention", today));
        case "myTasks":
          return card(key, () => this.tasks.list(ctx, "tasks", today));
        case "myTodo":
          return card(key, () => this.todo.list(ctx, false, today));
        case "recentActivity":
          return card(key, () => this.tasks.list(ctx, "activity", up));
        case "overdueActivities":
          return card(key, () => this.campaigns.overdue(ctx, up));
        case "unreadMessages":
        case "myUnreadMessages":
          return card(key, () => this.discuss.unread(ctx, up));
        case "activeChannels":
          return card(key, () => this.discuss.channels(ctx, up));
        case "todayDeadlines":
          return merge(key, {
            tasks: () => this.tasks.list(ctx, "deadlines", today),
            projects: () => this.projects.list(ctx, true, today),
          });
        case "myUpcomingDeadlines":
          return merge(key, {
            tasks: () => this.tasks.list(ctx, "deadlines", up),
            projects: () => this.projects.list(ctx, true, up),
            todo: () => this.todo.list(ctx, true, up),
          });
        case "todaySchedule":
          if (
            !ctx.grants.some(
              (g) =>
                g.permissionKey === "calendar.read" &&
                ["SELF", "ORGANIZATION"].includes(g.scope),
            )
          )
            return { state: "denied" };
          return merge(key, {
            personal: () => this.calendar.list(ctx, today),
            events: () => this.events.list(ctx, false, today),
            tasks: () => this.tasks.list(ctx, "schedule", today),
            projects: () => this.projects.list(ctx, false, today),
            meetings: () => this.meetings.list(ctx, false, today),
          });
        case "taskCompletionRate":
          return card(
            key,
            analytics(() =>
              this.analytics.taskCompletion(userId, {
                from: q.from,
                toExclusive: q.toExclusive,
              }),
            ),
          );
        case "departmentPerformance":
          return card(
            key,
            analytics(
              () =>
                this.analytics.departmentPerformance(userId, {
                  from: q.from,
                  toExclusive: q.toExclusive,
                  page: 1,
                  pageSize: q.limit,
                }),
              true,
            ),
          );
        case "eventProgress":
          return card(
            key,
            analytics(() =>
              this.analytics.eventProgress(userId, {
                page: 1,
                pageSize: q.limit,
              }),
            ),
          );
        case "marketingProgress":
          return card(
            key,
            analytics(() =>
              this.analytics.campaignProgress(userId, {
                page: 1,
                pageSize: q.limit,
                campaignType: CampaignType.MARKETING,
              }),
            ),
          );
        case "promotionPerformance":
          if (
            !ctx.grants.some(
              (g) =>
                g.permissionKey === "analytics.management.read" &&
                ["MANAGEMENT", "ORGANIZATION"].includes(g.scope),
            )
          )
            return { state: "denied" };
          if (!q.promotionCampaignId) return { state: "selectionRequired" };
          return card(
            key,
            analytics(() =>
              this.analytics.promotionPerformance(userId, {
                campaignId: q.promotionCampaignId!,
              }),
            ),
          );
        case "monthlyActivity":
          return card(
            key,
            analytics(() => this.analytics.monthlyActivity(userId, q.monthly)),
          );
      }
    };
    return this.db.withReadConcurrency(4, async () => {
      const cards: Record<string, DashboardCard> = {};
      let index = 0;
      const worker = async () => {
        while (index < q.cards.length) {
          const key = q.cards[index++]!;
          cards[key] = await readCard(key);
        }
      };
      await Promise.all(
        Array.from({ length: Math.min(4, q.cards.length) }, worker),
      );
      const failed = (s: DashboardCard): boolean =>
        s.state === "unavailable" ||
        Object.values(s.sources ?? {}).some(failed);
      return {
        asOf: now.toISOString(),
        day: q.day,
        timeZone: "UTC",
        freshness: "live-current-state",
        partial: Object.values(cards).some(failed),
        cards,
      };
    });
  }
}
