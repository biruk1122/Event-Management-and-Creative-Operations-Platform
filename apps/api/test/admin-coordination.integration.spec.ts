import { PrismaPg } from "@prisma/adapter-pg";
import type { NestExpressApplication } from "@nestjs/platform-express";
import request from "supertest";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { PrismaClient } from "../src/generated/prisma/client.js";
import { seedRbac } from "../src/rbac/seed-rbac.js";
import { FILE_SCANNER } from "../src/file-management/file-scanner.js";
import {
  FILE_OBJECT_STORAGE,
  type ObjectStorage,
} from "../src/file-management/storage/object-storage.js";
import {
  createIsolatedDatabase,
  type IsolatedDatabase,
} from "./support/database.js";

const PASSWORD = "correct horse battery staple";

const unusedStorage: ObjectStorage = {
  createUploadGrant: () => Promise.reject(new Error("not used")),
  readObject: () => Promise.resolve(null),
  createDownloadGrant: () => Promise.reject(new Error("not used")),
  deleteObject: () => Promise.resolve(),
};

interface Principal {
  id: string;
  email: string;
  cookies: string[];
  csrfToken: string;
}

interface PersonBody {
  id: string;
}
interface TaskBody {
  id: string;
  status: string;
  departmentId: string | null;
  parentTaskId: string | null;
  reportTo: PersonBody | null;
  reportToPinned: boolean;
  assignees: PersonBody[];
}
interface ReportBody {
  id: string;
  status: string;
  reportToId: string | null;
  sources: Array<{ id: string }>;
}
interface ProblemBody {
  code: string;
}

function body<T>(response: request.Response): T {
  return response.body as T;
}
function code(response: request.Response): string {
  return body<ProblemBody>(response).code;
}
function setCookies(response: request.Response): string[] {
  const raw = response.headers["set-cookie"] as unknown;
  return Array.isArray(raw) ? (raw as string[]) : [];
}
function cookieValue(cookies: string[], name: string): string {
  const cookie = cookies.find((entry) => entry.startsWith(`${name}=`));
  const value = cookie?.slice(name.length + 1).split(";")[0];
  if (!value) throw new Error(`cookie ${name} not present`);
  return value;
}

describe("Admin coordination, per-task reporting recipients and role guards", () => {
  let database: IsolatedDatabase;
  let prisma: PrismaClient;
  let app: NestExpressApplication;
  let http: ReturnType<NestExpressApplication["getHttpServer"]>;
  let credentialHash: string;

  let production: string;
  let marketing: string;
  let eventOffice: string;
  let hr: string;

  let superAdmin: Principal;
  let superAdmin2: Principal;
  let admin: Principal;
  let admin2: Principal;
  let productionManager: Principal;
  let marketingManager: Principal;
  let productionMember: Principal;
  let secondProductionMember: Principal;
  let marketingMember: Principal;
  let hrManager: Principal;

  beforeAll(async () => {
    database = await createIsolatedDatabase();
    process.env.DATABASE_URL = database.url;
    process.env.NODE_ENV = "test";
    process.env.AUTH_ACCESS_TOKEN_SECRET ??=
      "admin-access-token-secret-at-least-32-characters";
    process.env.AUTH_REFRESH_TOKEN_SECRET ??=
      "admin-refresh-token-secret-at-least-32-characters";
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

    const [{ Test }, appModule, appSetup, hasherModule] = await Promise.all([
      import("@nestjs/testing"),
      import("../src/app.module.js"),
      import("../src/app.setup.js"),
      import("../src/auth/domain/password-hasher.js"),
    ]);
    credentialHash = await new hasherModule.PasswordHasher().hash(PASSWORD);
    const moduleRef = await Test.createTestingModule({
      imports: [appModule.AppModule],
    })
      .overrideProvider(FILE_OBJECT_STORAGE)
      .useValue(unusedStorage)
      .overrideProvider(FILE_SCANNER)
      .useValue({ scan: () => Promise.resolve("clean") })
      .compile();
    app = moduleRef.createNestApplication<NestExpressApplication>();
    appSetup.configureApplication(app);
    await app.init();
    http = app.getHttpServer();

    const departments = await Promise.all(
      [
        "Production",
        "Marketing",
        "Manager / Event & Office Manager",
        "HR & Executive Officer",
      ].map((name) => prisma.department.create({ data: { name } })),
    );
    [production, marketing, eventOffice, hr] = departments.map((d) => d.id) as [
      string,
      string,
      string,
      string,
    ];

    superAdmin = await createPrincipal("sa1@admin.test", "Super Admin");
    superAdmin2 = await createPrincipal("sa2@admin.test", "Super Admin");
    admin = await createPrincipal("admin1@admin.test", "Admin", eventOffice);
    admin2 = await createPrincipal("admin2@admin.test", "Admin", marketing);
    productionManager = await createPrincipal(
      "prod-manager@admin.test",
      "Department Manager",
      production,
    );
    marketingManager = await createPrincipal(
      "mkt-manager@admin.test",
      "Department Manager",
      marketing,
    );
    productionMember = await createPrincipal(
      "prod-member@admin.test",
      "Department Member",
      production,
    );
    secondProductionMember = await createPrincipal(
      "prod-member2@admin.test",
      "Department Member",
      production,
    );
    marketingMember = await createPrincipal(
      "mkt-member@admin.test",
      "Department Member",
      marketing,
    );
    hrManager = await createPrincipal(
      "hr-manager@admin.test",
      "Department Manager",
      hr,
    );
    await prisma.department.update({
      where: { id: production },
      data: { managerId: productionManager.id },
    });
    await prisma.department.update({
      where: { id: marketing },
      data: { managerId: marketingManager.id },
    });
  });

  afterAll(async () => {
    await app?.close();
    await prisma?.$disconnect();
    await database?.drop();
  });

  async function createPrincipal(
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
        credential: { create: { passwordHash: credentialHash } },
        roleAssignment: { create: { roleId: role.id } },
      },
    });
    const response = await request(http)
      .post("/api/v1/auth/login")
      .send({ email, password: PASSWORD });
    expect(response.status).toBe(200);
    const cookies = setCookies(response);
    return {
      id: user.id,
      email,
      cookies,
      csrfToken: cookieValue(cookies, "csrf_token"),
    };
  }

  function as(
    principal: Principal,
    method: "get" | "post" | "put" | "patch" | "delete",
    path: string,
  ) {
    const call = request(http)[method](path).set("Cookie", principal.cookies);
    return method === "get"
      ? call
      : call.set("x-csrf-token", principal.csrfToken);
  }

  async function createTask(
    actor: Principal,
    data: Record<string, unknown>,
  ): Promise<TaskBody> {
    const response = await as(actor, "post", "/api/v1/tasks").send({
      title: `Task ${Math.random().toString(36).slice(2)}`,
      ...data,
    });
    expect(response.status, JSON.stringify(response.body)).toBe(201);
    return body<TaskBody>(response);
  }

  async function getTask(actor: Principal, id: string): Promise<TaskBody> {
    const response = await as(actor, "get", `/api/v1/tasks/${id}`);
    expect(response.status).toBe(200);
    return body<TaskBody>(response);
  }

  /** Moves a task through the assignee's submit path so it is UNDER_REVIEW. */
  async function submitWork(assignee: Principal, taskId: string) {
    const started = await as(
      assignee,
      "post",
      `/api/v1/tasks/${taskId}/transition`,
    ).send({ status: "IN_PROGRESS" });
    expect(started.status, JSON.stringify(started.body)).toBe(200);
    const submitted = await as(
      assignee,
      "post",
      `/api/v1/tasks/${taskId}/submit`,
    ).send({});
    expect(submitted.status, JSON.stringify(submitted.body)).toBe(200);
  }

  function review(actor: Principal, taskId: string, outcome = "APPROVED") {
    return as(actor, "post", `/api/v1/tasks/${taskId}/reviews`).send({
      outcome,
    });
  }

  describe("task assignment and per-task reporting recipients", () => {
    it("lets Super Admin assign a task to Admin, reporting to Super Admin", async () => {
      const task = await createTask(superAdmin, {
        departmentId: eventOffice,
        assigneeId: admin.id,
      });
      expect(task.assignees.map((a) => a.id)).toEqual([admin.id]);
      expect(task.reportTo?.id).toBe(superAdmin.id);
      expect(task.reportToPinned).toBe(false);

      // Admin cannot approve their own submission; Super Admin decides.
      await submitWork(admin, task.id);
      expect((await review(admin, task.id)).status).toBe(403);
      const approved = await review(superAdmin, task.id);
      expect(approved.status, JSON.stringify(approved.body)).toBe(201);
      expect((await getTask(superAdmin, task.id)).status).toBe("COMPLETED");
    });

    it("lets Admin assign to a Department Manager in any department, reporting to that Admin", async () => {
      const task = await createTask(admin, {
        departmentId: production,
        assigneeId: productionManager.id,
      });
      expect(task.reportTo?.id).toBe(admin.id);
      expect(task.assignees.map((a) => a.id)).toEqual([productionManager.id]);
    });

    it("lets Admin assign directly to a member of the chosen department, who then reports to Admin", async () => {
      const task = await createTask(admin, {
        departmentId: marketing,
        assigneeId: marketingMember.id,
      });
      expect(task.reportTo?.id).toBe(admin.id);
      await submitWork(marketingMember, task.id);

      // The Marketing manager keeps read visibility but is not the recipient.
      expect(
        (await as(marketingManager, "get", `/api/v1/tasks/${task.id}`)).status,
      ).toBe(200);
      const byManager = await review(marketingManager, task.id);
      expect(byManager.status).toBe(403);
      // Another Admin is not the recipient either.
      expect((await review(admin2, task.id)).status).toBe(403);
      // The assignee cannot approve their own work.
      expect((await review(marketingMember, task.id)).status).toBe(403);

      const approved = await review(admin, task.id);
      expect(approved.status, JSON.stringify(approved.body)).toBe(201);
      expect((await getTask(admin, task.id)).status).toBe("COMPLETED");
    });

    it("keeps the assignee in the department chosen for the task, even for Admin", async () => {
      const response = await as(admin, "post", "/api/v1/tasks").send({
        title: "Cross-department mismatch",
        departmentId: production,
        assigneeId: marketingMember.id,
      });
      expect(response.status).toBe(400);
      expect(code(response)).toBe("TASK_ASSIGNEE_OUTSIDE_DEPARTMENT");
    });

    it("lets a Department Manager assign to their own department's members, reporting to that manager", async () => {
      const task = await createTask(productionManager, {
        departmentId: production,
        assigneeId: productionMember.id,
      });
      expect(task.reportTo?.id).toBe(productionManager.id);
      await submitWork(productionMember, task.id);
      // Admin has organization read/review scope but is not the recipient.
      expect((await review(admin, task.id)).status).toBe(403);
      expect((await review(productionManager, task.id)).status).toBe(201);
    });

    it("keeps Department Managers inside their own department", async () => {
      const otherDepartment = await as(
        productionManager,
        "post",
        "/api/v1/tasks",
      ).send({ title: "Cross-department", departmentId: marketing });
      expect(otherDepartment.status).toBe(403);

      const own = await createTask(productionManager, {
        departmentId: production,
      });
      const crossAssign = await as(
        productionManager,
        "put",
        `/api/v1/tasks/${own.id}/assignees/${marketingMember.id}`,
      );
      expect(crossAssign.status).toBe(400);
      expect(code(crossAssign)).toBe("TASK_ASSIGNEE_OUTSIDE_DEPARTMENT");
    });

    it("preserves the reporting chain when a manager delegates a subtask", async () => {
      const parent = await createTask(admin, {
        departmentId: production,
        assigneeId: productionManager.id,
      });
      expect(parent.reportTo?.id).toBe(admin.id);

      const subtask = await createTask(productionManager, {
        departmentId: production,
        parentTaskId: parent.id,
        assigneeId: productionMember.id,
      });
      expect(subtask.parentTaskId).toBe(parent.id);
      // The member's subtask reports to the manager who delegated it...
      expect(subtask.reportTo?.id).toBe(productionManager.id);
      // ...while the parent still reports to Admin.
      expect((await getTask(admin, parent.id)).reportTo?.id).toBe(admin.id);

      await submitWork(productionMember, subtask.id);
      expect((await review(admin, subtask.id)).status).toBe(403);
      expect((await review(productionManager, subtask.id)).status).toBe(201);

      // Finishing the subtask never completes (or even starts) the parent.
      expect((await getTask(admin, parent.id)).status).toBe("TODO");

      // The manager submits the parent to Admin, who approves it.
      await submitWork(productionManager, parent.id);
      expect((await review(productionManager, parent.id)).status).toBe(403);
      expect((await review(admin, parent.id)).status).toBe(201);
    });

    it("keeps the designated reviewer when someone else assigns the task later", async () => {
      const task = await createTask(admin, {
        departmentId: production,
        assigneeId: productionMember.id,
      });
      expect(task.reportTo?.id).toBe(admin.id);

      const assigned = await as(
        productionManager,
        "put",
        `/api/v1/tasks/${task.id}/assignees/${secondProductionMember.id}`,
      );
      expect(assigned.status, JSON.stringify(assigned.body)).toBe(200);
      // Reassignment never changes who reviews the work.
      expect(body<TaskBody>(assigned).reportTo?.id).toBe(admin.id);
      expect((await getTask(superAdmin, task.id)).reportTo?.id).toBe(admin.id);

      await submitWork(productionMember, task.id);
      expect((await review(productionManager, task.id)).status).toBe(403);
      expect((await review(admin, task.id)).status).toBe(201);
    });
    it("changes the reviewer only through Super Admin's reason-required action", async () => {
      const task = await createTask(admin, {
        departmentId: production,
        assigneeId: productionMember.id,
      });
      const missingReason = await as(
        superAdmin,
        "put",
        `/api/v1/tasks/${task.id}/reviewer`,
      ).send({ reviewerId: admin2.id, reason: "   " });
      expect(missingReason.status).toBe(400);

      const changed = await as(
        superAdmin,
        "put",
        `/api/v1/tasks/${task.id}/reviewer`,
      ).send({ reviewerId: admin2.id, reason: "Covering while Admin is away" });
      expect(changed.status, JSON.stringify(changed.body)).toBe(200);
      expect(body<TaskBody>(changed).reportTo?.id).toBe(admin2.id);

      // The change, its reason and the actor are kept in the review history.
      const history = await as(
        superAdmin,
        "get",
        `/api/v1/tasks/${task.id}/review-history`,
      );
      expect(history.status).toBe(200);
      expect(JSON.stringify(body(history))).toContain(
        "Covering while Admin is away",
      );

      // Later assignments do not undo it.
      await as(
        productionManager,
        "put",
        `/api/v1/tasks/${task.id}/assignees/${secondProductionMember.id}`,
      );
      expect((await getTask(superAdmin, task.id)).reportTo?.id).toBe(admin2.id);
    });
    it("only Super Admin changes the reviewer, and only to an eligible person", async () => {
      const task = await createTask(admin, {
        departmentId: production,
        assigneeId: productionMember.id,
      });
      // Admin and managers cannot name a recipient on create.
      const onCreate = await as(admin, "post", "/api/v1/tasks").send({
        title: "Named recipient",
        departmentId: production,
        reportToId: admin2.id,
      });
      expect(onCreate.status).toBe(403);
      for (const actor of [admin, productionManager]) {
        const changed = await as(
          actor,
          "put",
          `/api/v1/tasks/${task.id}/reviewer`,
        ).send({ reviewerId: admin2.id, reason: "Not mine to decide" });
        expect(changed.status).toBe(403);
      }
      // A member assigned to the task, and another department's manager, are
      // not eligible reviewers.
      for (const target of [productionMember.id, marketingManager.id]) {
        const invalid = await as(
          superAdmin,
          "put",
          `/api/v1/tasks/${task.id}/reviewer`,
        ).send({ reviewerId: target, reason: "Try" });
        expect(invalid.status).toBe(400);
        expect(code(invalid)).toBe("TASK_REVIEWER_INVALID");
      }
    });
    it("only lets Super Admin assign work to an Admin account", async () => {
      for (const actor of [admin2, productionManager]) {
        const response = await as(actor, "post", "/api/v1/tasks").send({
          title: "Hand to Admin",
          departmentId: eventOffice,
          assigneeId: admin.id,
        });
        expect([400, 403]).toContain(response.status);
      }
      const direct = await as(
        admin2,
        "put",
        `/api/v1/tasks/${(await createTask(admin2, { departmentId: eventOffice })).id}/assignees/${admin.id}`,
      );
      expect(direct.status).toBe(400);
      expect(code(direct)).toBe("TASK_ASSIGNEE_NOT_ELIGIBLE");
    });

    it("rejects unauthorized direct API changes to assignees, recipients and parents", async () => {
      const task = await createTask(admin, {
        departmentId: production,
        assigneeId: productionMember.id,
      });
      const other = await createTask(admin, { departmentId: production });

      for (const actor of [
        productionMember,
        marketingMember,
        marketingManager,
      ]) {
        expect(
          (
            await as(
              actor,
              "put",
              `/api/v1/tasks/${task.id}/assignees/${secondProductionMember.id}`,
            )
          ).status,
        ).toBe(403);
        expect(
          (
            await as(actor, "put", `/api/v1/tasks/${task.id}/reviewer`).send({
              reviewerId: actor.id,
              reason: "Self-promotion",
            })
          ).status,
        ).toBe(403);
      }
      // The parent link is not editable at all through the update route.
      const reparent = await as(
        admin,
        "patch",
        `/api/v1/tasks/${task.id}`,
      ).send({
        parentTaskId: other.id,
      });
      expect(reparent.status).toBe(400);
      expect((await getTask(admin, task.id)).parentTaskId).toBeNull();
    });

    it("keeps tasks outside a caller's scope confidential", async () => {
      const task = await createTask(admin, {
        departmentId: production,
        assigneeId: productionMember.id,
      });
      expect(
        (await as(marketingMember, "get", `/api/v1/tasks/${task.id}`)).status,
      ).toBe(403);
      expect(
        (await as(marketingManager, "get", `/api/v1/tasks/${task.id}`)).status,
      ).toBe(403);
      const listed = await as(
        marketingMember,
        "get",
        "/api/v1/tasks?pageSize=100",
      );
      expect(
        (body<{ items: Array<{ id: string }> }>(listed).items ?? []).some(
          (item) => item.id === task.id,
        ),
      ).toBe(false);
    });

    it("gives Admin an organization-wide view across departments", async () => {
      const mine = await createTask(admin, { departmentId: production });
      const theirs = await createTask(productionManager, {
        departmentId: production,
      });
      const marketingTask = await createTask(marketingManager, {
        departmentId: marketing,
      });
      const listed = await as(admin, "get", "/api/v1/tasks?pageSize=100");
      expect(listed.status).toBe(200);
      const ids = body<{ items: Array<{ id: string }> }>(listed).items.map(
        (item) => item.id,
      );
      expect(ids).toEqual(
        expect.arrayContaining([mine.id, theirs.id, marketingTask.id]),
      );
    });

    it("cannot bypass required review: wrong status and wrong reviewer are both refused", async () => {
      const task = await createTask(admin, {
        departmentId: production,
        assigneeId: productionMember.id,
      });
      // Not submitted yet: even the recipient gets a state conflict.
      const early = await review(admin, task.id);
      expect(early.status).toBe(409);
      expect(code(early)).toBe("TASK_REVIEW_STATE_CONFLICT");

      await submitWork(productionMember, task.id);
      expect((await review(productionMember, task.id)).status).toBe(403);
      expect((await review(productionManager, task.id)).status).toBe(403);
      // Only a decision from the recipient lands.
      expect(
        (
          await as(admin, "post", `/api/v1/tasks/${task.id}/reviews`).send({
            outcome: "CHANGES_REQUESTED",
            note: "Add the venue permit",
          })
        ).status,
      ).toBe(201);
      expect((await getTask(admin, task.id)).status).toBe("IN_PROGRESS");
    });

    it("keeps the earlier review rule for tasks that predate recipients, without widening it to Admin", async () => {
      const legacy = async () =>
        prisma.task.create({
          data: {
            title: "Legacy task",
            departmentId: production,
            status: "UNDER_REVIEW",
            createdById: superAdmin.id,
            assignments: {
              create: [
                { userId: productionMember.id, assignedById: superAdmin.id },
              ],
            },
          },
        });
      const first = await legacy();
      expect(first).toMatchObject({ reportToId: null });
      // The creator (Super Admin) is the designated reviewer; nobody else is.
      expect((await review(admin, first.id)).status).toBe(403);
      expect((await review(productionManager, first.id)).status).toBe(403);
      expect((await review(superAdmin, first.id)).status).toBe(201);

      const second = await legacy();
      expect((await review(superAdmin, second.id)).status).toBe(201);
    });
  });

  describe("department reports and consolidation", () => {
    function reportBody(date: string, extra: Record<string, unknown> = {}) {
      return {
        type: "DAILY",
        title: `Report ${date}`,
        periodStart: date,
        periodEnd: date,
        problemsEncountered: "None worth escalating",
        nextDayPlan: "Continue planned work",
        ...extra,
      };
    }

    async function createReport(
      actor: Principal,
      date: string,
      extra: Record<string, unknown> = {},
    ): Promise<ReportBody> {
      const response = await as(actor, "post", "/api/v1/reports").send(
        reportBody(date, extra),
      );
      expect(response.status, JSON.stringify(response.body)).toBe(201);
      return body<ReportBody>(response);
    }

    it("sends a member's report to their department manager, who alone (or Super Admin) reviews it", async () => {
      const report = await createReport(productionMember, "2026-10-01");
      const submitted = await as(
        productionMember,
        "post",
        `/api/v1/reports/${report.id}/submit`,
      ).send({});
      expect(submitted.status, JSON.stringify(submitted.body)).toBe(200);
      expect(body<ReportBody>(submitted).reportToId).toBe(productionManager.id);

      const reviewPath = `/api/v1/reports/${report.id}/reviews`;
      expect(
        (await as(admin, "post", reviewPath).send({ outcome: "REVIEWED" }))
          .status,
      ).toBe(403);
      expect(
        (
          await as(marketingManager, "post", reviewPath).send({
            outcome: "REVIEWED",
          })
        ).status,
      ).toBe(403);
      expect(
        (
          await as(productionManager, "post", reviewPath).send({
            outcome: "REVIEWED",
          })
        ).status,
      ).toBe(200);
    });

    it("refuses a manager's department report until Super Admin designates the reporting Admin", async () => {
      const report = await createReport(productionManager, "2026-10-02");
      const path = `/api/v1/reports/${report.id}/submit`;
      const refused = await as(productionManager, "post", path).send({});
      expect(refused.status).toBe(409);
      expect(code(refused)).toBe("REPORT_RECIPIENT_NOT_DESIGNATED");

      // Only Super Admin designates, and only an active Admin qualifies.
      const designate = (actor: Principal, userId: string | null) =>
        as(
          actor,
          "put",
          `/api/v1/departments/${production}/reporting-admin`,
        ).send({ userId });
      expect((await designate(admin, admin.id)).status).toBe(403);
      expect((await designate(productionManager, admin.id)).status).toBe(403);
      const notAdmin = await designate(superAdmin, productionMember.id);
      expect(notAdmin.status).toBe(400);
      const ok = await designate(superAdmin, admin.id);
      expect(ok.status, JSON.stringify(ok.body)).toBe(200);

      // Never an arbitrary Admin: naming a different one is refused.
      const wrongAdmin = await as(productionManager, "post", path).send({
        reportToId: admin2.id,
      });
      expect(wrongAdmin.status).toBe(400);
      expect(code(wrongAdmin)).toBe("REPORT_RECIPIENT_INVALID");

      const submitted = await as(productionManager, "post", path).send({});
      expect(submitted.status, JSON.stringify(submitted.body)).toBe(200);
      expect(body<ReportBody>(submitted).reportToId).toBe(admin.id);

      const reviewPath = `/api/v1/reports/${report.id}/reviews`;
      // The author, another Admin and another manager cannot review it.
      for (const actor of [productionManager, admin2, marketingManager]) {
        expect(
          (await as(actor, "post", reviewPath).send({ outcome: "REVIEWED" }))
            .status,
        ).toBe(403);
      }
      expect(
        (await as(admin, "post", reviewPath).send({ outcome: "REVIEWED" }))
          .status,
      ).toBe(200);
    });

    it("lets Admin consolidate reviewed manager reports and submit to a chosen Super Admin", async () => {
      // 2026-10-02's manager report was reviewed above.
      const managerReport = await prisma.report.findFirstOrThrow({
        where: { authorId: productionManager.id, status: "REVIEWED" },
      });
      const consolidated = await createReport(admin, "2026-10-03", {
        sourceReportIds: [managerReport.id],
      });
      expect(consolidated.sources.map((s) => s.id)).toEqual([managerReport.id]);

      // Sources must be reviewed manager reports, and only Admin may use them.
      const memberReport = await prisma.report.findFirstOrThrow({
        where: { authorId: productionMember.id },
      });
      const badSource = await as(admin, "post", "/api/v1/reports").send(
        reportBody("2026-10-04", { sourceReportIds: [memberReport.id] }),
      );
      expect(badSource.status).toBe(400);
      expect(code(badSource)).toBe("REPORT_SOURCE_INVALID");
      const byManager = await as(
        marketingManager,
        "post",
        "/api/v1/reports",
      ).send(reportBody("2026-10-04", { sourceReportIds: [managerReport.id] }));
      expect(byManager.status).toBe(403);

      // Two active Super Admins exist, so the recipient must be chosen.
      const path = `/api/v1/reports/${consolidated.id}/submit`;
      const unchosen = await as(admin, "post", path).send({});
      expect(unchosen.status).toBe(400);
      expect(code(unchosen)).toBe("REPORT_RECIPIENT_REQUIRED");
      const toAdmin = await as(admin, "post", path).send({
        reportToId: admin2.id,
      });
      expect(toAdmin.status).toBe(400);
      expect(code(toAdmin)).toBe("REPORT_RECIPIENT_INVALID");

      const submitted = await as(admin, "post", path).send({
        reportToId: superAdmin.id,
      });
      expect(submitted.status, JSON.stringify(submitted.body)).toBe(200);
      expect(body<ReportBody>(submitted).reportToId).toBe(superAdmin.id);

      const reviewPath = `/api/v1/reports/${consolidated.id}/reviews`;
      expect(
        (await as(admin, "post", reviewPath).send({ outcome: "REVIEWED" }))
          .status,
      ).toBe(403);
      expect(
        (
          await as(superAdmin2, "post", reviewPath).send({
            outcome: "REVIEWED",
          })
        ).status,
      ).toBe(200); // Super Admin is the organization's final authority.
    });

    it("lets only Super Admin re-route a submitted, unreviewed report", async () => {
      const report = await createReport(secondProductionMember, "2026-10-05");
      await as(
        secondProductionMember,
        "post",
        `/api/v1/reports/${report.id}/submit`,
      ).send({});
      const path = `/api/v1/reports/${report.id}/recipient`;
      expect(
        (await as(admin, "put", path).send({ reportToId: admin.id })).status,
      ).toBe(403);
      const invalid = await as(superAdmin, "put", path).send({
        reportToId: productionMember.id,
      });
      expect(invalid.status).toBe(400);
      const ok = await as(superAdmin, "put", path).send({
        reportToId: admin.id,
      });
      expect(ok.status, JSON.stringify(ok.body)).toBe(200);
      expect(body<ReportBody>(ok).reportToId).toBe(admin.id);
    });

    it("keeps reports confidential to their scope", async () => {
      const report = await createReport(productionMember, "2026-10-06");
      expect(
        (await as(marketingMember, "get", `/api/v1/reports/${report.id}`))
          .status,
      ).toBe(403);
      expect(
        (await as(marketingManager, "get", `/api/v1/reports/${report.id}`))
          .status,
      ).toBe(403);
    });
  });

  describe("role boundaries", () => {
    it("denies Admin every user, role, department-structure and employee-management endpoint", async () => {
      const role = await prisma.role.findUniqueOrThrow({
        where: { name: "Super Admin" },
      });
      const denied = [
        await as(admin, "get", "/api/v1/users"),
        await as(admin, "get", "/api/v1/roles"),
        await as(admin, "get", "/api/v1/employees"),
        await as(admin, "post", "/api/v1/users").send({
          email: "x@admin.test",
          firstName: "X",
          lastName: "Y",
          temporaryPassword: "temp-password-123",
          roleId: role.id,
        }),
        await as(
          admin,
          "put",
          `/api/v1/users/${productionMember.id}/role`,
        ).send({ roleId: role.id }),
        await as(admin, "put", `/api/v1/users/${admin.id}/role`).send({
          roleId: role.id,
        }),
        await as(
          admin,
          "put",
          `/api/v1/departments/${production}/manager`,
        ).send({ managerId: admin.id }),
      ];
      expect(denied.map((response) => response.status)).toEqual(
        denied.map(() => 403),
      );
    });

    it("lets only Super Admin grant the Admin role and requires a department for it", async () => {
      const adminRole = await prisma.role.findUniqueOrThrow({
        where: { name: "Admin" },
      });
      const payload = {
        email: "new-admin@admin.test",
        firstName: "New",
        lastName: "Admin",
        temporaryPassword: "temp-password-123",
        roleId: adminRole.id,
      };
      const noDepartment = await as(superAdmin, "post", "/api/v1/users").send(
        payload,
      );
      expect(noDepartment.status).toBe(400);
      expect(code(noDepartment)).toBe("USER_ASSIGNMENT_INVALID");
      const created = await as(superAdmin, "post", "/api/v1/users").send({
        ...payload,
        departmentId: eventOffice,
      });
      expect(created.status, JSON.stringify(created.body)).toBe(201);

      // Promoting an existing member to Admin is also Super-Admin-only
      // (a Department Manager lacks user.assign_role entirely).
      const promoted = await as(
        superAdmin,
        "put",
        `/api/v1/users/${secondProductionMember.id}/role`,
      ).send({ roleId: adminRole.id });
      expect(promoted.status, JSON.stringify(promoted.body)).toBe(200);
      const denied = await as(
        productionManager,
        "put",
        `/api/v1/users/${marketingMember.id}/role`,
      ).send({ roleId: adminRole.id });
      expect(denied.status).toBe(403);
    });

    it("never lets anyone change their own role", async () => {
      const adminRole = await prisma.role.findUniqueOrThrow({
        where: { name: "Admin" },
      });
      const response = await as(
        superAdmin,
        "put",
        `/api/v1/users/${superAdmin.id}/role`,
      ).send({ roleId: adminRole.id });
      expect(response.status).toBe(400);
      expect(code(response)).toBe("USER_ASSIGNMENT_INVALID");
    });

    it("registers Admins as employees only through Super Admin, keeps Super Admin out of the employee list, and keeps HR-only features HR-only", async () => {
      const adminRole = await prisma.role.findUniqueOrThrow({
        where: { name: "Admin" },
      });
      const memberRole = await prisma.role.findUniqueOrThrow({
        where: { name: "Department Member" },
      });
      const employee = (
        email: string,
        roleId: string,
        code: string,
      ): Record<string, unknown> => ({
        email,
        firstName: "Emp",
        lastName: "Loyee",
        temporaryPassword: "temp-password-123",
        roleId,
        departmentId: production,
        employeeCode: code,
        position: "Coordinator",
        employmentType: "FULL_TIME",
        employmentDate: "2026-01-05",
      });

      // The HR manager registers members normally, but cannot create an Admin.
      const byHrMember = await as(hrManager, "post", "/api/v1/employees").send(
        employee("emp-member@admin.test", memberRole.id, "EMP-1"),
      );
      expect(byHrMember.status, JSON.stringify(byHrMember.body)).toBe(201);
      const byHrAdmin = await as(hrManager, "post", "/api/v1/employees").send(
        employee("emp-admin-hr@admin.test", adminRole.id, "EMP-2"),
      );
      expect(byHrAdmin.status).toBe(403);

      const bySuperAdmin = await as(
        superAdmin,
        "post",
        "/api/v1/employees",
      ).send(employee("emp-admin@admin.test", adminRole.id, "EMP-3"));
      expect(bySuperAdmin.status, JSON.stringify(bySuperAdmin.body)).toBe(201);

      // Admin appears in the directory; Super Admin (the CEO) does not.
      const listed = await as(
        superAdmin,
        "get",
        "/api/v1/employees?pageSize=100",
      );
      expect(listed.status).toBe(200);
      const text = JSON.stringify(listed.body);
      expect(text).toContain("emp-admin@admin.test");
      expect(text).not.toContain(superAdmin.email);

      // A Super Admin account cannot be linked as an employee either.
      const linkSuperAdmin = await as(
        superAdmin,
        "post",
        "/api/v1/employees",
      ).send({
        userId: superAdmin2.id,
        employeeCode: "EMP-4",
        position: "CEO",
        employmentType: "FULL_TIME",
        employmentDate: "2026-01-05",
      });
      expect(linkSuperAdmin.status).toBe(400);
    });
  });
});
