import { beforeAll, afterAll, describe, it, expect, vi } from "vitest";
import { readFileSync } from "node:fs";
import { createHash } from "node:crypto";
import type { Prisma } from "../src/generated/prisma/client.js";
import request from "supertest";
import type { NestExpressApplication } from "@nestjs/platform-express";
import type { DashboardResponse } from "../src/dashboards/dashboards.contracts.js";
import type { DashboardList } from "../src/dashboards/dashboards.contracts.js";
import type { DatabaseService } from "../src/database/database.service.js";
import type { Environment } from "../src/config/environment.js";
import type {
  ReadContext,
  ReadWindow,
} from "../src/common/queries/operational-read.js";
import type { EffectiveGrant } from "../src/common/security/permissions.service.js";
import {
  createIsolatedDatabase,
  type IsolatedDatabase,
} from "./support/database.js";
const id = (n: number) =>
  `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const now = new Date("2026-10-06T12:00:00.000Z");
const window: ReadWindow = {
  from: new Date("2026-10-06T00:00:00.000Z"),
  to: new Date("2026-10-07T00:00:00.000Z"),
  asOf: now,
  limit: 5,
};
describe("dashboard persistence and API verification (EVE-178 / EVE-179)", () => {
  let isolated: IsolatedDatabase, db: DatabaseService;
  let queries: Awaited<ReturnType<typeof makeQueries>>;
  async function makeQueries() {
    const [
      { TasksDashboardQuery },
      { EventsDashboardQuery },
      { ProjectsDashboardQuery },
      { MeetingsDashboardQuery },
      { TodoDashboardQuery },
      { CalendarDashboardQuery },
      { DiscussDashboardQuery },
      { CampaignsDashboardQuery },
      { UsersDashboardQuery },
      { TalentDashboardQuery },
    ] = await Promise.all([
      import("../src/tasks/tasks-dashboard.query.js"),
      import("../src/events/events-dashboard.query.js"),
      import("../src/projects/projects-dashboard.query.js"),
      import("../src/meetings/meetings-dashboard.query.js"),
      import("../src/todo/todo-dashboard.query.js"),
      import("../src/calendar/calendar-dashboard.query.js"),
      import("../src/discuss/discuss-dashboard.query.js"),
      import("../src/campaigns/campaigns-dashboard.query.js"),
      import("../src/users/users-dashboard.query.js"),
      import("../src/talent/talent-dashboard.query.js"),
    ]);
    return {
      tasks: new TasksDashboardQuery(db),
      events: new EventsDashboardQuery(db),
      projects: new ProjectsDashboardQuery(db),
      meetings: new MeetingsDashboardQuery(db),
      todo: new TodoDashboardQuery(db),
      calendar: new CalendarDashboardQuery(db),
      discuss: new DiscussDashboardQuery(db),
      campaigns: new CampaignsDashboardQuery(db),
      users: new UsersDashboardQuery(db),
      talent: new TalentDashboardQuery(db),
    };
  }
  const ctx = (user = 1, scopes: EffectiveGrant[] = []): ReadContext => ({
    userId: id(user),
    grants: scopes,
    departmentId: id(10),
    selfOnly: true,
  });
  const organization = (): ReadContext => ({
    ...ctx(
      1,
      [
        "task.read",
        "event.read",
        "project.read",
        "meeting.read",
        "todo.read",
        "calendar.read",
        "conversation.read",
        "campaign.read",
        "user.read",
        "talent.read",
      ].map((permissionKey) => ({ permissionKey, scope: "ORGANIZATION" })),
    ),
    selfOnly: false,
  });
  beforeAll(async () => {
    isolated = await createIsolatedDatabase();
    // Fake Date only: socket/DB timers and performance.now stay real.
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(now);
    process.env.DATABASE_URL = isolated.url;
    process.env.NODE_ENV = "test";
    process.env.LOG_LEVEL = "silent";
    process.env.FILE_SCANNER_MODE = "test";
    process.env.AUTH_LOGIN_RATE_LIMIT_MAX = "10000";
    process.env.API_RATE_LIMIT_MAX = "100000";
    process.env.AUTH_ACCESS_TOKEN_SECRET =
      "dashboard-test-access-secret-at-least-32";
    process.env.AUTH_REFRESH_TOKEN_SECRET =
      "dashboard-test-refresh-secret-at-least-32";
    const { DatabaseService } =
      await import("../src/database/database.service.js");
    db = new DatabaseService({ DATABASE_URL: isolated.url } as Environment);
    queries = await makeQueries();
    await isolated.query(
      "INSERT INTO departments(id,name) VALUES ($1,'A'),($2,'B')",
      [id(10), id(11)],
    );
    await isolated.query(
      "INSERT INTO users(id,email,department_id) VALUES ($1,'a@example.test',$3),($2,'b@example.test',$4)",
      [id(1), id(2), id(10), id(11)],
    );
    await isolated.query(
      "INSERT INTO workspaces(id,kind,manager_id) VALUES ($1,'EVENT',$4),($2,'PROJECT',$4),($3,'CAMPAIGN',$4)",
      [id(20), id(21), id(22), id(1)],
    );
    await isolated.query(
      "INSERT INTO events(id,workspace_id,name,event_type,status,start_at,end_at) VALUES ($1,$2,'Event','OTHER','READY','2026-10-06T11:00Z','2026-10-06T13:00Z')",
      [id(30), id(20)],
    );
    await isolated.query(
      "INSERT INTO projects(id,workspace_id,name,status,start_at,end_at) VALUES ($1,$2,'Project','ACTIVE','2026-10-05T00:00Z','2026-10-06T14:00Z')",
      [id(31), id(21)],
    );
    await isolated.query(
      "INSERT INTO campaigns(id,workspace_id,name,campaign_type,status) VALUES ($1,$2,'Campaign','MARKETING','ACTIVE')",
      [id(32), id(22)],
    );
    await isolated.query(
      "INSERT INTO campaign_activities(id,campaign_id,name,status,end_at) VALUES ($1,$2,'Activity','IN_PROGRESS','2026-10-06T10:00Z')",
      [id(33), id(32)],
    );
    await isolated.query(
      "INSERT INTO talents(id,full_name,type,availability) VALUES ($1,'Active talent','ARTIST','UNAVAILABLE'),($2,'Inactive talent','ARTIST','INACTIVE')",
      [id(34), id(35)],
    );
    for (let n = 0; n < 13; n++) {
      await isolated.query(
        "INSERT INTO tasks(id,department_id,title,status,due_at) VALUES ($1,$2,$3,'TODO','2026-10-06T11:00Z')",
        [id(100 + n), id(10), "Task " + n],
      );
      await isolated.query(
        "INSERT INTO task_assignments(task_id,user_id) VALUES ($1,$2)",
        [id(100 + n), id(1)],
      );
    }
    await isolated.query(
      "INSERT INTO tasks(id,department_id,title,status,due_at) VALUES ($1,$4,'Under review','UNDER_REVIEW','2026-10-06T12:00Z'),($2,$4,'Done','COMPLETED','2026-10-06T11:00Z'),($3,$4,'Cancelled','CANCELLED','2026-10-06T11:00Z')",
      [id(120), id(121), id(122), id(10)],
    );
    await isolated.query(
      "INSERT INTO tasks(id,department_id,title,status,due_at) VALUES ($1,$2,'Other department','TODO','2026-10-06T11:00Z')",
      [id(123), id(11)],
    );
    await isolated.query(
      "INSERT INTO task_assignments(task_id,user_id) VALUES ($1,$2),($1,$3),($4,$3)",
      [id(123), id(1), id(2), id(100)],
    );
    await isolated.query(
      "INSERT INTO task_activities(id,task_id,actor_id,type,occurred_at,details) VALUES ($1,$2,$3,'STATUS_CHANGED','2026-10-06T10:00Z','{\"secret\":\"hidden\"}')",
      [id(130), id(100), id(2)],
    );
    await isolated.query(
      "INSERT INTO meetings(id,title,type,organizer_id,start_at,end_at,location) VALUES ($1,'Meeting','PHYSICAL',$2,'2026-10-06T13:00Z','2026-10-06T14:00Z','Room A')",
      [id(140), id(2)],
    );
    await isolated.query(
      "INSERT INTO meeting_participants(meeting_id,user_id,response,responded_at) VALUES ($1,$2,'DECLINED','2026-10-06T10:00Z')",
      [id(140), id(1)],
    );
    await isolated.query(
      "INSERT INTO todos(id,user_id,title,due_date,due_time,priority) VALUES ($1,$2,'My Todo','2026-10-06','15:30','URGENT'),($3,$4,'Private Todo','2026-10-06',NULL,'LOW')",
      [id(150), id(1), id(151), id(2)],
    );
    await isolated.query(
      "INSERT INTO calendar_entries(id,user_id,title,type,start_at) VALUES ($1,$2,'Private calendar','PERSONAL','2026-10-06T09:00Z'),($3,$4,'Other calendar','PERSONAL','2026-10-06T09:00Z')",
      [id(160), id(1), id(161), id(2)],
    );
    await isolated.query(
      "INSERT INTO conversations(id,type,name,visibility) VALUES ($1,'CHANNEL','Joined','PRIVATE'),($2,'CHANNEL','Not joined','PUBLIC')",
      [id(170), id(171)],
    );
    await isolated.query(
      "INSERT INTO conversation_members(conversation_id,user_id) VALUES ($1,$2)",
      [id(170), id(1)],
    );
    await isolated.query(
      "INSERT INTO messages(id,conversation_id,author_id,content,created_at) VALUES ($1,$5,$6,'Read','2026-10-06T10:00Z'),($2,$5,$6,'Unread tied','2026-10-06T10:00Z'),($3,$5,$7,'Own','2026-10-06T11:00Z'),($4,$5,$6,'Deleted','2026-10-06T11:00Z')",
      [id(180), id(181), id(182), id(183), id(170), id(2), id(1)],
    );
    await isolated.query(
      "UPDATE messages SET deleted_at='2026-10-06T12:00Z' WHERE id=$1",
      [id(183)],
    );
    await isolated.query(
      "UPDATE conversation_members SET last_read_message_id=$1,last_read_at='2026-10-06T12:00Z' WHERE conversation_id=$2",
      [id(180), id(170)],
    );
    await isolated.query(
      "UPDATE tasks SET created_at='2026-09-01T00:00Z'; UPDATE events SET created_at='2026-09-01T00:00Z'; UPDATE projects SET created_at='2026-09-01T00:00Z'; UPDATE campaigns SET created_at='2026-09-01T00:00Z'",
    );
  });
  afterAll(async () => {
    try {
      await db?.$disconnect();
      await isolated?.drop();
    } finally {
      vi.useRealTimers();
    }
  });
  it("batches exact current task counts without assignment multiplication", async () => {
    expect((await queries.tasks.counts(organization(), now)).data).toEqual({
      pendingTasks: 15,
      completedTasks: 1,
      overdueTasks: 14,
    });
  });
  it("enforces source policy before SQL and intersects department with assignment", async () => {
    const spy = vi.spyOn(db, "readModel");
    await expect(queries.events.counts(ctx(), window)).rejects.toThrow();
    expect(spy).not.toHaveBeenCalled();
    spy.mockRestore();
    const result = await queries.tasks.list(
      ctx(1, [{ permissionKey: "task.read", scope: "DEPARTMENT" }]),
      "tasks",
      window,
    );
    expect(result.data.items.every((i) => i.title !== "Other department")).toBe(
      true,
    );
    expect(result.data.hasMore).toBe(true);
    expect(result.data.items).toHaveLength(5);
    const onlySelf = await queries.tasks.list(
      ctx(2, [{ permissionKey: "task.read", scope: "SELF" }]),
      "tasks",
      window,
    );
    expect(onlySelf.data.items.map((i) => i.id)).toEqual([id(100), id(123)]);
  });
  it("never broadens a management SELF task grant through an unrelated department grant", async () => {
    const actor = {
      ...ctx(2, [
        { permissionKey: "task.read", scope: "SELF" },
        { permissionKey: "project.read", scope: "DEPARTMENT" },
      ]),
      selfOnly: false,
    };
    const result = await queries.tasks.list(actor, "attention", window);
    expect(result.data.items.map((item) => item.id)).toEqual([
      id(100),
      id(123),
    ]);
  });
  it("uses actual owner count and dated source definitions", async () => {
    expect(
      (
        await queries.events.counts(organization(), {
          ...window,
          from: now,
          to: new Date(now.getTime() + 7 * 86400000),
        })
      ).data,
    ).toEqual({ totalEvents: 1, upcomingEvents: 0 });
    expect(
      (await queries.events.list(organization(), false, window)).data.items[0]
        ?.id,
    ).toBe(id(30));
    expect(
      (await queries.projects.counts(organization())).data.activeProjects,
    ).toBe(1);
    expect(
      (await queries.projects.list(organization(), true, window)).data.items[0]
        ?.id,
    ).toBe(id(31));
    expect((await queries.campaigns.count(organization())).data.count).toBe(1);
    expect(
      (await queries.campaigns.overdue(organization(), window)).data.items[0]
        ?.title,
    ).toBe("Activity");
    expect((await queries.users.count(organization())).data.count).toBe(2);
    expect((await queries.talent.count(organization())).data.count).toBe(1);
  });
  it("excludes declined meetings only in employee upcoming work", async () => {
    const employee = { ...organization(), selfOnly: true };
    expect(
      (
        await queries.meetings.list(employee, true, {
          ...window,
          from: now,
          to: new Date(now.getTime() + 7 * 86400000),
        })
      ).data.items,
    ).toEqual([]);
    expect(
      (await queries.meetings.list(employee, false, window)).data.items,
    ).toHaveLength(1);
  });
  it("doesn't broaden personal ownership with organization grants", async () => {
    const owner = { ...organization(), selfOnly: true };
    expect((await queries.todo.list(owner, false, window)).data.items).toEqual([
      expect.objectContaining({
        id: id(150),
        dueDate: "2026-10-06",
        dueTime: "15:30:00",
      }),
    ]);
    expect(
      (await queries.calendar.list(owner, window)).data.items.map((i) => i.id),
    ).toEqual([id(160)]);
    expect(
      (await queries.tasks.list(owner, "activity", window)).data.items[0],
    ).toEqual(expect.objectContaining({ id: id(130), taskId: id(100) }));
    expect(
      JSON.stringify(
        (await queries.tasks.list(owner, "activity", window)).data,
      ),
    ).not.toContain("hidden");
  });
  it("limits floating deadlines after optional-time ordering, not priority", async () => {
    await isolated.query(
      "INSERT INTO todos(id,user_id,title,due_date,due_time,priority) VALUES ($1,$3,'Late','2026-10-06','17:00','URGENT'),($2,$3,'Early','2026-10-06','08:00','LOW')",
      [id(152), id(153), id(1)],
    );
    try {
      const result = await queries.todo.list(organization(), true, {
        ...window,
        limit: 1,
      });
      expect(result.data.items.map((item) => item.id)).toEqual([id(153)]);
      expect(result.data.hasMore).toBe(true);
      await isolated.query(
        "UPDATE todos SET due_time='08:00',priority=CASE WHEN id=$1 THEN 'LOW'::todo_priority ELSE 'URGENT'::todo_priority END WHERE id IN ($1,$2)",
        [id(152), id(153)],
      );
      const tied = await queries.todo.list(organization(), true, {
        ...window,
        limit: 1,
      });
      expect(tied.data.items.map((item) => item.id)).toEqual([id(152)]);
    } finally {
      await isolated.query("DELETE FROM todos WHERE id IN ($1,$2)", [
        id(152),
        id(153),
      ]);
    }
  });
  it("checks UTC midnight, upper equality, overlaps, undated work and overdue equality", async () => {
    await isolated.query(
      "INSERT INTO tasks(id,title,status,due_at,created_at,department_id) VALUES ($1,'Midnight','TODO','2026-10-06T00:00Z','2026-09-01','00000000-0000-4000-8000-000000000010'),($2,'Next midnight','TODO','2026-10-07T00:00Z','2026-10-01','00000000-0000-4000-8000-000000000010'),($3,'Undated','BLOCKED',NULL,'2026-09-30T23:59:59.999Z','00000000-0000-4000-8000-000000000010')",
      [id(200), id(201), id(202)],
    );
    await isolated.query(
      "INSERT INTO workspaces(id,kind) VALUES ($1,'EVENT'),($2,'EVENT'),($3,'EVENT')",
      [id(210), id(211), id(212)],
    );
    await isolated.query(
      "INSERT INTO events(id,workspace_id,name,event_type,status,start_at,end_at) VALUES ($1,$4,'Ends at midnight','OTHER','READY','2026-10-05T23:00Z','2026-10-06T00:00Z'),($2,$5,'Overlaps midnight','OTHER','READY','2026-10-05T23:00Z','2026-10-06T00:00:00.001Z'),($3,$6,'Upper upcoming','OTHER','READY','2026-10-13T12:00Z',NULL)",
      [id(213), id(214), id(215), id(210), id(211), id(212)],
    );
    try {
      expect((await queries.tasks.counts(organization(), now)).data).toEqual({
        pendingTasks: 18,
        completedTasks: 1,
        overdueTasks: 15,
      });
      const deadlines = await queries.tasks.list(organization(), "deadlines", {
        ...window,
        limit: 10,
      });
      // The fixture's 14 earlier deadlines fill the first page; inspect a narrow day-start slice.
      expect(
        (
          await queries.tasks.list(organization(), "deadlines", {
            ...window,
            to: new Date("2026-10-06T00:00:00.001Z"),
          })
        ).data.items.map((i) => i.id),
      ).toEqual([id(200)]);
      expect(
        deadlines.data.items.some((i) => i.id === id(201) || i.id === id(202)),
      ).toBe(false);
      const upperOnly = {
        ...window,
        from: new Date("2026-10-06T23:59:59.999Z"),
      };
      expect(
        (await queries.tasks.list(organization(), "deadlines", upperOnly)).data
          .items,
      ).toEqual([]);
      expect(
        (
          await queries.tasks.list(organization(), "deadlines", {
            ...upperOnly,
            to: new Date("2026-10-07T00:00:00.001Z"),
          })
        ).data.items.map((i) => i.id),
      ).toEqual([id(201)]);
      expect(
        (
          await queries.events.list(organization(), false, window)
        ).data.items.map((i) => i.id),
      ).toEqual([id(214), id(30)]);
      expect(
        (
          await queries.events.counts(organization(), {
            ...window,
            from: now,
            to: new Date("2026-10-13T12:00Z"),
          })
        ).data.upcomingEvents,
      ).toBe(0);
      const floatingWindow = {
        ...window,
        from: new Date("2026-10-05T12:00Z"),
        to: new Date("2026-10-06T00:00Z"),
      };
      expect(
        (await queries.todo.list(organization(), true, floatingWindow)).data
          .items,
      ).toEqual([]);
      expect(
        (
          await queries.todo.list(organization(), true, {
            ...floatingWindow,
            to: new Date("2026-10-06T00:00:00.001Z"),
          })
        ).data.items.map((i) => i.id),
      ).toEqual([id(150)]);
    } finally {
      await isolated.query("DELETE FROM tasks WHERE id IN ($1,$2,$3);", [
        id(200),
        id(201),
        id(202),
      ]);
      await isolated.query("DELETE FROM events WHERE id IN ($1,$2,$3)", [
        id(213),
        id(214),
        id(215),
      ]);
      await isolated.query("DELETE FROM workspaces WHERE id IN ($1,$2,$3)", [
        id(210),
        id(211),
        id(212),
      ]);
    }
  });
  it("uses message tuple, not read-update timestamp; excludes own/deleted/non-member", async () => {
    expect((await queries.discuss.unread(organization(), window)).data).toEqual(
      {
        count: 1,
        totalConversations: 1,
        items: [{ conversationId: id(170), count: 1 }],
        hasMore: false,
      },
    );
    expect(
      (await queries.discuss.channels(organization(), window)).data.count,
    ).toBe(1);
    expect(
      (
        await queries.discuss.unread(
          { ...organization(), userId: id(2) },
          window,
        )
      ).data.count,
    ).toBe(0);
    await isolated.query(
      "UPDATE conversation_members SET last_read_message_id=NULL,last_read_at=NULL WHERE conversation_id=$1",
      [id(170)],
    );
    expect(
      (await queries.discuss.unread(organization(), window)).data.count,
    ).toBe(2);
    await isolated.query(
      "UPDATE conversation_members SET last_read_at='2026-10-06T10:30Z' WHERE conversation_id=$1",
      [id(170)],
    );
    expect(
      (await queries.discuss.unread(organization(), window)).data.count,
    ).toBe(0);
    await isolated.query(
      "DELETE FROM conversation_members WHERE conversation_id=$1",
      [id(170)],
    );
    expect(
      (await queries.discuss.channels(organization(), window)).data.count,
    ).toBe(0);
  });
  it("cancels source SQL with statement timeout and bounds nested concurrency", async () => {
    const { Prisma } = await import("../src/generated/prisma/client.js");
    await expect(
      db.readModel(Prisma.sql`SELECT 1 AS value FROM pg_sleep(1)`),
    ).rejects.toThrow();
    let active = 0,
      max = 0;
    const original = db.$transaction.bind(db);
    const spy = vi
      .spyOn(db, "$transaction")
      .mockImplementation((...args: Parameters<typeof db.$transaction>) => {
        active++;
        max = Math.max(max, active);
        return original(...args).finally(() => active--);
      });
    await db.withReadConcurrency(4, () =>
      Promise.all(
        Array.from({ length: 8 }, () =>
          db.readModel(Prisma.sql`SELECT 1 AS value FROM pg_sleep(0.01)`),
        ),
      ),
    );
    spy.mockRestore();
    expect(max).toBeLessThanOrEqual(4);
  });
  it("verifies exact HTTP results, live access, faults, persistence and representative query budgets", async () => {
    const [
      { Test },
      { AppModule },
      { configureApplication },
      { PasswordHasher },
      { seedRbac },
      { TasksSchedulerService },
      { MeetingsSchedulerService },
      { NotificationsRelayService },
      { FILE_OBJECT_STORAGE },
      { FILE_SCANNER },
    ] = await Promise.all([
      import("@nestjs/testing"),
      import("../src/app.module.js"),
      import("../src/app.setup.js"),
      import("../src/auth/domain/password-hasher.js"),
      import("../src/rbac/seed-rbac.js"),
      import("../src/tasks/tasks-scheduler.service.js"),
      import("../src/meetings/meetings-scheduler.service.js"),
      import("../src/notifications/notifications-relay.service.js"),
      import("../src/file-management/storage/object-storage.js"),
      import("../src/file-management/file-scanner.js"),
    ]);
    await seedRbac(db);
    const password = "dashboard test password";
    const passwordHash = await new PasswordHasher().hash(password);
    for (const [n, roleName] of [
      [1, "Super Admin"],
      [2, "Team Member"],
    ] as const) {
      const role = await db.role.findUniqueOrThrow({
        where: { name: roleName },
      });
      await db.user.update({
        where: { id: id(n) },
        data: {
          credential: { create: { passwordHash } },
          roleAssignment: { create: { roleId: role.id } },
        },
      });
    }
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] })
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
    const app = moduleRef.createNestApplication<NestExpressApplication>();
    configureApplication(app);
    try {
      await app.init();
      const http = app.getHttpServer();
      const login = async (email: string) => {
        const response = await request(http)
          .post("/api/v1/auth/login")
          .send({ email, password })
          .expect(200);
        const cookies: unknown = response.headers["set-cookie"];
        expect(Array.isArray(cookies)).toBe(true);
        return cookies as string[];
      };
      const admin = await login("a@example.test"),
        member = await login("b@example.test");
      const get = async (
        audience: "management" | "employee",
        cookies = admin,
        query: Record<string, string | number> = {},
      ) => {
        const response = await request(http)
          .get(`/api/v1/dashboards/${audience}`)
          .query(query)
          .set("Cookie", cookies)
          .expect(200);
        return response.body as DashboardResponse;
      };
      const list = (response: DashboardResponse, key: string) =>
        response.cards[key]!.data as DashboardList;
      const databaseToken = (
        await import("../src/database/database.service.js")
      ).DatabaseService;
      const database = app.get(databaseToken);
      await request(http).get("/api/v1/dashboards/employee").expect(401);
      await request(http)
        .get("/api/v1/dashboards/management")
        .set("Cookie", member)
        .expect(403);
      for (const query of [
        "limit=11",
        "day=2026-02-30",
        "cards=totalEvents,totalEvents",
        "userId=other",
        "cards=totalEvents&cards=activeProjects",
        "from=2026-01-01",
        "from=2026-01-01&toExclusive=2026-01-01",
        "from=2025-01-01&toExclusive=2026-10-01",
        "months=13",
        "months=0",
        "promotionCampaignId=bad",
        "asOf=2026-01-01",
        "limit=1.5",
        "limit=0",
      ]) {
        await request(http)
          .get(`/api/v1/dashboards/management?${query}`)
          .set("Cookie", admin)
          .expect(400);
      }
      const management = await request(http)
        .get("/api/v1/dashboards/management?day=2026-10-06&limit=2")
        .set("Cookie", admin)
        .expect(200);
      expect(management.headers["cache-control"]).toBe("no-store");
      const result = management.body as DashboardResponse;
      expect(Object.keys(result.cards)).toHaveLength(23);
      expect(result.partial).toBe(false);
      expect(result.cards.totalEvents?.data).toEqual({ count: 1 });
      expect(result.cards.promotionPerformance?.state).toBe(
        "selectionRequired",
      );
      const employee = await request(http)
        .get("/api/v1/dashboards/employee?cards=myTasks,myTodo&limit=10")
        .set("Cookie", member)
        .expect(200);
      const own = employee.body as DashboardResponse;
      expect(own.cards.myTasks?.scope).toBe("self");
      expect(own.cards.myTasks?.data).toHaveProperty("items.length", 2);
      expect(own.cards.myTodo?.data).toHaveProperty("items.0.id", id(151));
      expect(JSON.stringify(own)).not.toContain("secret");
      for (const [key, count] of Object.entries({
        totalEvents: 1,
        upcomingEvents: 0,
        activeProjects: 1,
        activeCampaigns: 1,
        pendingTasks: 15,
        completedTasks: 1,
        overdueTasks: 14,
        activeEmployees: 2,
        activeTalents: 1,
      })) {
        expect(result.cards[key]).toMatchObject({
          state: "ready",
          scope: "organization",
          data: { count },
        });
      }
      const cohort = await get("management", admin, {
        cards:
          "taskCompletionRate,departmentPerformance,eventProgress,marketingProgress,monthlyActivity",
        from: "2026-09-01",
        toExclusive: "2026-10-01",
        limit: 10,
      });
      expect(cohort.cards.taskCompletionRate?.data).toHaveProperty("counts", {
        total: 16,
        completed: 1,
        pending: 15,
        overdue: 14,
        percent: 6,
      });
      expect(cohort.cards.departmentPerformance?.data).toHaveProperty("items", [
        {
          id: id(10),
          total: 15,
          completed: 1,
          pending: 14,
          overdue: 13,
          percent: 7,
        },
        {
          id: id(11),
          total: 1,
          completed: 0,
          pending: 1,
          overdue: 1,
          percent: 0,
        },
      ]);
      expect(cohort.cards.eventProgress?.data).toHaveProperty("items", [
        { id: id(30), total: 0, completed: 0, percent: null },
      ]);
      expect(cohort.cards.marketingProgress?.data).toHaveProperty("items", [
        { id: id(32), total: 1, completed: 0, percent: 0 },
      ]);
      expect(cohort.cards.monthlyActivity?.data).toHaveProperty("items", [
        {
          month: "2026-08",
          tasksCreated: 0,
          eventsCreated: 0,
          projectsCreated: 0,
          productionsCreated: 0,
          campaignsCreated: 0,
          tasksCompleted: 0,
        },
        {
          month: "2026-09",
          tasksCreated: 17,
          eventsCreated: 1,
          projectsCreated: 1,
          productionsCreated: 0,
          campaignsCreated: 1,
          tasksCompleted: 0,
        },
        {
          month: "2026-10",
          tasksCreated: 0,
          eventsCreated: 0,
          projectsCreated: 0,
          productionsCreated: 0,
          campaignsCreated: 0,
          tasksCompleted: 0,
        },
      ]);
      expect(
        (
          await get("management", admin, {
            cards: "taskCompletionRate",
            from: "2026-10-01",
            toExclusive: "2026-11-01",
          })
        ).cards.taskCompletionRate?.data,
      ).toHaveProperty("counts", {
        total: 0,
        completed: 0,
        pending: 0,
        overdue: 0,
        percent: null,
      });
      await expect(
        db.$transaction(async (tx) => {
          await tx.task.update({
            where: { id: id(100) },
            data: { status: "COMPLETED" },
          });
          throw new Error("verification rollback");
        }),
      ).rejects.toThrow("verification rollback");
      expect(
        (
          await get("management", admin, {
            cards: "pendingTasks,completedTasks",
          })
        ).cards.completedTasks?.data,
      ).toEqual({ count: 1 });
      // Cohort membership is half-open even at exact timestamp boundaries.
      await isolated.query(
        "UPDATE tasks SET created_at='2026-10-01T00:00Z' WHERE id=$1",
        [id(121)],
      );
      expect(
        (
          await get("management", admin, {
            cards: "taskCompletionRate",
            from: "2026-09-01",
            toExclusive: "2026-10-01",
          })
        ).cards.taskCompletionRate?.data,
      ).toHaveProperty("counts.total", 15);
      await isolated.query(
        "UPDATE tasks SET created_at='2026-09-01T00:00Z' WHERE id=$1",
        [id(121)],
      );
      const fullEmployee = await get("employee", admin, { limit: 10 });
      expect(Object.keys(fullEmployee.cards)).toHaveLength(7);
      expect(
        list(fullEmployee, "todaySchedule").items.map(
          (i) => i.kind + ":" + i.id,
        ),
      ).toEqual([
        "PROJECT:" + id(31),
        "PERSONAL:" + id(160),
        "EVENT:" + id(30),
        "MEETING:" + id(140),
      ]);
      expect(
        new Set(
          list(fullEmployee, "todaySchedule").items.map(
            (i) => i.kind + ":" + i.id,
          ),
        ).size,
      ).toBe(list(fullEmployee, "todaySchedule").items.length);
      expect(fullEmployee.cards.myUpcomingMeetings?.state).toBe("empty");
      expect(
        list(fullEmployee, "myUpcomingDeadlines").items.map((i) => i.id),
      ).toEqual([id(31), id(150)]);
      expect(
        list(fullEmployee, "recentActivity").items.map((i) => i.id),
      ).toEqual([id(130)]);
      // The existing cursor test revoked membership. Rejoin explicitly, never through a dashboard read.
      await isolated.query(
        "INSERT INTO conversation_members(conversation_id,user_id,last_read_message_id,last_read_at) VALUES ($1,$2,$3,'2026-10-06T12:00Z')",
        [id(170), id(1), id(180)],
      );
      const cursorBefore = await isolated.query(
        "SELECT last_read_message_id,last_read_at FROM conversation_members WHERE conversation_id=$1",
        [id(170)],
      );
      expect(
        (await get("employee", admin, { cards: "myUnreadMessages" })).cards
          .myUnreadMessages?.data,
      ).toHaveProperty("count", 1);
      expect(
        await isolated.query(
          "SELECT last_read_message_id,last_read_at FROM conversation_members WHERE conversation_id=$1",
          [id(170)],
        ),
      ).toEqual(cursorBefore);
      await isolated.query(
        "DELETE FROM conversation_members WHERE conversation_id=$1",
        [id(170)],
      );
      expect(
        (await get("employee", admin, { cards: "myUnreadMessages" })).cards
          .myUnreadMessages?.data,
      ).toHaveProperty("count", 0);
      // Same role does not imply the same personal data; swap the live role without renewing cookies.
      const adminRole = await db.userRoleAssignment.findUniqueOrThrow({
        where: { userId: id(1) },
      });
      const memberRole = await db.userRoleAssignment.findUniqueOrThrow({
        where: { userId: id(2) },
      });
      await db.userRoleAssignment.update({
        where: { userId: id(1) },
        data: { roleId: memberRole.roleId },
      });
      try {
        expect(
          list(
            await get("employee", admin, { cards: "myTodo" }),
            "myTodo",
          ).items.map((i) => i.id),
        ).toEqual([id(150)]);
        expect(
          list(
            await get("employee", member, { cards: "myTodo" }),
            "myTodo",
          ).items.map((i) => i.id),
        ).toEqual([id(151)]);
        await isolated.query(
          "DELETE FROM task_assignments WHERE task_id=$1 AND user_id=$2",
          [id(100), id(2)],
        );
        expect(
          list(
            await get("employee", member, { cards: "myTasks,recentActivity" }),
            "myTasks",
          ).items.map((i) => i.id),
        ).toEqual([id(123)]);
        expect(
          (await get("employee", member, { cards: "recentActivity" })).cards
            .recentActivity?.state,
        ).toBe("empty");
        await isolated.query(
          "INSERT INTO task_assignments(task_id,user_id) VALUES ($1,$2)",
          [id(100), id(2)],
        );
      } finally {
        await db.userRoleAssignment.update({
          where: { userId: id(1) },
          data: { roleId: adminRole.roleId },
        });
      }
      const custom = await db.role.create({
        data: {
          name: "Dashboard verification custom",
          rolePermissions: {
            create: [
              {
                permissionKey: "dashboard.management.read",
                scope: "MANAGEMENT",
              },
            ],
          },
        },
      });
      await db.userRoleAssignment.update({
        where: { userId: id(2) },
        data: { roleId: custom.id },
      });
      try {
        const deniedReads = vi.spyOn(database, "readModel");
        const denied = await get("management", member, {
          cards: "totalEvents,promotionPerformance",
        });
        expect(denied.cards).toEqual({
          totalEvents: { state: "denied" },
          promotionPerformance: { state: "denied" },
        });
        expect(denied.partial).toBe(false);
        expect(deniedReads).not.toHaveBeenCalled();
        deniedReads.mockRestore();
        await db.rolePermission.create({
          data: {
            roleId: custom.id,
            permissionKey: "analytics.department_performance.read",
            scope: "DEPARTMENT",
          },
        });
        expect(
          (
            await get("management", member, {
              cards: "departmentPerformance",
              from: "2026-09-01",
              toExclusive: "2026-10-01",
            })
          ).cards.departmentPerformance?.data,
        ).toHaveProperty("items.0.id", id(11));
        await db.user.update({
          where: { id: id(2) },
          data: { departmentId: null },
        });
        expect(
          (await get("management", member, { cards: "departmentPerformance" }))
            .cards.departmentPerformance?.data,
        ).toHaveProperty("items", []);
        await db.user.update({
          where: { id: id(2) },
          data: { departmentId: id(10) },
        });
        expect(
          (
            await get("management", member, {
              cards: "departmentPerformance",
              from: "2026-09-01",
              toExclusive: "2026-10-01",
            })
          ).cards.departmentPerformance?.data,
        ).toHaveProperty("items.0.id", id(10));
      } finally {
        await db.user.update({
          where: { id: id(2) },
          data: { departmentId: id(11) },
        });
        await db.userRoleAssignment.update({
          where: { userId: id(2) },
          data: { roleId: memberRole.roleId },
        });
        await db.role.delete({ where: { id: custom.id } });
      }
      const originalRead = database.readModel.bind(database);
      const { Prisma } = await import("../src/generated/prisma/client.js");
      const failure = vi
        .spyOn(database, "readModel")
        .mockImplementation(<T>(query: Prisma.Sql): Promise<T[]> =>
          originalRead<T>(
            query.text.includes("FROM projects e")
              ? Prisma.sql`SELECT 1 AS value FROM pg_sleep(0.7)`
              : query,
          ),
        );
      try {
        const partial = await get("management", admin, {
          cards: "todayDeadlines,totalEvents",
        });
        expect(partial.partial).toBe(true);
        expect(partial.cards.totalEvents?.state).toBe("ready");
        expect(partial.cards.todayDeadlines).toMatchObject({
          state: "partial",
          sources: {
            projects: {
              state: "unavailable",
              code: "DASHBOARD_SOURCE_UNAVAILABLE",
              retryable: true,
            },
          },
        });
        expect(list(partial, "todayDeadlines").items.length).toBeGreaterThan(0);
      } finally {
        failure.mockRestore();
      }
      const allFailure = vi
        .spyOn(database, "readModel")
        .mockRejectedValue(new Error("private database credentials"));
      try {
        const unavailable = await get("management", admin, {
          cards: "todayDeadlines,totalEvents",
        });
        expect(unavailable.partial).toBe(true);
        expect(unavailable.cards.totalEvents?.state).toBe("unavailable");
        expect(unavailable.cards.totalEvents?.data).toBeUndefined();
        expect(JSON.stringify(unavailable)).not.toContain("credentials");
      } finally {
        allFailure.mockRestore();
      }
      expect(
        (await get("management", admin, { cards: "totalEvents" })).cards
          .totalEvents?.data,
      ).toEqual({ count: 1 });
      const unknownPromotion = await get("management", admin, {
        cards: "promotionPerformance",
        promotionCampaignId: id(999),
      });
      expect(unknownPromotion.cards.promotionPerformance).toMatchObject({
        state: "unavailable",
        retryable: false,
        code: "DASHBOARD_SELECTION_UNAVAILABLE",
      });
      // Real session revocation invalidates the existing cookie on the next request.
      await db.authSession.updateMany({
        where: { userId: id(2) },
        data: { revokedAt: now, revokedReason: "ADMIN_REVOKED" },
      });
      await request(http)
        .get("/api/v1/dashboards/employee")
        .set("Cookie", member)
        .expect(401);
      await isolated.query(
        readFileSync(
          new URL("./fixtures/analytics-api-scale.sql", import.meta.url),
          "utf8",
        ),
      );
      await isolated.query(
        "UPDATE events SET status='READY',start_at='2026-10-06T13:00Z',end_at='2026-10-06T14:00Z' WHERE name='Event'; UPDATE projects SET status='ACTIVE',start_at='2026-10-06T10:00Z',end_at='2026-10-06T15:00Z' WHERE name='Project'; UPDATE campaigns SET status='ACTIVE' WHERE name='Campaign'; UPDATE campaign_activities SET end_at='2026-10-06T10:00Z' WHERE name='Activity'",
      );
      await isolated.query(
        "INSERT INTO task_assignments(task_id,user_id) SELECT id,$1 FROM tasks WHERE title='Task' ON CONFLICT DO NOTHING",
        [id(1)],
      );
      // Refresh statistics after adding the heavily assigned caller and changing
      // operational dates/statuses; the shared fixture analyzed its original rows.
      await isolated.query(
        "ANALYZE task_assignments; ANALYZE events; ANALYZE projects; ANALYZE campaigns; ANALYZE campaign_activities",
      );
      const [promotion] = await isolated.query<{ id: string }>(
        "SELECT id FROM campaigns WHERE campaign_type='PROMOTION' AND id::text ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab]' ORDER BY id LIMIT 1",
      );
      expect(promotion).toBeDefined();
      const statements = new Map<string, Prisma.Sql>();
      const capture = vi
        .spyOn(database, "readModel")
        .mockImplementation(<T>(query: Prisma.Sql): Promise<T[]> => {
          statements.set(query.text, query);
          return originalRead<T>(query);
        });
      try {
        for (const audience of ["management", "employee"] as const) {
          const query: Record<string, string | number> =
            audience === "management"
              ? { limit: 10, months: 12, promotionCampaignId: promotion!.id }
              : { limit: 10 };
          await get(audience, admin, query);
          const samples: number[] = [];
          for (let n = 0; n < 20; n++) {
            const start = performance.now(),
              response = await get(audience, admin, query);
            samples.push(performance.now() - start);
            expect(
              response.partial,
              JSON.stringify(
                Object.fromEntries(
                  Object.entries(response.cards).map(([key, value]) => [
                    key,
                    { state: value.state, sources: value.sources },
                  ]),
                ),
              ),
            ).toBe(false);
            expect(Object.keys(response.cards)).toHaveLength(
              audience === "management" ? 23 : 7,
            );
            for (const [key, value] of Object.entries(response.cards)) {
              expect(value.state, key).not.toBe("unavailable");
              if (value.data && "items" in value.data)
                expect(value.data.items.length, key).toBeLessThanOrEqual(
                  key === "monthlyActivity"
                    ? 12
                    : key === "promotionPerformance"
                      ? 7
                      : 10,
                );
            }
          }
          const p95 = samples.toSorted((a, b) => a - b)[18]!;
          console.info(
            `EVE-179 ${audience}: 20 warm HTTP samples, p95 ${p95.toFixed(1)}ms`,
          );
          expect(p95).toBeLessThan(750);
          if (audience === "management") {
            const selected = await get(audience, admin, query);
            expect(selected.cards.promotionPerformance?.data).toHaveProperty(
              "items",
              [
                {
                  channel: "RADIO_PROMOTION",
                  total: 150,
                  completed: 50,
                  percent: 33,
                },
              ],
            );
          }
        }
      } finally {
        capture.mockRestore();
      }
      expect(statements.size).toBeGreaterThanOrEqual(20);
      for (const [text, query] of statements) {
        const [row] = await isolated.query<{
          "QUERY PLAN": Array<{
            Plan: {
              "Actual Rows": number;
              "Shared Hit Blocks": number;
              "Shared Read Blocks": number;
            };
            "Planning Time": number;
            "Execution Time": number;
          }>;
        }>(`EXPLAIN (ANALYZE,BUFFERS,FORMAT JSON) ${text}`, query.values);
        const plan = row!["QUERY PLAN"][0]!;
        expect(plan.Plan["Actual Rows"]).toBeLessThanOrEqual(12);
        expect(plan["Planning Time"] + plan["Execution Time"]).toBeLessThan(
          500,
        );
        console.info(
          JSON.stringify({
            dashboardPlan: createHash("sha256")
              .update(text)
              .digest("hex")
              .slice(0, 12),
            rows: plan.Plan["Actual Rows"],
            ms: plan["Planning Time"] + plan["Execution Time"],
            sharedHitBlocks: plan.Plan["Shared Hit Blocks"],
            sharedReadBlocks: plan.Plan["Shared Read Blocks"],
          }),
        );
      }
    } finally {
      await app.close();
    }
  }, 120_000);
});
