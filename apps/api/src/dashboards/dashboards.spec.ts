import { describe, it, expect, vi } from "vitest";
vi.mock("../config/environment.js", () => ({
  ENVIRONMENT: Symbol("test-environment"),
}));
import {
  dashboardQuery,
  managementCards,
  employeeCards,
  requireAudience,
} from "./dashboards.policy.js";
import { sourceScope } from "../common/queries/operational-read.js";
import type { EffectiveGrant } from "../common/security/permissions.service.js";
import { DashboardsService } from "./dashboards.service.js";
import type { PermissionsService } from "../common/security/permissions.service.js";
import type { UsersAnalyticsQuery } from "../users/users-analytics.query.js";
import type { DatabaseService } from "../database/database.service.js";
import type { AnalyticsService } from "../analytics/analytics.service.js";
import type { EventsDashboardQuery } from "../events/events-dashboard.query.js";
import type { ProjectsDashboardQuery } from "../projects/projects-dashboard.query.js";
import type { CampaignsDashboardQuery } from "../campaigns/campaigns-dashboard.query.js";
import type { TasksDashboardQuery } from "../tasks/tasks-dashboard.query.js";
import type { MeetingsDashboardQuery } from "../meetings/meetings-dashboard.query.js";
import type { TodoDashboardQuery } from "../todo/todo-dashboard.query.js";
import type { CalendarDashboardQuery } from "../calendar/calendar-dashboard.query.js";
import type { DiscussDashboardQuery } from "../discuss/discuss-dashboard.query.js";
import type { UsersDashboardQuery } from "../users/users-dashboard.query.js";
import type { TalentDashboardQuery } from "../talent/talent-dashboard.query.js";
const now = new Date("2026-10-06T12:00:00.000Z");
describe("dashboard query contract", () => {
  it("has exactly 30 unique SRS cards", () =>
    expect(new Set([...managementCards, ...employeeCards]).size).toBe(30));
  it("defaults UTC day, month, upcoming and bounded lists", () => {
    const q = dashboardQuery("management", { limit: 5 }, now);
    expect(q.cards).toHaveLength(23);
    expect(q.day).toBe("2026-10-06");
    expect(q.today.to.toISOString()).toBe("2026-10-07T00:00:00.000Z");
    expect(q.upcoming.to.toISOString()).toBe("2026-10-13T12:00:00.000Z");
    expect(q.monthly).toEqual({
      from: "2026-08-01",
      toExclusive: "2026-11-01",
    });
  });
  it.each([
    { cards: "" },
    { cards: "myTasks" },
    { cards: "totalEvents,totalEvents" },
    { cards: " totalEvents" },
    { day: "2026-02-30" },
    { day: "0000-01-01" },
    { limit: 0 },
    { limit: 11 },
    { limit: 1.5 },
    { from: "2026-01-01" },
    { from: "2025-01-01", toExclusive: "2026-10-01" },
    { from: "2026-01-01", toExclusive: "2026-01-01" },
    { months: 13 },
    { promotionCampaignId: "not-a-uuid" },
    { userId: "someone" },
    { departmentId: "other" },
  ])("rejects invalid management query %j", (query) => {
    expect(() =>
      dashboardQuery("management", { limit: 5, ...query }, now),
    ).toThrow();
  });
  it("rejects management filters/cards on employee reads", () => {
    expect(() =>
      dashboardQuery("employee", { limit: 5, cards: "totalEvents" }, now),
    ).toThrow();
    expect(() =>
      dashboardQuery(
        "employee",
        Object.assign({ limit: 5 }, { months: 3 }),
        now,
      ),
    ).toThrow();
  });
  it("uses capabilities, not role names, and doesn't broaden department to organization", () => {
    const grants: EffectiveGrant[] = [
      { permissionKey: "dashboard.management.read", scope: "MANAGEMENT" },
    ];
    expect(() => requireAudience(grants, "management")).not.toThrow();
    expect(() => requireAudience(grants, "employee")).toThrow();
    expect(() =>
      sourceScope(
        {
          userId: "a",
          grants: [{ permissionKey: "event.read", scope: "DEPARTMENT" }],
          departmentId: null,
          selfOnly: false,
        },
        "event.read",
        ["organization"],
      ),
    ).toThrow();
  });
});
describe("dashboard composition", () => {
  const setup = (extra: EffectiveGrant[] = []) => {
    const permissions = {
      getEffectiveGrants: vi
        .fn()
        .mockResolvedValue([
          { permissionKey: "dashboard.read", scope: "SELF" },
          { permissionKey: "dashboard.management.read", scope: "MANAGEMENT" },
          ...extra,
        ]),
    };
    const users = { departmentOf: vi.fn().mockResolvedValue(null) };
    const db = {
      withReadConcurrency: vi.fn((_n: number, read: () => Promise<unknown>) =>
        read(),
      ),
    };
    const events = {
      counts: vi.fn().mockResolvedValue({
        scope: "organization",
        data: { totalEvents: 2, upcomingEvents: 1 },
      }),
      list: vi.fn().mockResolvedValue({
        scope: "organization",
        data: { items: [], hasMore: false },
      }),
    };
    const tasks = {
      counts: vi.fn().mockResolvedValue({
        scope: "organization",
        data: { pendingTasks: 3, completedTasks: 2, overdueTasks: 1 },
      }),
      list: vi.fn().mockResolvedValue({
        scope: "self",
        data: { items: [], hasMore: false },
      }),
    };
    const projects = {
      list: vi.fn().mockResolvedValue({
        scope: "organization",
        data: { items: [], hasMore: false },
      }),
    };
    const discuss = {
      unread: vi.fn().mockResolvedValue({
        scope: "self",
        data: { count: 0, totalConversations: 0, items: [], hasMore: false },
      }),
    };
    const todo = {
      list: vi.fn().mockResolvedValue({
        scope: "self",
        data: { items: [], hasMore: false },
      }),
    };
    const analytics = { promotionPerformance: vi.fn() };
    const service = new DashboardsService(
      permissions as unknown as PermissionsService,
      users as unknown as UsersAnalyticsQuery,
      db as unknown as DatabaseService,
      analytics as unknown as AnalyticsService,
      events as unknown as EventsDashboardQuery,
      projects as unknown as ProjectsDashboardQuery,
      {} as CampaignsDashboardQuery,
      tasks as unknown as TasksDashboardQuery,
      {} as MeetingsDashboardQuery,
      todo as unknown as TodoDashboardQuery,
      {} as CalendarDashboardQuery,
      discuss as unknown as DiscussDashboardQuery,
      {} as UsersDashboardQuery,
      {} as TalentDashboardQuery,
    );
    return {
      service,
      permissions,
      users,
      events,
      tasks,
      projects,
      discuss,
      analytics,
      todo,
      db,
    };
  };
  it("requires entry grants before composition", async () => {
    const s = setup();
    s.permissions.getEffectiveGrants.mockResolvedValue([]);
    await expect(
      s.service.read(
        "actor",
        "management",
        { limit: 5, cards: "totalEvents" },
        "req",
      ),
    ).rejects.toThrow();
    expect(s.events.counts).not.toHaveBeenCalled();
  });
  it("batches related count reads and returns only requested keys", async () => {
    const s = setup();
    const r = await s.service.read(
      "actor",
      "management",
      { limit: 5, cards: "pendingTasks,overdueTasks" },
      "req",
    );
    expect(s.tasks.counts).toHaveBeenCalledTimes(1);
    expect(Object.keys(r.cards).sort()).toEqual([
      "overdueTasks",
      "pendingTasks",
    ]);
    expect(r.cards.pendingTasks?.data).toEqual({ count: 3 });
    expect(s.events.counts).not.toHaveBeenCalled();
  });
  it("distinguishes an empty list from a successful zero unread count", async () => {
    const s = setup();
    const r = await s.service.read(
      "actor",
      "employee",
      { limit: 5, cards: "myTasks,myUnreadMessages" },
      "req",
    );
    expect(r.cards.myTasks?.state).toBe("empty");
    expect(r.cards.myUnreadMessages?.state).toBe("ready");
    expect(s.tasks.list.mock.calls[0]?.[0]).toMatchObject({
      userId: "actor",
      selfOnly: true,
    });
  });
  it("isolates safe errors and keeps successful siblings", async () => {
    const s = setup();
    s.projects.list.mockRejectedValue(new Error("SQL secret"));
    const r = await s.service.read(
      "actor",
      "management",
      { limit: 5, cards: "todayDeadlines,totalEvents" },
      "req-42",
    );
    expect(r.partial).toBe(true);
    expect(r.cards.totalEvents?.state).toBe("ready");
    expect(r.cards.todayDeadlines?.state).toBe("partial");
    expect(r.cards.todayDeadlines?.sources?.projects).toEqual({
      state: "unavailable",
      code: "DASHBOARD_SOURCE_UNAVAILABLE",
      retryable: true,
      requestId: "req-42",
    });
    expect(JSON.stringify(r)).not.toContain("SQL secret");
  });
  it("doesn't query promotion without permission or selection", async () => {
    const s = setup();
    let r = await s.service.read(
      "actor",
      "management",
      { limit: 5, cards: "promotionPerformance" },
      "req",
    );
    expect(r.cards.promotionPerformance).toEqual({ state: "denied" });
    s.permissions.getEffectiveGrants.mockResolvedValue([
      { permissionKey: "dashboard.management.read", scope: "MANAGEMENT" },
      { permissionKey: "analytics.management.read", scope: "ORGANIZATION" },
    ]);
    r = await s.service.read(
      "actor",
      "management",
      { limit: 5, cards: "promotionPerformance" },
      "req",
    );
    expect(r.cards.promotionPerformance).toEqual({
      state: "selectionRequired",
    });
    expect(s.analytics.promotionPerformance).not.toHaveBeenCalled();
  });
  it("sorts floating To-Do deadlines by optional local time before limiting", async () => {
    const s = setup();
    s.todo.list.mockResolvedValue({
      scope: "self",
      data: {
        items: [
          {
            id: "late",
            title: "Late",
            kind: "TODO",
            dueDate: "2026-10-06",
            dueTime: "17:00:00",
          },
          {
            id: "early",
            title: "Early",
            kind: "TODO",
            dueDate: "2026-10-06",
            dueTime: "08:00:00",
          },
        ],
        hasMore: false,
      },
    });
    const r = await s.service.read(
      "actor",
      "employee",
      { limit: 1, cards: "myUpcomingDeadlines" },
      "req",
    );
    expect(r.cards.myUpcomingDeadlines?.data).toHaveProperty(
      "items.0.id",
      "early",
    );
    expect(r.cards.myUpcomingDeadlines?.data).toHaveProperty("hasMore", true);
  });
  it("clears source summaries of duplicated item payloads and limits merged data", async () => {
    const s = setup();
    s.tasks.list.mockResolvedValue({
      scope: "self",
      data: {
        items: Array.from({ length: 5 }, (_, i) => ({
          id: String(i),
          title: "Task",
          kind: "TASK",
          dueAt: "2026-10-06T12:00:00.000Z",
        })),
        hasMore: true,
      },
    });
    const r = await s.service.read(
      "actor",
      "management",
      { limit: 2, cards: "todayDeadlines" },
      "req",
    );
    expect(r.cards.todayDeadlines?.data).toHaveProperty("hasMore", true);
    expect(
      (r.cards.todayDeadlines?.data as { items: unknown[] }).items,
    ).toHaveLength(2);
    expect(r.cards.todayDeadlines?.sources?.tasks?.data).toBeUndefined();
  });
});
