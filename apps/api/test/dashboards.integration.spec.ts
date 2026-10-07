import { beforeAll, afterAll, describe, it, expect, vi } from "vitest";
import request from "supertest";
import type { NestExpressApplication } from "@nestjs/platform-express";
import type { DashboardResponse } from "../src/dashboards/dashboards.contracts.js";
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
describe("source-owned dashboard reads (EVE-178)", () => {
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
  });
  afterAll(async () => {
    await db?.$disconnect();
    await isolated?.drop();
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
  it("serves authenticated versioned HTTP dashboards with safe validation and all management cards", async () => {
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
    } finally {
      await app.close();
    }
  });
});
