import { randomUUID } from "node:crypto";
/* eslint-disable @typescript-eslint/require-await -- provider test doubles return promises without awaiting anything */
import { PrismaPg } from "@prisma/adapter-pg";
import type { NestExpressApplication } from "@nestjs/platform-express";
import request from "supertest";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

import { PrismaClient } from "../src/generated/prisma/client.js";
import { seedRbac } from "../src/rbac/seed-rbac.js";
import {
  createIsolatedDatabase,
  type IsolatedDatabase,
} from "./support/database.js";

const PASSWORD = "correct horse battery staple";
const CALLBACK_TOKEN = "cb-token-0123456789abcdef0123456789abcdef";

interface Principal {
  cookies: string[];
  csrfToken: string;
}

function setCookies(response: request.Response): string[] {
  const header = response.headers["set-cookie"];
  return Array.isArray(header) ? header : header ? [header] : [];
}

function cookieValue(setCookie: string[], name: string): string {
  const match = setCookie
    .map((value) => value.match(new RegExp(`^${name}=([^;]+)`)))
    .find((found): found is RegExpMatchArray => found !== null);
  if (!match) throw new Error(`cookie ${name} missing`);
  return match[1]!;
}

function rand(): string {
  return Math.random().toString(36).slice(2);
}

/** Polls until the condition holds. The real outbox relay runs every two seconds. */
async function eventually<T>(
  read: () => Promise<T>,
  done: (value: T) => boolean,
): Promise<T> {
  const deadline = Date.now() + 15_000;
  let value: T;
  for (;;) {
    value = await read();
    if (done(value)) return value;
    if (Date.now() > deadline) {
      throw new Error(
        `condition not reached; last value: ${JSON.stringify(value)}`,
      );
    }
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
}

describe("task SMS (Phase 2)", () => {
  let db: IsolatedDatabase;
  let prisma: PrismaClient;
  let app: NestExpressApplication;
  let http: ReturnType<NestExpressApplication["getHttpServer"]>;
  let superAdmin: Principal;
  let departmentId: string;
  let scheduler: { scan: (now: Date) => Promise<void> };
  let smsService: { dispatch: (event: unknown) => Promise<void> };
  let tick: () => Promise<void>;

  const provider = { send: vi.fn(), getStatus: vi.fn(), getBalance: vi.fn() };

  /** Sends of one message body. Counting by body ignores messages other tests send in the same window. */
  const sendsWithBody = (body: string) =>
    provider.send.mock.calls.filter(
      ([request]) => (request as { message: string }).message === body,
    ).length;

  beforeAll(async () => {
    db = await createIsolatedDatabase();
    process.env.DATABASE_URL = db.url;
    process.env.NODE_ENV = "test";
    process.env.AUTH_ACCESS_TOKEN_SECRET ??=
      "task-sms-access-token-secret-at-least-32";
    process.env.AUTH_REFRESH_TOKEN_SECRET ??=
      "task-sms-refresh-token-secret-at-least-32";
    process.env.AUTH_LOGIN_RATE_LIMIT_MAX = "10000";
    process.env.API_RATE_LIMIT_MAX = "100000";
    process.env.AFROMESSAGE_ENABLED = "true";
    process.env.AFROMESSAGE_API_KEY = "task-sms-api-key-value";
    process.env.AFROMESSAGE_SENDER_ID = "LELA";
    process.env.AFROMESSAGE_CALLBACK_TOKEN = CALLBACK_TOKEN;

    prisma = new PrismaClient({
      adapter: new PrismaPg(
        { connectionString: db.url },
        { schema: db.schema },
      ),
    });
    await seedRbac(prisma);

    const [
      { Test },
      appModule,
      appSetup,
      hasherModule,
      smsTypes,
      tasksSmsModule,
      smsServiceModule,
    ] = await Promise.all([
      import("@nestjs/testing"),
      import("../src/app.module.js"),
      import("../src/app.setup.js"),
      import("../src/auth/domain/password-hasher.js"),
      import("../src/sms/sms.types.js"),
      import("../src/tasks/tasks-sms.service.js"),
      import("../src/sms/sms.service.js"),
    ]);
    const hash = await new hasherModule.PasswordHasher().hash(PASSWORD);

    const tasksSchedulerModule =
      await import("../src/tasks/tasks-scheduler.service.js");
    const moduleRef = await Test.createTestingModule({
      imports: [appModule.AppModule],
    })
      .overrideProvider(smsTypes.SMS_PROVIDER)
      .useValue(provider)
      .compile();
    app = moduleRef.createNestApplication<NestExpressApplication>();
    appSetup.configureApplication(app);
    await app.init();
    http = app.getHttpServer();
    scheduler = app.get(tasksSmsModule.TasksSmsService);
    smsService = app.get(smsServiceModule.SmsService);
    // The in-app scheduler's tick, which writes the due and overdue claims that drive overdue SMS.
    const inAppScheduler = app.get(tasksSchedulerModule.TasksSchedulerService);
    tick = () =>
      (inAppScheduler as unknown as { tick: () => Promise<void> }).tick();

    provider.send.mockImplementation(async () => ({
      kind: "ACCEPTED",
      providerMessageId: `provider-${rand()}`,
      httpStatus: 200,
      response: { acknowledge: "success", status: "Send in progress..." },
    }));

    const login = async (
      email: string,
      roleName: string,
    ): Promise<Principal> => {
      const user = await prisma.user.create({
        data: { email, credential: { create: { passwordHash: hash } } },
      });
      const role = await prisma.role.findUniqueOrThrow({
        where: { name: roleName },
      });
      await prisma.userRoleAssignment.create({
        data: { userId: user.id, roleId: role.id },
      });
      const response = await request(http)
        .post("/api/v1/auth/login")
        .send({ email, password: PASSWORD });
      expect(response.status).toBe(200);
      const cookies = setCookies(response);
      return { cookies, csrfToken: cookieValue(cookies, "csrf_token") };
    };
    superAdmin = await login("super-admin@task-sms.test", "Super Admin");
    departmentId = (
      await prisma.department.create({ data: { name: "Production" } })
    ).id;
  });

  afterAll(async () => {
    await app?.close();
    await prisma?.$disconnect();
    await db?.drop();
  });

  function as(
    principal: Principal,
    method: "get" | "post" | "put" | "delete",
    path: string,
  ) {
    const req = request(http)[method](path).set("Cookie", principal.cookies);
    return method === "get"
      ? req
      : req.set("x-csrf-token", principal.csrfToken);
  }

  async function staff(
    phone: string | null,
  ): Promise<{ id: string; phone: string | null }> {
    return prisma.user.create({
      data: {
        email: `staff-${rand()}@task-sms.test`,
        phone,
        departmentId,
        firstName: "Abel",
        lastName: "Tesfaye",
      },
    });
  }

  async function createTask(
    extra: Record<string, unknown> = {},
  ): Promise<string> {
    const response = await as(superAdmin, "post", "/api/v1/tasks").send({
      title: `Task ${rand()}`,
      departmentId,
      ...extra,
    });
    expect(response.status).toBe(201);
    return (response.body as { id: string }).id;
  }

  async function smsRows(where: Record<string, unknown>) {
    return prisma.smsMessage.findMany({
      where: where as never,
      orderBy: { createdAt: "asc" },
    });
  }

  it("queues an assignment SMS to the assignee, and in-app notifications still work", async () => {
    const assignee = await staff("0911111111");
    const taskId = await createTask();
    const assign = await as(
      superAdmin,
      "put",
      `/api/v1/tasks/${taskId}/assignees/${assignee.id}`,
    );
    expect(assign.status).toBe(200);

    const rows = await eventually(
      () =>
        smsRows({ recipientUserId: assignee.id, category: "TASK_ASSIGNED" }),
      (found) => found.length === 1 && found[0]!.status === "ACCEPTED",
    );
    expect(rows[0]!.recipientPhone).toBe("+251911111111");
    expect(rows[0]!.body).toContain("you have been assigned a new task");
    expect(rows[0]!.body).toContain("Abel Tesfaye");
    // In-app notification is created independently of SMS.
    await eventually(
      () =>
        prisma.notification.count({ where: { recipientUserId: assignee.id } }),
      (count) => count >= 1,
    );
  });

  it("does not send again when the task is updated without changing its assignee", async () => {
    const assignee = await staff("0911111112");
    const taskId = await createTask();
    await as(
      superAdmin,
      "put",
      `/api/v1/tasks/${taskId}/assignees/${assignee.id}`,
    );
    await eventually(
      () =>
        smsRows({ recipientUserId: assignee.id, category: "TASK_ASSIGNED" }),
      (found) => found.length === 1,
    );
    const updated = await as(
      superAdmin,
      "put",
      `/api/v1/tasks/${taskId}/assignees/${assignee.id}`,
    );
    expect(updated.status).toBe(200);
    const patched = await as(
      superAdmin,
      "put",
      `/api/v1/tasks/${taskId}/assignees/${assignee.id}`,
    );
    expect(patched.status).toBe(200);
    expect(
      await smsRows({
        recipientUserId: assignee.id,
        category: "TASK_ASSIGNED",
      }),
    ).toHaveLength(1);
  });

  it("notifies the new assignee on reassignment only, and never the previous one", async () => {
    const previous = await staff("0911111113");
    const next = await staff("0911111114");
    const taskId = await createTask();
    await as(
      superAdmin,
      "put",
      `/api/v1/tasks/${taskId}/assignees/${previous.id}`,
    );
    await eventually(
      () =>
        smsRows({ recipientUserId: previous.id, category: "TASK_ASSIGNED" }),
      (found) => found.length === 1,
    );
    await as(superAdmin, "put", `/api/v1/tasks/${taskId}/assignees/${next.id}`);
    await as(
      superAdmin,
      "delete",
      `/api/v1/tasks/${taskId}/assignees/${previous.id}`,
    );

    await eventually(
      () => smsRows({ recipientUserId: next.id, category: "TASK_ASSIGNED" }),
      (found) => found.length === 1,
    );
    expect(
      await smsRows({
        recipientUserId: previous.id,
        category: "TASK_ASSIGNED",
      }),
    ).toHaveLength(1);
  });

  it("sends a 24-hour reminder once, and only to the current assignee", async () => {
    const assignee = await staff("0911111115");
    const taskId = await createTask({
      dueAt: new Date(Date.now() + 12 * 3600_000).toISOString(),
    });
    await as(
      superAdmin,
      "put",
      `/api/v1/tasks/${taskId}/assignees/${assignee.id}`,
    );
    // Assigned well before the 24-hour window opens, so a reminder is due.
    await prisma.taskAssignment.update({
      where: { taskId_userId: { taskId, userId: assignee.id } },
      data: { assignedAt: new Date(Date.now() - 2 * 24 * 3600_000) },
    });
    const now = new Date();
    await scheduler.scan(now);
    await scheduler.scan(now);
    const reminders = await eventually(
      () =>
        smsRows({ recipientUserId: assignee.id, category: "TASK_REMINDER" }),
      (found) => found.length === 1 && found[0]!.status === "ACCEPTED",
    );
    expect(reminders[0]!.sourceDueAt).not.toBeNull();
    expect(reminders[0]!.body).toContain("is due on");
  });

  it("sends one overdue notice when a task passes its due date", async () => {
    const assignee = await staff("0911111116");
    const taskId = await createTask();
    await as(
      superAdmin,
      "put",
      `/api/v1/tasks/${taskId}/assignees/${assignee.id}`,
    );
    const past = new Date(Date.now() - 3600_000);
    await prisma.task.update({ where: { id: taskId }, data: { dueAt: past } });
    // The in-app scheduler writes the due claim, then the overdue claim; the SMS rides on the overdue claim.
    await tick();
    await tick();
    await tick();
    const overdue = await eventually(
      () => smsRows({ recipientUserId: assignee.id, category: "TASK_OVERDUE" }),
      (found) => found.length === 1 && found[0]!.status === "ACCEPTED",
    );
    expect(overdue[0]!.body).toContain("passed its due date");
  });

  it("does not notify tasks that were already overdue before SMS was enabled", async () => {
    const assignee = await staff("0911111122");
    const taskId = await createTask();
    await as(
      superAdmin,
      "put",
      `/api/v1/tasks/${taskId}/assignees/${assignee.id}`,
    );
    await prisma.task.update({
      where: { id: taskId },
      data: { dueAt: new Date(Date.now() - 3600_000) },
    });
    // SMS disabled while the in-app scheduler marks the task overdue (claims are written).
    const { ENVIRONMENT } = await import("../src/config/environment.js");
    const environment = app.get<{ AFROMESSAGE_ENABLED: boolean }>(ENVIRONMENT);
    environment.AFROMESSAGE_ENABLED = false;
    try {
      await tick();
      await tick();
      await tick();
    } finally {
      environment.AFROMESSAGE_ENABLED = true;
    }
    // SMS enabled later: the overdue claim already exists, so nothing is sent.
    await tick();
    await tick();
    expect(
      await smsRows({ recipientUserId: assignee.id, category: "TASK_OVERDUE" }),
    ).toHaveLength(0);
  });

  it("does not send a reminder for an assignment made inside the 24-hour window", async () => {
    const lateAssignee = await staff("0911111123");
    const earlyAssignee = await staff("0911111124");
    const taskId = await createTask({
      dueAt: new Date(Date.now() + 3 * 3600_000).toISOString(),
    });
    await as(
      superAdmin,
      "put",
      `/api/v1/tasks/${taskId}/assignees/${lateAssignee.id}`,
    );
    await prisma.taskAssignment.create({
      data: {
        taskId,
        userId: earlyAssignee.id,
        assignedAt: new Date(Date.now() - 2 * 24 * 3600_000),
      },
    });
    await scheduler.scan(new Date());
    expect(
      await smsRows({
        recipientUserId: lateAssignee.id,
        category: "TASK_REMINDER",
      }),
    ).toHaveLength(0);
    await eventually(
      () =>
        smsRows({
          recipientUserId: earlyAssignee.id,
          category: "TASK_REMINDER",
        }),
      (found) => found.length === 1,
    );
  });

  it("does not send reminders or overdue notices for completed or cancelled tasks", async () => {
    const assignee = await staff("0911111117");
    for (const status of ["COMPLETED", "CANCELLED"] as const) {
      const taskId = await createTask({
        dueAt: new Date(Date.now() + 6 * 3600_000).toISOString(),
      });
      await as(
        superAdmin,
        "put",
        `/api/v1/tasks/${taskId}/assignees/${assignee.id}`,
      );
      await prisma.task.update({ where: { id: taskId }, data: { status } });
    }
    await scheduler.scan(new Date());
    expect(
      await smsRows({
        recipientUserId: assignee.id,
        category: "TASK_REMINDER",
      }),
    ).toHaveLength(0);
    expect(
      await smsRows({ recipientUserId: assignee.id, category: "TASK_OVERDUE" }),
    ).toHaveLength(0);
  });

  it("cancels a queued reminder when the due date changes before it is sent", async () => {
    const assignee = await staff("0911111118");
    const taskId = await createTask({
      dueAt: new Date(Date.now() + 12 * 3600_000).toISOString(),
    });
    const assignment = await prisma.taskAssignment.create({
      data: { taskId, userId: assignee.id },
    });
    const scheduledFor = new Date(Date.now() + 12 * 3600_000);
    const row = await prisma.smsMessage.create({
      data: {
        idempotencyKey: `test:${rand()}`,
        category: "TASK_REMINDER",
        recipientUserId: assignee.id,
        recipientPhone: "+251911111118",
        body: "LELA REMINDER: test",
        templateKey: "task.reminder",
        sourceType: "task_assignment",
        sourceId: assignment.id,
        sourceDueAt: scheduledFor,
      },
    });
    await prisma.task.update({
      where: { id: taskId },
      data: { dueAt: new Date(Date.now() + 20 * 3600_000) },
    });
    await smsService.dispatch({ payload: { smsMessageId: row.id } });
    const after = await prisma.smsMessage.findUniqueOrThrow({
      where: { id: row.id },
    });
    expect(after.status).toBe("CANCELLED");
    expect(after.lastError).toBe("DUE_DATE_CHANGED");
  });

  it("cancels a queued message when its assignee has been removed, and sends nothing", async () => {
    const assignee = await staff("0911111119");
    const taskId = await createTask();
    const assignment = await prisma.taskAssignment.create({
      data: { taskId, userId: assignee.id },
    });
    const body = `LELA: removed ${rand()}`;
    const row = await prisma.smsMessage.create({
      data: {
        idempotencyKey: `test:${rand()}`,
        category: "TASK_ASSIGNED",
        recipientUserId: assignee.id,
        recipientPhone: "+251911111119",
        body,
        templateKey: "task.assigned",
        sourceType: "task_assignment",
        sourceId: assignment.id,
      },
    });
    await prisma.taskAssignment.delete({ where: { id: assignment.id } });
    await smsService.dispatch({ payload: { smsMessageId: row.id } });
    expect(
      (await prisma.smsMessage.findUniqueOrThrow({ where: { id: row.id } }))
        .lastError,
    ).toBe("ASSIGNMENT_REMOVED");
    expect(sendsWithBody(body)).toBe(0);
  });

  it("sends to the number on the profile at send time, and skips an invalid one", async () => {
    const assignee = await staff("0911111120");
    const taskId = await createTask();
    const assignment = await prisma.taskAssignment.create({
      data: { taskId, userId: assignee.id },
    });
    const profileBody = `LELA: profile ${rand()}`;
    const row = await prisma.smsMessage.create({
      data: {
        idempotencyKey: `test:${rand()}`,
        category: "TASK_ASSIGNED",
        recipientUserId: assignee.id,
        recipientPhone: "+251911111120",
        body: profileBody,
        templateKey: "task.assigned",
        sourceType: "task_assignment",
        sourceId: assignment.id,
      },
    });
    await prisma.user.update({
      where: { id: assignee.id },
      data: { phone: "0933333333" },
    });
    await smsService.dispatch({ payload: { smsMessageId: row.id } });
    const sent = await prisma.smsMessage.findUniqueOrThrow({
      where: { id: row.id },
    });
    expect(sent.recipientPhone).toBe("+251933333333");
    // Look for this message among all sends: other tests can send in the same window, so the last call is not reliable.
    expect(
      provider.send.mock.calls.some(
        ([request]) =>
          (request as { message: string; to: string }).message ===
            profileBody &&
          (request as { message: string; to: string }).to === "+251933333333",
      ),
    ).toBe(true);

    await prisma.user.update({
      where: { id: assignee.id },
      data: { phone: "0112345678" },
    });
    const body = `LELA: invalid ${rand()}`;
    const invalid = await prisma.smsMessage.create({
      data: {
        idempotencyKey: `test:${rand()}`,
        category: "TASK_ASSIGNED",
        recipientUserId: assignee.id,
        recipientPhone: "+251933333333",
        body,
        templateKey: "task.assigned",
        sourceType: "task_assignment",
        sourceId: assignment.id,
      },
    });
    await smsService.dispatch({ payload: { smsMessageId: invalid.id } });
    expect(
      (await prisma.smsMessage.findUniqueOrThrow({ where: { id: invalid.id } }))
        .status,
    ).toBe("SKIPPED");
    expect(sendsWithBody(body)).toBe(0);
  });

  it("dispatches a message once, however many times the consumer runs", async () => {
    const assignee = await staff("0911111121");
    const taskId = await createTask();
    const assignment = await prisma.taskAssignment.create({
      data: { taskId, userId: assignee.id },
    });
    // A unique body lets the count ignore messages other tests send in the same window.
    const body = `LELA: once ${rand()}`;
    const row = await prisma.smsMessage.create({
      data: {
        idempotencyKey: `test:${rand()}`,
        category: "TASK_ASSIGNED",
        recipientUserId: assignee.id,
        recipientPhone: "+251911111121",
        body,
        templateKey: "task.assigned",
        sourceType: "task_assignment",
        sourceId: assignment.id,
      },
    });
    await smsService.dispatch({ payload: { smsMessageId: row.id } });
    await smsService.dispatch({ payload: { smsMessageId: row.id } });
    expect(sendsWithBody(body)).toBe(1);
  });

  it("keeps the assignment when its SMS cannot be queued", async () => {
    const assignee = await staff("0911111126");
    const taskId = await createTask();
    const missingRecipient = randomUUID();
    const service = scheduler as unknown as {
      enqueueAssignment: (
        tx: unknown,
        input: Record<string, unknown>,
      ) => Promise<void>;
    };
    const created = await prisma.$transaction(async (tx) => {
      const assignment = await tx.taskAssignment.create({
        data: { taskId, userId: assignee.id },
      });
      // The recipient does not exist, so the SMS insert fails inside its savepoint only.
      await service.enqueueAssignment(tx, {
        taskId,
        assignmentId: assignment.id,
        taskTitle: "Savepoint check",
        dueAt: null,
        assigneeUserId: missingRecipient,
        assignedById: null,
        requestId: "savepoint-check",
      });
      return assignment;
    });
    expect(
      await prisma.taskAssignment.findUnique({ where: { id: created.id } }),
    ).not.toBeNull();
    expect(
      await prisma.smsMessage.count({
        where: { idempotencyKey: `task.assigned:${created.id}` },
      }),
    ).toBe(0);
    // The failure is recorded, not silently lost, and names the task but no phone number.
    const failures = await prisma.auditRecord.findMany({
      where: { action: "sms.enqueue_failed", resourceId: taskId },
    });
    expect(failures).toHaveLength(1);
    expect(failures[0]!.metadata).toMatchObject({ category: "TASK_ASSIGNED" });
    expect(JSON.stringify(failures[0]!.metadata)).not.toMatch(/\+251|0911/);
  });

  it("reminds every eligible task across more than 200 tasks: none missed, none duplicated", async () => {
    const assignee = await staff("0911111125");
    const total = 250;
    const ids = Array.from({ length: total }, () => randomUUID());
    const dueAt = new Date(Date.now() + 6 * 3600_000);
    await prisma.task.createMany({
      data: ids.map((id) => ({
        id,
        title: `Bulk ${id.slice(0, 8)}`,
        dueAt,
        departmentId,
      })),
    });
    await prisma.taskAssignment.createMany({
      data: ids.map((taskId) => ({
        taskId,
        userId: assignee.id,
        assignedAt: new Date(Date.now() - 2 * 24 * 3600_000),
      })),
    });

    // Each scan covers one page of 200 tasks; a short page resets the position.
    let queued = 0;
    for (let scans = 0; scans < 12 && queued < total; scans += 1) {
      await scheduler.scan(new Date());
      queued = (
        await smsRows({
          recipientUserId: assignee.id,
          category: "TASK_REMINDER",
        })
      ).length;
    }
    expect(queued).toBe(total);

    const rows = await smsRows({
      recipientUserId: assignee.id,
      category: "TASK_REMINDER",
    });
    const sources = new Set(rows.map((row) => row.sourceId));
    expect(sources.size).toBe(total);
    const assignmentIds = (
      await prisma.taskAssignment.findMany({
        where: { userId: assignee.id, taskId: { in: ids } },
        select: { id: true },
      })
    ).map((row) => row.id);
    expect(new Set(assignmentIds)).toEqual(sources);

    // Further scans add nothing: the keys already exist.
    await scheduler.scan(new Date());
    await scheduler.scan(new Date());
    expect(
      (
        await smsRows({
          recipientUserId: assignee.id,
          category: "TASK_REMINDER",
        })
      ).length,
    ).toBe(total);
  }, 600_000);
});
