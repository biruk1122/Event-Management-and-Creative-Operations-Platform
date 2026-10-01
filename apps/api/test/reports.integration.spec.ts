import { PrismaPg } from "@prisma/adapter-pg";
import type { NestExpressApplication } from "@nestjs/platform-express";
import request from "supertest";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { FILE_SCANNER } from "../src/file-management/file-scanner.js";
import { FILE_OBJECT_STORAGE } from "../src/file-management/storage/object-storage.js";
import { PrismaClient } from "../src/generated/prisma/client.js";
import { seedRbac } from "../src/rbac/seed-rbac.js";
import {
  createIsolatedDatabase,
  type IsolatedDatabase,
} from "./support/database.js";

const PASSWORD = "correct horse battery staple";
interface Principal {
  id: string;
  cookies: string[];
  csrfToken: string;
}
interface ReportBody {
  id: string;
  authorId: string;
  status: string;
  reviews: Array<{ outcome: string }>;
}
function body<T>(response: request.Response): T {
  return response.body as T;
}
function cookies(response: request.Response): string[] {
  const value: unknown = response.headers["set-cookie"];
  return Array.isArray(value) ? (value as string[]) : [];
}

describe("report API", () => {
  let database: IsolatedDatabase;
  let prisma: PrismaClient;
  let app: NestExpressApplication;
  let http: ReturnType<NestExpressApplication["getHttpServer"]>;
  let manager: Principal;
  let admin: Principal;
  let reviewer: Principal;
  let member: Principal;
  let outsider: Principal;
  let departmentId: string;

  beforeAll(async () => {
    database = await createIsolatedDatabase();
    process.env.DATABASE_URL = database.url;
    process.env.NODE_ENV = "test";
    process.env.AUTH_ACCESS_TOKEN_SECRET ??=
      "reports-access-token-secret-at-least-32-characters";
    process.env.AUTH_REFRESH_TOKEN_SECRET ??=
      "reports-refresh-token-secret-at-least-32-characters";
    process.env.AUTH_LOGIN_RATE_LIMIT_MAX = "10000";
    process.env.API_RATE_LIMIT_MAX = "100000";
    process.env.FILE_SCANNER_MODE = "test";

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

    const department = await prisma.department.create({
      data: { name: "Reporting" },
    });
    const other = await prisma.department.create({
      data: { name: "Other Reporting" },
    });
    departmentId = department.id;
    async function principal(
      email: string,
      roleName: string,
      userDepartmentId?: string,
    ): Promise<Principal> {
      const role = await prisma.role.findUniqueOrThrow({
        where: { name: roleName },
      });
      const user = await prisma.user.create({
        data: {
          email,
          ...(userDepartmentId ? { departmentId: userDepartmentId } : {}),
          credential: { create: { passwordHash: hash } },
          roleAssignment: { create: { roleId: role.id } },
        },
      });
      const response = await request(http)
        .post("/api/v1/auth/login")
        .send({ email, password: PASSWORD });
      expect(response.status).toBe(200);
      const jar = cookies(response);
      const csrfToken = jar
        .find((value) => value.startsWith("csrf_token="))
        ?.split(";")[0]
        ?.split("=")[1];
      if (!csrfToken) throw new Error("missing CSRF token");
      return { id: user.id, cookies: jar, csrfToken };
    }
    manager = await principal(
      "manager@reports.test",
      "Department Manager",
      department.id,
    );
    admin = await principal("admin@reports.test", "Super Admin");
    reviewer = await principal(
      "reviewer@reports.test",
      "Management/Administrator",
    );
    member = await principal(
      "member@reports.test",
      "Team Member",
      department.id,
    );
    outsider = await principal(
      "outsider@reports.test",
      "Team Member",
      other.id,
    );
  });

  afterAll(async () => {
    await app?.close();
    await prisma?.$disconnect();
    await database?.drop();
  });

  function as(
    principal: Principal,
    method: "get" | "post" | "patch",
    path: string,
  ) {
    const call = request(http)[method](path).set("Cookie", principal.cookies);
    return method === "get"
      ? call
      : call.set("x-csrf-token", principal.csrfToken);
  }

  it("enforces author, period, review, export, and scoped access", async () => {
    const invalid = await as(member, "post", "/api/v1/reports").send({
      type: "WEEKLY",
      title: "Bad period",
      periodStart: "2026-09-01",
      periodEnd: "2026-09-08",
    });
    expect(invalid.status).toBe(400);
    expect(body<{ code: string }>(invalid).code).toBe("REPORT_INVALID_PERIOD");

    const created = await as(member, "post", "/api/v1/reports").send({
      type: "DAILY",
      title: "Daily activity",
      periodStart: "2026-09-30",
      periodEnd: "2026-09-30",
    });
    expect(created.status).toBe(201);
    const report = body<ReportBody>(created);
    expect(report).toMatchObject({ authorId: member.id, status: "DRAFT" });
    const path = `/api/v1/reports/${report.id}`;
    const completed = await prisma.task.create({
      data: {
        title: "Completed report work",
        createdById: member.id,
        departmentId,
        status: "COMPLETED",
      },
    });
    await prisma.taskActivity.create({
      data: {
        taskId: completed.id,
        actorId: member.id,
        type: "STATUS_CHANGED",
        details: { from: "IN_PROGRESS", to: "COMPLETED" },
        occurredAt: new Date("2026-09-30T11:00:00.000Z"),
      },
    });
    await prisma.task.create({
      data: {
        title: "Ongoing report work",
        createdById: member.id,
        departmentId,
        status: "IN_PROGRESS",
        dueAt: new Date("2026-09-29T10:00:00.000Z"),
      },
    });
    const detail = await as(member, "get", path);
    expect(
      body<{
        facts: {
          completedTasksInPeriod: number;
          inProgressTasksNow: number;
          pendingTasksNow: number;
          overdueTasksNow: number;
        };
      }>(detail).facts,
    ).toMatchObject({
      completedTasksInPeriod: 1,
      inProgressTasksNow: 1,
      pendingTasksNow: 1,
      overdueTasksNow: 1,
    });
    expect((await as(outsider, "get", path)).status).toBe(403);
    expect((await as(manager, "get", path)).status).toBe(200);

    const incomplete = await as(member, "post", `${path}/submit`);
    expect(incomplete.status).toBe(400);
    expect(body<{ code: string }>(incomplete).code).toBe(
      "REPORT_INVALID_SECTIONS",
    );

    const edited = await as(member, "patch", path).send({
      problemsEncountered: "None",
      nextDayPlan: "Prepare venue",
    });
    expect(edited.status).toBe(200);
    const submitted = await as(member, "post", `${path}/submit`);
    expect(body<ReportBody>(submitted).status).toBe("SUBMITTED");
    expect(
      (
        await as(manager, "post", `${path}/reviews`).send({
          outcome: "REVIEWED",
        })
      ).status,
    ).toBe(403);
    const reviewed = await as(reviewer, "post", `${path}/reviews`).send({
      outcome: "CHANGES_REQUESTED",
      note: "More detail",
    });
    expect(body<ReportBody>(reviewed)).toMatchObject({
      status: "CHANGES_REQUESTED",
      reviews: [{ outcome: "CHANGES_REQUESTED" }],
    });
    expect((await as(member, "post", `${path}/submit`)).status).toBe(409);

    expect(
      (
        await as(member, "patch", path).send({
          nextDayPlan: "Prepare updated venue",
        })
      ).status,
    ).toBe(200);
    expect((await as(member, "post", `${path}/submit`)).status).toBe(200);
    expect(
      body<ReportBody>(
        await as(reviewer, "post", `${path}/reviews`).send({
          outcome: "REVIEWED",
        }),
      ).status,
    ).toBe("REVIEWED");
    expect(
      (await as(member, "patch", path).send({ title: "Too late" })).status,
    ).toBe(409);

    const exported = await as(member, "get", `${path}/export`);
    expect(exported.status).toBe(200);
    expect(body<{ id: string }>(exported).id).toBe(report.id);
    expect(
      await prisma.auditRecord.count({
        where: { action: "report.exported", resourceId: report.id },
      }),
    ).toBe(1);
    expect(
      await prisma.auditRecord.count({
        where: { action: "report.submitted", resourceId: report.id },
      }),
    ).toBe(2);
    const duplicate = await as(member, "post", "/api/v1/reports").send({
      type: "DAILY",
      title: "Duplicate",
      periodStart: "2026-09-30",
      periodEnd: "2026-09-30",
    });
    expect(duplicate.status).toBe(409);
  });

  it("filters only within the caller's report scope and rejects inverted ranges", async () => {
    const listed = await as(
      manager,
      "get",
      `/api/v1/reports?departmentId=${departmentId}&pageSize=1`,
    );
    expect(listed.status).toBe(200);
    expect(body<{ total: number; items: ReportBody[] }>(listed).total).toBe(1);
    const invalid = await as(
      manager,
      "get",
      "/api/v1/reports?periodFrom=2026-09-30&periodTo=2026-09-01",
    );
    expect(invalid.status).toBe(400);
    expect(body<{ code: string }>(invalid).code).toBe("REPORT_INVALID_RANGE");
  });

  it("derives monthly project counts from the Projects owner", async () => {
    const workspace = await prisma.workspace.create({
      data: { kind: "PROJECT", managerId: member.id },
    });
    await prisma.project.create({
      data: {
        workspaceId: workspace.id,
        name: "Author project",
        createdById: member.id,
        status: "ACTIVE",
      },
    });
    const created = await as(member, "post", "/api/v1/reports").send({
      type: "MONTHLY",
      title: "September",
      periodStart: "2026-09-01",
      periodEnd: "2026-09-30",
    });
    expect(created.status).toBe(201);
    const detail = await as(
      member,
      "get",
      `/api/v1/reports/${body<ReportBody>(created).id}`,
    );
    expect(
      body<{
        facts: {
          totalProjectsNow: number;
          completedProjectsNow: number;
          activeProjectsNow: number;
        };
      }>(detail).facts,
    ).toMatchObject({
      totalProjectsNow: 1,
      completedProjectsNow: 0,
      activeProjectsNow: 1,
    });
  });

  it("persists and filters authorized workspace links", async () => {
    const workspace = await prisma.workspace.create({
      data: { kind: "EVENT" },
    });
    const created = await as(admin, "post", "/api/v1/reports").send({
      type: "DAILY",
      title: "Workspace-linked",
      periodStart: "2026-09-29",
      periodEnd: "2026-09-29",
      workspaceIds: [workspace.id],
    });
    expect(created.status).toBe(201);
    const reportId = body<ReportBody>(created).id;
    expect(
      body<{ workspaceIds: string[] }>(
        await as(admin, "get", `/api/v1/reports/${reportId}`),
      ).workspaceIds,
    ).toEqual([workspace.id]);
    expect(
      body<{ total: number }>(
        await as(admin, "get", `/api/v1/reports?workspaceId=${workspace.id}`),
      ).total,
    ).toBe(1);
    expect(
      (
        await as(member, "post", "/api/v1/reports").send({
          type: "DAILY",
          title: "Unauthorized link",
          periodStart: "2026-09-29",
          periodEnd: "2026-09-29",
          workspaceIds: [workspace.id],
        })
      ).status,
    ).toBe(403);
    expect(
      (
        await as(admin, "patch", `/api/v1/reports/${reportId}`).send({
          workspaceIds: [],
        })
      ).status,
    ).toBe(200);
    expect(
      body<{ total: number }>(
        await as(admin, "get", `/api/v1/reports?workspaceId=${workspace.id}`),
      ).total,
    ).toBe(0);
  });
});
