import { PrismaPg } from "@prisma/adapter-pg";
import type { NestExpressApplication } from "@nestjs/platform-express";
import { Client } from "pg";
import request from "supertest";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { FILE_SCANNER } from "../src/file-management/file-scanner.js";
import { FILE_OBJECT_STORAGE } from "../src/file-management/storage/object-storage.js";
import {
  PrismaClient,
  type TaskStatus,
} from "../src/generated/prisma/client.js";
import { seedRbac } from "../src/rbac/seed-rbac.js";
import type { DatabaseService } from "../src/database/database.service.js";
import type { AuditWriterService } from "../src/audit/audit-writer.service.js";
import {
  createIsolatedDatabase,
  type IsolatedDatabase,
} from "./support/database.js";

const PASSWORD = "correct horse battery staple";
const api = "/api/v1/reports";
const day = (value: string) => new Date(`${value}T00:00:00.000Z`);
type Server = ReturnType<NestExpressApplication["getHttpServer"]>;

interface Principal {
  id: string;
  cookies: string[];
  csrf: string;
}
interface ReportBody {
  id: string;
  type: string;
  status: string;
  periodStart: string;
  periodEnd: string;
  authorId: string;
  departmentId: string | null;
  workspaceIds: string[];
  reviews: Array<{
    id: string;
    outcome: string;
    note: string | null;
    reviewerId: string;
    reviewedAt: string;
  }>;
  facts: {
    completedTasksInPeriod: number;
    inProgressTasksNow: number;
    pendingTasksNow: number;
    overdueTasksNow: number;
    totalProjectsNow: number | null;
    completedProjectsNow: number | null;
    activeProjectsNow: number | null;
  };
}
function body<T>(response: request.Response): T {
  return response.body as T;
}

describe("EVE-167 report verification", () => {
  let database: IsolatedDatabase;
  let prisma: PrismaClient;
  let app: NestExpressApplication;
  let http: Server;
  let member: Principal;
  let manager: Principal;
  let outsider: Principal;
  let reviewer: Principal;
  let admin: Principal;
  let departmentId: string;
  let otherDepartmentId: string;
  let dailyId: string;
  let weeklyId: string;
  let monthlyId: string;
  let outsiderReportId: string;

  beforeAll(async () => {
    database = await createIsolatedDatabase();
    process.env.DATABASE_URL = database.url;
    process.env.NODE_ENV = "test";
    process.env.LOG_LEVEL = "silent";
    process.env.FILE_SCANNER_MODE = "test";
    process.env.AUTH_ACCESS_TOKEN_SECRET ??=
      "reports-verification-access-secret-32-chars";
    process.env.AUTH_REFRESH_TOKEN_SECRET ??=
      "reports-verification-refresh-secret-32-chars";
    process.env.AUTH_LOGIN_RATE_LIMIT_MAX = "10000";
    process.env.API_RATE_LIMIT_MAX = "100000";
    prisma = new PrismaClient({
      adapter: new PrismaPg(
        { connectionString: database.url },
        { schema: database.schema },
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
    const hash = await new PasswordHasher().hash(PASSWORD);
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(FILE_OBJECT_STORAGE)
      .useValue({})
      .overrideProvider(FILE_SCANNER)
      .useValue({ scan: () => Promise.resolve("clean") })
      .compile();
    app = moduleRef.createNestApplication<NestExpressApplication>();
    configureApplication(app);
    await app.init();
    http = app.getHttpServer();

    departmentId = (
      await prisma.department.create({
        data: { name: "Verification Production" },
      })
    ).id;
    otherDepartmentId = (
      await prisma.department.create({
        data: { name: "Verification Marketing" },
      })
    ).id;
    async function principal(
      email: string,
      roleName: string,
      dept?: string,
    ): Promise<Principal> {
      const role = await prisma.role.findUniqueOrThrow({
        where: { name: roleName },
      });
      const user = await prisma.user.create({
        data: {
          email,
          ...(dept ? { departmentId: dept } : {}),
          credential: { create: { passwordHash: hash } },
          roleAssignment: { create: { roleId: role.id } },
        },
      });
      const login = await request(http)
        .post("/api/v1/auth/login")
        .send({ email, password: PASSWORD });
      expect(login.status).toBe(200);
      const cookies: unknown = login.headers["set-cookie"];
      if (!Array.isArray(cookies)) throw new Error("login did not set cookies");
      const csrf = (cookies as string[])
        .find((value) => value.startsWith("csrf_token="))
        ?.split(";")[0]
        ?.split("=")[1];
      if (!csrf) throw new Error("login did not set CSRF token");
      return { id: user.id, cookies: cookies as string[], csrf };
    }
    member = await principal(
      "fixture-member@reports.test",
      "Team Member",
      departmentId,
    );
    manager = await principal(
      "fixture-manager@reports.test",
      "Department Manager",
      departmentId,
    );
    outsider = await principal(
      "fixture-outsider@reports.test",
      "Team Member",
      otherDepartmentId,
    );
    reviewer = await principal(
      "fixture-reviewer@reports.test",
      "Management/Administrator",
    );
    admin = await principal("fixture-admin@reports.test", "Super Admin");

    async function report(
      authorId: string,
      dept: string | null,
      type: "DAILY" | "WEEKLY" | "MONTHLY",
      from: string,
      to: string,
    ) {
      return prisma.report.create({
        data: {
          authorId,
          departmentId: dept,
          type,
          title: `${type} fixture`,
          periodStart: day(from),
          periodEnd: day(to),
        },
      });
    }
    dailyId = (
      await report(member.id, departmentId, "DAILY", "2024-02-29", "2024-02-29")
    ).id;
    weeklyId = (
      await report(
        member.id,
        departmentId,
        "WEEKLY",
        "2024-02-26",
        "2024-03-03",
      )
    ).id;
    await report(
      manager.id,
      departmentId,
      "WEEKLY",
      "2024-02-26",
      "2024-03-03",
    );
    monthlyId = (
      await report(
        member.id,
        departmentId,
        "MONTHLY",
        "2024-02-01",
        "2024-02-29",
      )
    ).id;
    outsiderReportId = (
      await report(
        outsider.id,
        otherDepartmentId,
        "DAILY",
        "2024-02-28",
        "2024-02-28",
      )
    ).id;
    await report(admin.id, null, "DAILY", "2024-02-27", "2024-02-27");

    async function task(
      status: TaskStatus,
      authorId: string,
      dueAt?: Date,
      assigneeId?: string,
    ) {
      const created = await prisma.task.create({
        data: {
          title: `Fixture ${status}`,
          status,
          createdById: authorId,
          ...(dueAt ? { dueAt } : {}),
          departmentId:
            authorId === outsider.id ? otherDepartmentId : departmentId,
        },
      });
      if (assigneeId)
        await prisma.taskAssignment.create({
          data: { taskId: created.id, userId: assigneeId },
        });
      return created.id;
    }
    const completions: Array<[string, string, boolean]> = [
      ["2024-02-29T00:00:00.000Z", member.id, false],
      ["2024-02-29T23:59:59.999Z", member.id, false],
      ["2024-02-26T12:00:00.000Z", outsider.id, true],
      ["2024-03-01T00:00:00.000Z", member.id, false],
      ["2024-02-29T12:00:00.000Z", outsider.id, false],
    ];
    for (const [at, authorId, assigned] of completions) {
      const taskId = await task(
        "COMPLETED",
        authorId,
        undefined,
        assigned ? member.id : undefined,
      );
      await prisma.taskActivity.create({
        data: {
          taskId,
          type: "STATUS_CHANGED",
          occurredAt: new Date(at),
          details: { from: "IN_PROGRESS", to: "COMPLETED" },
        },
      });
      if (at === "2024-02-29T23:59:59.999Z") {
        // A second completion event for one task must not double-count it.
        await prisma.taskActivity.create({
          data: {
            taskId,
            type: "STATUS_CHANGED",
            occurredAt: new Date(at),
            details: { from: "IN_PROGRESS", to: "COMPLETED" },
          },
        });
      }
    }
    const past = new Date("2020-01-01T00:00:00.000Z");
    const future = new Date("2099-01-01T00:00:00.000Z");
    await task("TODO", member.id, past);
    await task("IN_PROGRESS", member.id, past);
    await task("BLOCKED", member.id, future);
    await task("UNDER_REVIEW", member.id, future);
    await task("CANCELLED", member.id, past);
    await task("IN_PROGRESS", outsider.id, past);

    async function project(
      name: string,
      status: "ACTIVE" | "COMPLETED" | "CANCELLED",
      authorId: string,
      managedBy?: string,
    ) {
      const workspace = await prisma.workspace.create({
        data: {
          kind: "PROJECT",
          ...(managedBy ? { managerId: managedBy } : {}),
        },
      });
      await prisma.project.create({
        data: {
          workspaceId: workspace.id,
          name,
          status,
          createdById: authorId,
        },
      });
    }
    await project("Completed and managed", "COMPLETED", member.id, member.id);
    await project("Active managed", "ACTIVE", outsider.id, member.id);
    await project("Cancelled", "CANCELLED", member.id);
    await project("Other person's project", "ACTIVE", outsider.id);
  });

  afterAll(async () => {
    await app?.close();
    await prisma?.$disconnect();
    await database?.drop();
  });

  function as(
    actor: Principal,
    method: "get" | "post" | "patch",
    path: string,
  ) {
    const call = request(http)[method](path).set("Cookie", actor.cookies);
    return method === "get" ? call : call.set("x-csrf-token", actor.csrf);
  }

  it("returns exact UTC-window and live-state facts for all three report types", async () => {
    const daily = body<ReportBody>(
      await as(member, "get", `${api}/${dailyId}`),
    );
    const weekly = body<ReportBody>(
      await as(member, "get", `${api}/${weeklyId}`),
    );
    const monthly = body<ReportBody>(
      await as(member, "get", `${api}/${monthlyId}`),
    );
    expect(daily).toMatchObject({
      type: "DAILY",
      periodStart: "2024-02-29",
      periodEnd: "2024-02-29",
    });
    expect(weekly).toMatchObject({
      type: "WEEKLY",
      periodStart: "2024-02-26",
      periodEnd: "2024-03-03",
    });
    expect(monthly).toMatchObject({
      type: "MONTHLY",
      periodStart: "2024-02-01",
      periodEnd: "2024-02-29",
    });
    expect(daily.facts).toMatchObject({
      completedTasksInPeriod: 2,
      inProgressTasksNow: 1,
      pendingTasksNow: 4,
      overdueTasksNow: 2,
      totalProjectsNow: null,
      completedProjectsNow: null,
      activeProjectsNow: null,
    });
    expect(weekly.facts).toMatchObject({
      completedTasksInPeriod: 4,
      inProgressTasksNow: 1,
      pendingTasksNow: 4,
      overdueTasksNow: 2,
      totalProjectsNow: null,
    });
    expect(monthly.facts).toMatchObject({
      completedTasksInPeriod: 3,
      inProgressTasksNow: 1,
      pendingTasksNow: 4,
      overdueTasksNow: 2,
      totalProjectsNow: 2,
      completedProjectsNow: 1,
      activeProjectsNow: 1,
    });
  });

  it("enforces self, department, and organization scope in detail and filtered lists", async () => {
    const memberOther = await as(member, "get", `${api}/${outsiderReportId}`);
    const memberMissing = await as(
      member,
      "get",
      `${api}/00000000-0000-0000-0000-000000000000`,
    );
    expect(memberOther.status).toBe(403);
    expect(memberMissing.status).toBe(403);
    expect(body<{ code: string }>(memberOther).code).toBe("PERMISSION_DENIED");
    expect(body<{ code: string }>(memberMissing).code).toBe(
      "PERMISSION_DENIED",
    );
    expect(memberOther.type).toBe("application/problem+json");
    expect(memberOther.headers["x-request-id"]).toBeTruthy();
    expect((await as(manager, "get", `${api}/${dailyId}`)).status).toBe(200);
    expect(
      (await as(manager, "get", `${api}/${outsiderReportId}`)).status,
    ).toBe(403);
    expect(
      (await as(reviewer, "get", `${api}/${outsiderReportId}`)).status,
    ).toBe(200);
    const missingOrg = await as(admin, "get", `${api}/not-a-uuid`);
    expect(missingOrg.status).toBe(404);
    expect(body<{ code: string }>(missingOrg).code).toBe("REPORT_NOT_FOUND");

    const memberList = body<{ total: number }>(
      await as(member, "get", `${api}?authorId=${outsider.id}`),
    );
    const managerList = body<{ total: number }>(
      await as(manager, "get", `${api}?departmentId=${otherDepartmentId}`),
    );
    expect(memberList.total).toBe(0);
    expect(managerList.total).toBe(0);
    const first = body<{ total: number; items: ReportBody[] }>(
      await as(
        admin,
        "get",
        `${api}?type=DAILY&periodFrom=2024-02-27&periodTo=2024-02-29&page=1&pageSize=2`,
      ),
    );
    const second = body<{ total: number; items: ReportBody[] }>(
      await as(
        admin,
        "get",
        `${api}?type=DAILY&periodFrom=2024-02-27&periodTo=2024-02-29&page=2&pageSize=2`,
      ),
    );
    expect(first.total).toBe(3);
    expect(first.items.map((item) => item.periodStart)).toEqual([
      "2024-02-29",
      "2024-02-28",
    ]);
    expect(second.total).toBe(3);
    expect(second.items.map((item) => item.periodStart)).toEqual([
      "2024-02-27",
    ]);
  });

  it("rejects invalid periods, date filters, pagination, ownership, and sections", async () => {
    const badLists = [
      "periodFrom=2024-02-29",
      "periodTo=2024-02-29",
      "periodFrom=2024-03-01&periodTo=2024-02-29",
      "periodFrom=2024-02-29&periodTo=2025-03-02",
      "periodFrom=2024-02-30&periodTo=2024-03-01",
      "page=0",
      "page=100001",
      "pageSize=0",
      "pageSize=101",
      "type=YEARLY",
      "status=UNKNOWN",
      "authorId=invalid",
    ];
    for (const query of badLists) {
      const response = await as(admin, "get", `${api}?${query}`);
      expect(response.status, query).toBe(400);
      expect(response.type).toBe("application/problem+json");
      expect(response.headers["x-request-id"]).toBeTruthy();
    }
    expect(
      (
        await as(
          admin,
          "get",
          `${api}?periodFrom=2024-02-29&periodTo=2025-03-01`,
        )
      ).status,
    ).toBe(200);
    const badCreates = [
      { type: "DAILY", periodStart: "2024-02-30", periodEnd: "2024-02-30" },
      { type: "WEEKLY", periodStart: "2025-01-01", periodEnd: "2025-01-08" },
      { type: "MONTHLY", periodStart: "2025-02-01", periodEnd: "2025-02-27" },
    ];
    for (const value of badCreates) {
      const response = await as(member, "post", api).send({
        title: "Bad period",
        ...value,
      });
      expect(response.status).toBe(400);
      expect(body<{ code: string }>(response).code).toBe(
        "REPORT_INVALID_PERIOD",
      );
    }
    const wrongSection = await as(member, "post", api).send({
      type: "DAILY",
      title: "Bad section",
      periodStart: "2025-01-02",
      periodEnd: "2025-01-02",
      challenges: "Not daily",
    });
    expect(body<{ code: string }>(wrongSection).code).toBe(
      "REPORT_INVALID_SECTIONS",
    );
    expect(
      (
        await as(member, "post", api).send({
          type: "DAILY",
          title: "Wrong department",
          periodStart: "2025-01-03",
          periodEnd: "2025-01-03",
          departmentId: otherDepartmentId,
        })
      ).status,
    ).toBe(403);
    const duplicate = await as(member, "post", api).send({
      type: "DAILY",
      title: "Duplicate",
      periodStart: "2024-02-29",
      periodEnd: "2024-02-29",
    });
    expect(duplicate.status).toBe(409);
    expect(body<{ code: string }>(duplicate).code).toBe("REPORT_DUPLICATE");
    const noCsrf = await request(http)
      .post(api)
      .set("Cookie", member.cookies)
      .send({
        type: "DAILY",
        title: "No CSRF",
        periodStart: "2025-01-04",
        periodEnd: "2025-01-04",
      });
    expect(noCsrf.status).toBe(403);
  });

  it("persists two review cycles atomically and rejects invalid transitions", async () => {
    const created = await as(member, "post", api).send({
      type: "WEEKLY",
      title: "Review-cycle fixture",
      periodStart: "2025-04-07",
      periodEnd: "2025-04-13",
      departmentActivities: "Production",
      majorAchievements: "Completed launch",
      challenges: "Weather",
      nextWeekPlan: "Prepare follow-up",
    });
    expect(created.status).toBe(201);
    const id = body<ReportBody>(created).id;
    const path = `${api}/${id}`;
    const submitted = await as(member, "post", `${path}/submit`);
    expect(submitted.status).toBe(200);
    expect(body<ReportBody>(submitted).status).toBe("SUBMITTED");
    expect(
      body<{ code: string }>(await as(member, "post", `${path}/submit`)).code,
    ).toBe("REPORT_INVALID_TRANSITION");
    expect(
      (
        await as(manager, "post", `${path}/reviews`).send({
          outcome: "REVIEWED",
        })
      ).status,
    ).toBe(403);
    expect(
      (
        await as(member, "post", `${path}/reviews`).send({
          outcome: "REVIEWED",
        })
      ).status,
    ).toBe(403);
    const requested = await as(reviewer, "post", `${path}/reviews`).send({
      outcome: "CHANGES_REQUESTED",
      note: "Clarify weather",
    });
    expect(requested.status).toBe(200);
    expect(body<ReportBody>(requested).status).toBe("CHANGES_REQUESTED");
    expect((await as(member, "post", `${path}/submit`)).status).toBe(409);
    const redrafted = await as(member, "patch", path).send({
      challenges: "Weather delayed one rehearsal",
    });
    expect(redrafted.status).toBe(200);
    expect(body<ReportBody>(redrafted).status).toBe("DRAFT");
    const [firstReview] = body<ReportBody>(redrafted).reviews;
    expect(body<ReportBody>(redrafted).reviews).toHaveLength(1);
    expect(firstReview).toMatchObject({
      outcome: "CHANGES_REQUESTED",
      note: "Clarify weather",
      reviewerId: reviewer.id,
    });
    expect(firstReview?.id).toBeTruthy();
    expect(Date.parse(firstReview?.reviewedAt ?? "")).not.toBeNaN();
    expect((await as(member, "post", `${path}/submit`)).status).toBe(200);
    const final = await as(reviewer, "post", `${path}/reviews`).send({
      outcome: "REVIEWED",
      note: "Accepted",
    });
    expect(final.status).toBe(200);
    expect(
      body<ReportBody>(final).reviews.map((review) => review.outcome),
    ).toEqual(["CHANGES_REQUESTED", "REVIEWED"]);
    expect(
      (
        await as(reviewer, "post", `${path}/reviews`).send({
          outcome: "REVIEWED",
        })
      ).status,
    ).toBe(409);
    expect(
      (await as(member, "patch", path).send({ title: "Too late" })).status,
    ).toBe(409);
    const persisted = await prisma.report.findUniqueOrThrow({
      where: { id },
      include: { reviews: true },
    });
    expect(persisted).toMatchObject({
      status: "REVIEWED",
      reviewerId: reviewer.id,
    });
    expect(persisted.submittedAt).not.toBeNull();
    expect(persisted.reviewedAt).not.toBeNull();
    expect(persisted.reviews.map((review) => review.outcome).sort()).toEqual([
      "CHANGES_REQUESTED",
      "REVIEWED",
    ]);
    const actions = await prisma.auditRecord.findMany({
      where: { resourceType: "report", resourceId: id },
      select: { action: true, requestId: true },
    });
    expect(actions.map((entry) => entry.action).sort()).toEqual([
      "report.changes_requested",
      "report.reviewed",
      "report.submitted",
      "report.submitted",
    ]);
    expect(actions.every((entry) => !!entry.requestId)).toBe(true);
  });

  it("guards workspace links, export scope, and stale draft updates", async () => {
    const first = await prisma.workspace.create({ data: { kind: "EVENT" } });
    const second = await prisma.workspace.create({ data: { kind: "PROJECT" } });
    const created = await as(admin, "post", api).send({
      type: "DAILY",
      title: "Linked fixture",
      periodStart: "2025-05-01",
      periodEnd: "2025-05-01",
      workspaceIds: [first.id, second.id],
    });
    expect(created.status).toBe(201);
    const id = body<ReportBody>(created).id;
    expect(
      (await prisma.reportWorkspace.findMany({ where: { reportId: id } }))
        .map((link) => link.workspaceId)
        .sort(),
    ).toEqual([first.id, second.id].sort());
    const denied = await as(member, "get", `${api}/${id}/export`);
    expect(denied.status).toBe(403);
    expect(
      await prisma.auditRecord.count({
        where: { action: "report.exported", resourceId: id },
      }),
    ).toBe(0);
    const exported = await as(admin, "get", `${api}/${id}/export`);
    expect(exported.status).toBe(200);
    expect(body<ReportBody>(exported).workspaceIds.sort()).toEqual(
      [first.id, second.id].sort(),
    );
    expect(
      await prisma.auditRecord.count({
        where: {
          action: "report.exported",
          resourceId: id,
          requestId: exported.headers["x-request-id"] as string,
        },
      }),
    ).toBe(1);
    const stale = await prisma.report.findUniqueOrThrow({ where: { id } });
    const updated = await as(admin, "patch", `${api}/${id}`).send({
      workspaceIds: [second.id],
      title: "Updated link",
    });
    expect(updated.status).toBe(200);
    expect(
      (await prisma.reportWorkspace.findMany({ where: { reportId: id } })).map(
        (link) => link.workspaceId,
      ),
    ).toEqual([second.id]);
    const { ReportsRepository } =
      await import("../src/reports/infrastructure/reports.repository.js");
    const repository = app.get(ReportsRepository);
    await expect(
      repository.updateDraft(id, stale.updatedAt, {
        type: "DAILY",
        title: "Stale title",
        periodStart: day("2025-05-01"),
        periodEnd: day("2025-05-01"),
        departmentId: null,
        workspaceIds: [first.id],
        sections: {},
      }),
    ).rejects.toMatchObject({
      response: { code: "REPORT_CONCURRENT_CHANGE" },
    });
    expect(
      (await prisma.report.findUniqueOrThrow({ where: { id } })).title,
    ).toBe("Updated link");
    const unauthorizedLink = await as(member, "post", api).send({
      type: "DAILY",
      title: "Not my workspace",
      periodStart: "2025-05-02",
      periodEnd: "2025-05-02",
      workspaceIds: [first.id],
    });
    expect(unauthorizedLink.status).toBe(403);
  });

  it("keeps source-fact and paginated report SQL counts bounded as result size changes", async () => {
    const [
      { TasksReportFactsQuery },
      { ProjectsReportFactsQuery },
      { ReportsRepository },
    ] = await Promise.all([
      import("../src/tasks/tasks-report-facts.query.js"),
      import("../src/projects/projects-report-facts.query.js"),
      import("../src/reports/infrastructure/reports.repository.js"),
    ]);
    const statements: string[] = [];
    const logged = new PrismaClient({
      adapter: new PrismaPg(
        { connectionString: database.url },
        { schema: database.schema },
      ),
      log: [{ emit: "event", level: "query" }],
    });
    logged.$on("query", (event) => {
      if (/^\s*(SELECT|WITH)\b/i.test(event.query))
        statements.push(event.query);
    });
    try {
      await logged.$queryRaw`SELECT 1`;
      statements.length = 0;
      const taskFacts = new TasksReportFactsQuery(
        logged as unknown as DatabaseService,
      );
      const projectFacts = new ProjectsReportFactsQuery(
        logged as unknown as DatabaseService,
      );
      await taskFacts.forAuthor(
        member.id,
        day("2024-02-01"),
        day("2024-03-01"),
        day("2026-10-01"),
      );
      expect(statements).toHaveLength(4);
      statements.length = 0;
      await projectFacts.forAuthor(member.id);
      expect(statements).toHaveLength(3);
      statements.length = 0;
      const reports = new ReportsRepository(
        logged as unknown as DatabaseService,
        {} as AuditWriterService,
      );
      const small = await reports.list({
        visibility: { organization: true },
        page: 1,
        pageSize: 1,
      });
      const smallQueries = statements.length;
      expect(small.items).toHaveLength(1);
      expect(smallQueries).toBeLessThanOrEqual(6);
      statements.length = 0;
      const larger = await reports.list({
        visibility: { organization: true },
        page: 1,
        pageSize: 25,
      });
      expect(larger.items.length).toBeGreaterThan(1);
      expect(statements).toHaveLength(smallQueries);
    } finally {
      await logged.$disconnect();
    }
  });

  it("has deterministic index paths for reporting filters and source facts", async () => {
    const client = new Client({ connectionString: database.url });
    await client.connect();
    try {
      await client.query(`SET search_path TO "${database.schema}"`);
      // Small isolated fixtures otherwise favor sequential scans even when the
      // production access path has an index. This verifies usability, not speed.
      await client.query("SET enable_seqscan TO off");
      const cases: Array<{ sql: string; values: unknown[]; index: RegExp }> = [
        {
          sql: `SELECT id FROM reports WHERE author_id = $1 AND type = 'DAILY'
                ORDER BY period_start DESC, id DESC LIMIT 25`,
          values: [member.id],
          index: /reports_author_id_type_period_start_(id_idx|key)/,
        },
        {
          sql: `SELECT id FROM reports WHERE department_id = $1 AND type = 'WEEKLY'
                ORDER BY period_start DESC, id DESC LIMIT 25`,
          values: [departmentId],
          index: /reports_department_id_type_period_start_id_idx/,
        },
        {
          sql: `SELECT id FROM reports WHERE status = 'DRAFT' AND type = 'DAILY'
                ORDER BY period_start DESC, id DESC LIMIT 25`,
          values: [],
          index: /reports_status_type_period_start_id_idx/,
        },
        {
          sql: "SELECT report_id FROM report_workspaces WHERE workspace_id = $1",
          values: [member.id],
          index: /report_workspaces_workspace_id_report_id_idx/,
        },
        {
          sql: `SELECT id FROM tasks WHERE status = 'IN_PROGRESS' AND due_at < $1`,
          values: [new Date("2026-10-01T00:00:00.000Z")],
          index: /tasks_status_due_at_idx/,
        },
        {
          sql: `SELECT id FROM task_activities WHERE task_id = $1 AND occurred_at >= $2
                AND occurred_at < $3 AND type = 'STATUS_CHANGED' AND details->>'to' = 'COMPLETED'`,
          values: [dailyId, day("2024-02-01"), day("2024-03-01")],
          index: /task_activities_task_id_occurred_at_idx/,
        },
        {
          sql: "SELECT id FROM projects WHERE created_by_id = $1",
          values: [member.id],
          index: /projects_created_by_id_idx/,
        },
      ];
      for (const { sql, values, index } of cases) {
        const result = await client.query<{ "QUERY PLAN": object }>(
          `EXPLAIN (FORMAT JSON) ${sql}`,
          values,
        );
        expect(JSON.stringify(result.rows[0]?.["QUERY PLAN"]), sql).toMatch(
          index,
        );
      }
    } finally {
      await client.end();
    }
  });
});
