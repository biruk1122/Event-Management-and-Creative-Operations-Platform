import { readFileSync } from "node:fs";
import { PrismaPg } from "@prisma/adapter-pg";
import type { NestExpressApplication } from "@nestjs/platform-express";
import request from "supertest";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import type { DatabaseService } from "../src/database/database.service.js";
import { FILE_SCANNER } from "../src/file-management/file-scanner.js";
import { FILE_OBJECT_STORAGE } from "../src/file-management/storage/object-storage.js";
import { Prisma, PrismaClient } from "../src/generated/prisma/client.js";
import { seedRbac } from "../src/rbac/seed-rbac.js";
import type { TasksAnalyticsQuery } from "../src/tasks/tasks-analytics.query.js";
import {
  createIsolatedDatabase,
  PG_ERROR,
  type IsolatedDatabase,
} from "./support/database.js";

const period = { from: "2026-09-01", toExclusive: "2026-10-01" };
const id = (n: number) =>
  `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
interface Principal {
  id: string;
  cookies: string[];
}
interface Result {
  asOf: string;
  freshness: string;
  total: number;
  page: number;
  pageSize: number;
  counts: {
    total: number;
    completed: number;
    pending: number;
    overdue: number;
    percent: number | null;
  };
  items: Array<{
    id?: string;
    total?: number;
    completed?: number;
    percent?: number | null;
    channel?: string;
    month?: string;
    tasksCreated?: number;
    tasksCompleted?: number;
  }>;
}
const body = (response: request.Response) => response.body as Result;

interface RuntimePlan {
  Plan: {
    "Actual Rows": number;
    "Shared Hit Blocks": number;
    "Shared Read Blocks": number;
  };
  "Planning Time": number;
  "Execution Time": number;
}

describe("management analytics API (EVE-172 / EVE-173)", () => {
  let db: IsolatedDatabase;
  let prisma: PrismaClient;
  let app: NestExpressApplication;
  let http: ReturnType<NestExpressApplication["getHttpServer"]>;
  let databaseToken: typeof DatabaseService;
  let tasksToken: typeof TasksAnalyticsQuery;
  let admin: Principal,
    manager: Principal,
    noDepartment: Principal,
    member: Principal,
    management: Principal;
  beforeAll(async () => {
    db = await createIsolatedDatabase();
    process.env.DATABASE_URL = db.url;
    process.env.NODE_ENV = "test";
    process.env.AUTH_ACCESS_TOKEN_SECRET ??=
      "analytics-access-token-secret-at-least-32-characters";
    process.env.AUTH_REFRESH_TOKEN_SECRET ??=
      "analytics-refresh-token-secret-at-least-32-characters";
    process.env.AUTH_LOGIN_RATE_LIMIT_MAX = "10000";
    process.env.API_RATE_LIMIT_MAX = "100000";
    process.env.FILE_SCANNER_MODE = "test";
    process.env.LOG_LEVEL = "silent";
    // These providers load the environment singleton; import after isolation.
    databaseToken = (await import("../src/database/database.service.js"))
      .DatabaseService;
    tasksToken = (await import("../src/tasks/tasks-analytics.query.js"))
      .TasksAnalyticsQuery;
    prisma = new PrismaClient({
      adapter: new PrismaPg(
        { connectionString: db.url },
        { schema: db.schema },
      ),
    });
    await seedRbac(prisma);
    const [
      { Test },
      { AppModule },
      { configureApplication },
      { PasswordHasher },
    ] = await Promise.all([
      import("@nestjs/testing"),
      import("../src/app.module.js"),
      import("../src/app.setup.js"),
      import("../src/auth/domain/password-hasher.js"),
    ]);
    const password = "correct horse battery staple";
    const hash = await new PasswordHasher().hash(password);
    const [
      { TasksSchedulerService },
      { MeetingsSchedulerService },
      { NotificationsRelayService },
    ] = await Promise.all([
      import("../src/tasks/tasks-scheduler.service.js"),
      import("../src/meetings/meetings-scheduler.service.js"),
      import("../src/notifications/notifications-relay.service.js"),
    ]);
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] })
      // Unrelated wall-clock jobs must not mutate the fixed benchmark fixture
      // or write reminder/outbox records while a source query is being profiled.
      .overrideProvider(TasksSchedulerService)
      .useValue({})
      .overrideProvider(MeetingsSchedulerService)
      .useValue({})
      .overrideProvider(NotificationsRelayService)
      .useValue({})
      .overrideProvider(FILE_OBJECT_STORAGE)
      .useValue({})
      .overrideProvider(FILE_SCANNER)
      .useValue({ scan: () => Promise.resolve("clean") })
      .compile();
    app = moduleRef.createNestApplication<NestExpressApplication>();
    configureApplication(app);
    await app.init();
    http = app.getHttpServer();
    expect(
      await app
        .get(databaseToken)
        .readModel<{ schema: string }>(
          Prisma.sql`SELECT current_schema()::text AS schema`,
        ),
    ).toEqual([{ schema: db.schema }]);
    await db.query(
      `INSERT INTO departments (id, name) VALUES ($1, 'A'), ($2, 'B'), ($3, 'Empty')`,
      [id(1), id(2), id(3)],
    );
    async function principal(
      email: string,
      roleName: string,
      departmentId?: string,
    ): Promise<Principal> {
      const role = await prisma.role.findUniqueOrThrow({
        where: { name: roleName },
      });
      const user = await prisma.user.create({
        data: {
          email,
          ...(departmentId ? { departmentId } : {}),
          credential: { create: { passwordHash: hash } },
          roleAssignment: { create: { roleId: role.id } },
        },
      });
      const response = await request(http)
        .post("/api/v1/auth/login")
        .send({ email, password });
      expect(response.status).toBe(200);
      const value: unknown = response.headers["set-cookie"];
      return {
        id: user.id,
        cookies: Array.isArray(value) ? (value as string[]) : [],
      };
    }
    admin = await principal("admin@analytics.test", "Super Admin");
    management = await principal(
      "management@analytics.test",
      "Management/Administrator",
    );
    manager = await principal(
      "manager@analytics.test",
      "Department Manager",
      id(1),
    );
    noDepartment = await principal(
      "unassigned@analytics.test",
      "Department Manager",
    );
    member = await principal("member@analytics.test", "Team Member", id(2));
    await db.query(
      `INSERT INTO workspaces (id, kind) VALUES ($1, 'EVENT'), ($2, 'EVENT'), ($3, 'CAMPAIGN'), ($4, 'CAMPAIGN');`,
      [id(21), id(22), id(23), id(24)],
    );
    await db.query(
      `INSERT INTO events (id, workspace_id, name, event_type, created_at) VALUES ($1, $2, 'Event', 'CONCERT', '2026-09-01'), ($3, $4, 'Empty', 'CONCERT', '2026-09-01')`,
      [id(31), id(21), id(32), id(22)],
    );
    await db.query(
      `INSERT INTO campaigns (id, workspace_id, name, campaign_type, created_at) VALUES ($1, $2, 'Marketing', 'MARKETING', '2026-09-01'), ($3, $4, 'Promotion', 'PROMOTION', '2026-09-01')`,
      [id(33), id(23), id(34), id(24)],
    );
    for (const [number, department, status, created, due] of [
      [41, 1, "COMPLETED", "2026-09-01", null],
      [42, 1, "TODO", "2026-09-01", "2020-01-01"],
      [43, 1, "CANCELLED", "2026-09-01", "2020-01-01"],
      [44, 2, "UNDER_REVIEW", "2026-09-01", null],
      [45, 2, "COMPLETED", "2026-10-01", null],
      [46, 2, "COMPLETED", "2026-08-31T23:59:59Z", null],
    ] as const) {
      await db.query(
        `INSERT INTO tasks (id, department_id, workspace_id, title, status, created_at, due_at) VALUES ($1, $2, $3, 'Fixture', $4, $5, $6)`,
        [id(number), id(department), id(21), status, created, due],
      );
    }
    await db.query(
      `INSERT INTO task_assignments (task_id, user_id) VALUES ($1, $2), ($1, $3), ($4, $2)`,
      [id(41), manager.id, member.id, id(42)],
    );
    await db.query(
      `INSERT INTO task_activities (task_id, type, details, occurred_at) VALUES ($1, 'STATUS_CHANGED', '{"to":"COMPLETED"}', '2026-09-01'), ($1, 'STATUS_CHANGED', '{"to":"COMPLETED"}', '2026-09-02'), ($2, 'STATUS_CHANGED', '{"to":"COMPLETED"}', '2026-09-03'), ($1, 'PROGRESS_UPDATED', '{"to":"COMPLETED"}', '2026-09-04')`,
      [id(41), id(46)],
    );
    await db.query(
      `INSERT INTO campaign_activities (id, campaign_id, name, status) VALUES ($1, $7, 'Done', 'COMPLETED'), ($2, $7, 'Planned', 'PLANNED'), ($3, $7, 'Cancelled', 'CANCELLED'), ($4, $8, 'Radio done', 'COMPLETED'), ($5, $8, 'Ordinary planned', 'PLANNED'), ($6, $8, 'Social cancelled', 'CANCELLED')`,
      [id(51), id(52), id(53), id(54), id(55), id(56), id(33), id(34)],
    );
    await db.query(
      `INSERT INTO promotion_activities (campaign_activity_id, campaign_id, channel) VALUES ($1, $3, 'RADIO_PROMOTION'), ($2, $3, 'SOCIAL_MEDIA')`,
      [id(54), id(56), id(34)],
    );
  });
  afterAll(async () => {
    await app?.close();
    await prisma?.$disconnect();
    await db?.drop();
  });
  const get = (
    route: string,
    query: Record<string, string | number> = {},
    actor: Principal = admin,
  ) =>
    request(http)
      .get(`/api/v1/analytics/${route}`)
      .set("Cookie", actor.cookies)
      .query(query);

  it("enforces current creation cohorts, exclusion of cancelled work, and server freshness", async () => {
    const before = Date.now();
    const response = await get("task-completion", period);
    expect(response.status).toBe(200);
    expect(body(response).counts).toEqual({
      total: 3,
      completed: 1,
      pending: 2,
      overdue: 1,
      percent: 33,
    });
    expect(body(response).freshness).toBe("live-current-state");
    expect(Date.parse(body(response).asOf)).toBeGreaterThanOrEqual(before);
    expect(Date.parse(body(response).asOf)).toBeLessThanOrEqual(Date.now());
    expect(response.headers["cache-control"]).toBe("no-store");
    expect(
      await app
        .get(tasksToken)
        .organization(
          { from: new Date("2026-09-01"), toExclusive: new Date("2026-10-01") },
          new Date("2020-01-01"),
        ),
    ).toMatchObject({ pending: 2, overdue: 0 });
    expect(
      body(
        await get("task-completion", {
          from: "2020-01-01",
          toExclusive: "2020-02-01",
        }),
      ).counts,
    ).toEqual({
      total: 0,
      completed: 0,
      pending: 0,
      overdue: 0,
      percent: null,
    });
    expect((await get("task-completion", period, management)).status).toBe(200);
  });
  it("filters authorized departments before paging and never falls back to organization access", async () => {
    const own = await get("departments", { ...period, pageSize: 1 }, manager);
    expect(own.status).toBe(200);
    expect(body(own).total).toBe(1);
    expect(body(own).items).toEqual([
      {
        id: id(1),
        total: 2,
        completed: 1,
        pending: 1,
        overdue: 1,
        percent: 50,
      },
    ]);
    for (const response of [
      await get("departments", { ...period, departmentId: id(2) }, manager),
      await get("departments", period, noDepartment),
      await get("departments", { ...period, page: 2, pageSize: 1 }, manager),
    ]) {
      expect(response.status).toBe(200);
      expect(body(response).items).toEqual([]);
    }
    expect(
      body(await get("departments", { ...period, departmentId: id(3) }))
        .items[0],
    ).toMatchObject({ total: 0, percent: null });
    const first = body(await get("departments", { ...period, pageSize: 1 }));
    const second = body(
      await get("departments", { ...period, pageSize: 1, page: 2 }),
    );
    expect(first.total).toBe(3);
    expect(second.total).toBe(3);
    expect(first.items[0]?.id).not.toBe(second.items[0]?.id);
  });
  it("counts shared assignments once per employee, not by creator or employee department", async () => {
    expect(
      body(await get("employees", { ...period, employeeId: manager.id })).items,
    ).toEqual([
      {
        id: manager.id,
        total: 2,
        completed: 1,
        pending: 1,
        overdue: 1,
        percent: 50,
      },
    ]);
    expect(
      body(await get("employees", { ...period, employeeId: member.id })).items,
    ).toEqual([
      {
        id: member.id,
        total: 1,
        completed: 1,
        pending: 0,
        overdue: 0,
        percent: 100,
      },
    ]);
    const empty = await get("employees", { ...period, employeeId: admin.id });
    expect(body(empty).items[0]).toMatchObject({ total: 0, percent: null });
    expect(empty.text).not.toContain("@analytics.test");
    expect(empty.text).not.toContain("password");
  });
  it("uses direct event tasks, campaign activity status, and promotion extensions as distinct denominators", async () => {
    expect(body(await get("events", { eventId: id(31) })).items).toEqual([
      { id: id(31), total: 5, completed: 3, percent: 60 },
    ]);
    expect(
      body(await get("events", { eventId: id(32) })).items[0],
    ).toMatchObject({ total: 0, percent: null });
    expect(body(await get("events", { eventId: id(999) })).items).toEqual([]);
    expect(body(await get("campaigns")).items).toEqual([
      { id: id(33), total: 2, completed: 1, percent: 50 },
    ]);
    expect(
      body(await get("campaigns", { campaignType: "PROMOTION" })).items,
    ).toEqual([{ id: id(34), total: 2, completed: 1, percent: 50 }]);
    expect(body(await get("promotion", { campaignId: id(34) })).items).toEqual([
      { channel: "RADIO_PROMOTION", total: 1, completed: 1, percent: 100 },
    ]);
    expect((await get("promotion", { campaignId: id(33) })).status).toBe(404);
  });
  it("zero-fills UTC months, includes cancelled creations, and deduplicates task completion history", async () => {
    const response = await get("monthly-activity", {
      from: "2026-09-01",
      toExclusive: "2026-12-01",
    });
    expect(response.status).toBe(200);
    expect(body(response).items).toEqual([
      {
        month: "2026-09",
        tasksCreated: 4,
        eventsCreated: 2,
        campaignsCreated: 2,
        projectsCreated: 0,
        productionsCreated: 0,
        tasksCompleted: 2,
      },
      {
        month: "2026-10",
        tasksCreated: 1,
        eventsCreated: 0,
        campaignsCreated: 0,
        projectsCreated: 0,
        productionsCreated: 0,
        tasksCompleted: 0,
      },
      {
        month: "2026-11",
        tasksCreated: 0,
        eventsCreated: 0,
        campaignsCreated: 0,
        projectsCreated: 0,
        productionsCreated: 0,
        tasksCompleted: 0,
      },
    ]);
  });
  it("rejects anonymous users and unauthorized measures without role-name shortcuts", async () => {
    for (const route of [
      "task-completion",
      "departments",
      "employees",
      "events",
      "campaigns",
      "promotion",
      "monthly-activity",
    ]) {
      expect(
        (await request(http).get(`/api/v1/analytics/${route}`)).status,
      ).toBe(401);
      expect(
        (await get(route, { ...period, campaignId: id(34) }, member)).status,
      ).toBe(403);
    }
    expect((await get("employees", period, manager)).status).toBe(403);
    expect((await get("task-completion", period, manager)).status).toBe(403);
    const assignment = await prisma.userRoleAssignment.findUniqueOrThrow({
      where: { userId: member.id },
    });
    await prisma.rolePermission.create({
      data: {
        roleId: assignment.roleId,
        permissionKey: "analytics.management.read",
        scope: "SELF",
      },
    });
    expect((await get("task-completion", period, member)).status).toBe(403);
    await prisma.rolePermission.create({
      data: {
        roleId: assignment.roleId,
        permissionKey: "analytics.employee_performance.read",
        scope: "DEPARTMENT",
      },
    });
    expect((await get("employees", period, member)).status).toBe(403);
  });
  it.each([
    ["task-completion", { ...period, from: "2026-02-30" }],
    ["task-completion", { ...period, toExclusive: period.from }],
    ["task-completion", { from: "2025-01-01", toExclusive: "2026-10-01" }],
    ["task-completion", { from: "2026-09-01" }],
    ["task-completion", { ...period, unexpected: "x" }],
    ["departments", { ...period, departmentId: "invalid" }],
    ["employees", { ...period, pageSize: 101 }],
    ["events", { page: 102, pageSize: 100 }],
    ["campaigns", { campaignType: "INVALID" }],
    ["promotion", {}],
    ["monthly-activity", { ...period, from: "2026-09-02" }],
  ] as const)(
    "returns stable ProblemDetails for invalid %s queries %j",
    async (route, query) => {
      const response = await get(route, query);
      expect(response.status).toBe(400);
      expect(response.headers["content-type"]).toContain(
        "application/problem+json",
      );
      expect(response.body as unknown).toMatchObject({
        status: 400,
        requestId: response.headers["x-request-id"],
      });
    },
  );
  it("returns a safe, request-correlated 503 instead of fabricating zero metrics", async () => {
    vi.spyOn(app.get(tasksToken), "organization").mockRejectedValueOnce(
      new Error("private SQL credentials"),
    );
    const response = await get("task-completion", period);
    expect(response.status).toBe(503);
    expect(response.body as unknown).toMatchObject({
      code: "ANALYTICS_UNAVAILABLE",
      requestId: response.headers["x-request-id"],
    });
    expect(response.text).not.toContain("private SQL credentials");
    expect(response.text).not.toContain("counts");
  });
  it.each([
    ["analytics.management.read", "task-completion", "departments"],
    ["analytics.department_performance.read", "departments", "employees"],
    ["analytics.employee_performance.read", "employees", "task-completion"],
  ])(
    "authorizes custom %s grants independently and revokes access with the same cookie",
    async (permissionKey, allowed, denied) => {
      const assignment = await prisma.userRoleAssignment.findUniqueOrThrow({
        where: { userId: manager.id },
      });
      const role = await prisma.role.create({
        data: {
          name: `Only ${permissionKey}`,
          rolePermissions: { create: { permissionKey, scope: "ORGANIZATION" } },
        },
      });
      try {
        await prisma.userRoleAssignment.update({
          where: { userId: manager.id },
          data: { roleId: role.id },
        });
        expect((await get(allowed, period, manager)).status).toBe(200);
        expect((await get(denied, period, manager)).status).toBe(403);
        await prisma.rolePermission.deleteMany({ where: { roleId: role.id } });
        expect((await get(allowed, period, manager)).status).toBe(403);
      } finally {
        await prisma.userRoleAssignment.update({
          where: { userId: manager.id },
          data: { roleId: assignment.roleId },
        });
        await prisma.role.delete({ where: { id: role.id } });
      }
    },
  );
  it("resolves changed department membership from committed state, not stale token claims", async () => {
    try {
      await prisma.user.update({
        where: { id: manager.id },
        data: { departmentId: id(2) },
      });
      const response = await get("departments", period, manager);
      expect(response.status).toBe(200);
      expect(body(response).total).toBe(1);
      expect(body(response).items).toEqual([
        {
          id: id(2),
          total: 1,
          completed: 0,
          pending: 1,
          overdue: 0,
          percent: 0,
        },
      ]);
      expect(
        body(
          await get("departments", { ...period, departmentId: id(1) }, manager),
        ).items,
      ).toEqual([]);
    } finally {
      await prisma.user.update({
        where: { id: manager.id },
        data: { departmentId: id(1) },
      });
    }
  });
  it("rejects invalid requests before any source projection runs, with exact stable codes", async () => {
    const read = vi.spyOn(app.get(databaseToken), "readModel");
    for (const [route, query, code] of [
      [
        "task-completion",
        { ...period, from: "2026-02-30" },
        "ANALYTICS_INVALID_RANGE",
      ],
      [
        "monthly-activity",
        { from: "2025-01-01", toExclusive: "2026-02-01" },
        "ANALYTICS_INVALID_RANGE",
      ],
      ["events", { page: 102, pageSize: 100 }, "ANALYTICS_INVALID_PAGE"],
      [
        "employees",
        { ...period, employeeId: "' OR true --" },
        "VALIDATION_ERROR",
      ],
      [
        "task-completion",
        { ...period, asOf: "2000-01-01" },
        "VALIDATION_ERROR",
      ],
    ] as const) {
      const response = await get(route, query);
      expect(response.status).toBe(400);
      expect(response.body as unknown).toMatchObject({
        code,
        requestId: response.headers["x-request-id"],
      });
    }
    expect(read).not.toHaveBeenCalled();
  });
  it("observes committed status, ownership and assignment changes but not rolled-back completion history", async () => {
    try {
      await prisma.$transaction([
        prisma.task.update({
          where: { id: id(42) },
          data: { status: "COMPLETED" },
        }),
        prisma.task.update({
          where: { id: id(41) },
          data: { departmentId: id(2) },
        }),
        prisma.taskAssignment.delete({
          where: { taskId_userId: { taskId: id(41), userId: manager.id } },
        }),
      ]);
      expect(body(await get("task-completion", period)).counts).toEqual({
        total: 3,
        completed: 2,
        pending: 1,
        overdue: 0,
        percent: 67,
      });
      expect(
        body(await get("departments", { ...period, departmentId: id(2) }))
          .items[0],
      ).toMatchObject({ total: 2, completed: 1, percent: 50 });
      expect(
        body(await get("employees", { ...period, employeeId: manager.id }))
          .items[0],
      ).toMatchObject({ total: 1, completed: 1, percent: 100 });
      await expect(
        prisma.$transaction(async (tx) => {
          await tx.task.update({
            where: { id: id(42) },
            data: { status: "CANCELLED" },
          });
          await tx.taskActivity.create({
            data: {
              taskId: id(42),
              type: "STATUS_CHANGED",
              details: { to: "COMPLETED" },
              occurredAt: new Date("2026-09-05"),
            },
          });
          throw new Error("intentional fixture rollback");
        }),
      ).rejects.toThrow("intentional fixture rollback");
      expect(body(await get("task-completion", period)).counts.completed).toBe(
        2,
      );
      expect(
        body(await get("monthly-activity", period)).items[0]?.tasksCompleted,
      ).toBe(2);
    } finally {
      await prisma.$transaction([
        prisma.task.update({ where: { id: id(42) }, data: { status: "TODO" } }),
        prisma.task.update({
          where: { id: id(41) },
          data: { departmentId: id(1) },
        }),
        prisma.taskAssignment.upsert({
          where: { taskId_userId: { taskId: id(41), userId: manager.id } },
          create: { taskId: id(41), userId: manager.id },
          update: {},
        }),
      ]);
    }
  });
  it("keeps metrics exact after source uniqueness and promotion ownership conflicts", async () => {
    await expect(
      db.query(
        "INSERT INTO task_assignments (task_id, user_id) VALUES ($1, $2)",
        [id(41), manager.id],
      ),
    ).rejects.toMatchObject({ code: PG_ERROR.uniqueViolation });
    await expect(
      db.query(
        "INSERT INTO promotion_activities (campaign_activity_id, campaign_id, channel) VALUES ($1, $2, 'RADIO_PROMOTION')",
        [id(51), id(34)],
      ),
    ).rejects.toMatchObject({ code: PG_ERROR.foreignKeyViolation });
    expect(
      body(await get("employees", { ...period, employeeId: manager.id }))
        .items[0],
    ).toMatchObject({ total: 2, completed: 1 });
    expect(body(await get("promotion", { campaignId: id(34) })).items).toEqual([
      { channel: "RADIO_PROMOTION", total: 1, completed: 1, percent: 100 },
    ]);
  });
  it("respects microsecond UTC month boundaries, timezone offsets and repeated transitions across months", async () => {
    try {
      await db.query(
        `INSERT INTO tasks (id, department_id, title, status, created_at) VALUES
        ($1, $4, 'UTC before February', 'COMPLETED', '2024-01-31T23:59:59.999999Z'),
        ($2, $4, 'Offset in February', 'TODO', '2024-01-31T23:00:00-02:00'),
        ($3, $4, 'Exclusive March boundary', 'TODO', '2024-03-01T00:00:00Z')`,
        [id(71), id(72), id(73), id(1)],
      );
      await db.query(
        `INSERT INTO task_activities (task_id, type, details, occurred_at) VALUES
        ($1, 'STATUS_CHANGED', '{"to":"COMPLETED"}', '2024-01-31T23:59:59.999999Z'),
        ($1, 'STATUS_CHANGED', '{"to":"COMPLETED"}', '2024-01-31T23:59:59Z'),
        ($1, 'STATUS_CHANGED', '{"to":"COMPLETED"}', '2024-02-01T00:00:00Z'),
        ($2, 'PROGRESS_UPDATED', '{"to":"COMPLETED"}', '2024-02-01T00:00:00Z')`,
        [id(71), id(72)],
      );
      const response = await get("monthly-activity", {
        from: "2024-01-01",
        toExclusive: "2024-03-01",
      });
      expect(response.status).toBe(200);
      expect(body(response).items).toEqual(
        ["2024-01", "2024-02"].map((month) => ({
          month,
          tasksCreated: 1,
          tasksCompleted: 1,
          eventsCreated: 0,
          campaignsCreated: 0,
          projectsCreated: 0,
          productionsCreated: 0,
        })),
      );
      const before = await db.query(
        "SELECT id, status, created_at FROM tasks WHERE id IN ($1, $2, $3) ORDER BY id",
        [id(71), id(72), id(73)],
      );
      expect(
        body(
          await get("task-completion", {
            from: "2024-01-01",
            toExclusive: "2024-03-01",
          }),
        ).counts,
      ).toMatchObject({ total: 2, completed: 1, percent: 50 });
      expect(
        await db.query(
          "SELECT id, status, created_at FROM tasks WHERE id IN ($1, $2, $3) ORDER BY id",
          [id(71), id(72), id(73)],
        ),
      ).toEqual(before);
    } finally {
      await prisma.task.deleteMany({
        where: { id: { in: [id(71), id(72), id(73)] } },
      });
    }
  });
  it("does not publish a partial monthly summary when a source projection fails", async () => {
    vi.spyOn(app.get(databaseToken), "readModel").mockRejectedValueOnce(
      new Error("source unavailable"),
    );
    const response = await get("monthly-activity", period);
    expect(response.status).toBe(503);
    expect(response.body as unknown).toMatchObject({
      code: "ANALYTICS_UNAVAILABLE",
      requestId: response.headers["x-request-id"],
    });
    expect(response.text).not.toContain("items");
    expect(response.text).not.toContain("source unavailable");
  });
  it("cancels slow projections and keeps the pool usable after rollback", async () => {
    const database = app.get(databaseToken);
    await expect(
      database.readModel(Prisma.sql`SELECT 1::int AS value FROM pg_sleep(0.7)`),
    ).rejects.toThrow();
    expect(
      await database.readModel<{ value: number }>(
        Prisma.sql`SELECT 1::int AS value`,
      ),
    ).toEqual([{ value: 1 }]);
  });
  it("meets the warm API budget on the approved representative data volume", async () => {
    await db.query(
      readFileSync(
        new URL("./fixtures/analytics-api-scale.sql", import.meta.url),
        "utf8",
      ),
    );
    const [campaign] = await db.query<{ id: string }>(
      // MD5 benchmark identifiers are PostgreSQL UUIDs but not necessarily
      // RFC UUIDs. Select one satisfying the public transport validator.
      "SELECT id FROM campaigns WHERE name = 'Campaign' AND campaign_type = 'PROMOTION' AND id::text ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab]' ORDER BY id LIMIT 1",
    );
    // Capture actual source SQL used by the authenticated endpoints, not just
    // the ANA-01 design specimens. Keep bindings and EXPLAIN them in this schema.
    const statements = new Map<string, Prisma.Sql>();
    const database = app.get(databaseToken);
    const originalRead = database.readModel.bind(database);
    const capture = vi
      .spyOn(database, "readModel")
      .mockImplementation(<T>(query: Prisma.Sql): Promise<T[]> => {
        statements.set(query.text, query);
        return originalRead<T>(query);
      });
    for (const [route, query] of [
      ["task-completion", period],
      ["departments", { ...period, pageSize: 100 }],
      ["employees", { ...period, pageSize: 100 }],
      ["events", { pageSize: 100 }],
      ["campaigns", { pageSize: 100 }],
      ["promotion", { campaignId: campaign!.id }],
      ["monthly-activity", { from: "2026-01-01", toExclusive: "2027-01-01" }],
    ] as const) {
      expect((await get(route, query)).status).toBe(200);
      const samples: number[] = [];
      for (let n = 0; n < 20; n++) {
        const start = performance.now();
        const response = await get(route, query);
        samples.push(performance.now() - start);
        expect(response.status).toBe(200);
        if (route !== "task-completion")
          expect(body(response).items.length).toBeLessThanOrEqual(
            route === "monthly-activity" ? 12 : route === "promotion" ? 7 : 100,
          );
      }
      samples.sort((a, b) => a - b);
      const p95 = samples[Math.ceil(samples.length * 0.95) - 1]!;
      console.info(
        `EVE-172 ${route}: warm p95 ${p95.toFixed(1)} ms / 20 requests`,
      );
      expect(p95).toBeLessThan(750);
    }
    capture.mockRestore();
    expect(statements.size).toBeGreaterThanOrEqual(18);
    for (const [text, query] of statements) {
      const samples: number[] = [];
      let plan: RuntimePlan | undefined;
      for (let n = 0; n < 20; n++) {
        const [row] = await db.query<{ "QUERY PLAN": RuntimePlan[] }>(
          `EXPLAIN (ANALYZE, BUFFERS, FORMAT JSON) ${text}`,
          query.values,
        );
        plan = row!["QUERY PLAN"][0]!;
        expect(plan.Plan["Actual Rows"]).toBeGreaterThanOrEqual(0);
        expect(plan.Plan["Actual Rows"]).toBeLessThanOrEqual(100);
        samples.push(plan["Planning Time"] + plan["Execution Time"]);
      }
      const p95 = samples.toSorted((a, b) => a - b)[18]!;
      console.info(
        JSON.stringify({
          runtimeSql: text,
          samples: 20,
          p95Ms: p95,
          rows: plan!.Plan["Actual Rows"],
          sharedHitBlocks: plan!.Plan["Shared Hit Blocks"],
          sharedReadBlocks: plan!.Plan["Shared Read Blocks"],
        }),
      );
      expect(Number.isFinite(p95)).toBe(true);
      expect(p95, text).toBeLessThanOrEqual(500);
    }
  }, 120_000);
});
