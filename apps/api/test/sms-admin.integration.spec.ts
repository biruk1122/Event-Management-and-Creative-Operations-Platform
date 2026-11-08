import { randomUUID } from "node:crypto";
/* eslint-disable @typescript-eslint/require-await -- provider test doubles return promises without awaiting anything */
/* eslint-disable @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-call -- supertest response bodies are untyped JSON, which these tests assert on directly */
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
const API_KEY = "sms-admin-api-key-value-0123";
const CALLBACK_TOKEN = "sms-admin-callback-token-0123456789abcdef";
const PHONE_DIGITS = "911223344";

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

describe("SMS administration (Phase 5)", () => {
  let db: IsolatedDatabase;
  let prisma: PrismaClient;
  let app: NestExpressApplication;
  let http: ReturnType<NestExpressApplication["getHttpServer"]>;
  let superAdmin: Principal;
  let admin: Principal;
  let plainUser: Principal;
  let recipient: { id: string };
  let environment: { AFROMESSAGE_ENABLED: boolean };

  const provider = { send: vi.fn(), getStatus: vi.fn(), getBalance: vi.fn() };

  beforeAll(async () => {
    db = await createIsolatedDatabase();
    process.env.DATABASE_URL = db.url;
    process.env.NODE_ENV = "test";
    process.env.AUTH_ACCESS_TOKEN_SECRET ??=
      "sms-admin-access-token-secret-at-least-32";
    process.env.AUTH_REFRESH_TOKEN_SECRET ??=
      "sms-admin-refresh-token-secret-at-least-32";
    process.env.AUTH_LOGIN_RATE_LIMIT_MAX = "10000";
    process.env.API_RATE_LIMIT_MAX = "100000";
    process.env.AFROMESSAGE_ENABLED = "true";
    process.env.AFROMESSAGE_API_KEY = API_KEY;
    process.env.AFROMESSAGE_SENDER_ID = "LELA";
    process.env.AFROMESSAGE_CALLBACK_TOKEN = CALLBACK_TOKEN;
    process.env.AFROMESSAGE_TIMEOUT_MS = "5000";

    prisma = new PrismaClient({
      adapter: new PrismaPg(
        { connectionString: db.url },
        { schema: db.schema },
      ),
    });
    await seedRbac(prisma);

    const [{ Test }, appModule, appSetup, hasherModule, smsTypes, envModule] =
      await Promise.all([
        import("@nestjs/testing"),
        import("../src/app.module.js"),
        import("../src/app.setup.js"),
        import("../src/auth/domain/password-hasher.js"),
        import("../src/sms/sms.types.js"),
        import("../src/config/environment.js"),
      ]);
    const hash = await new hasherModule.PasswordHasher().hash(PASSWORD);

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
    environment = app.get<{ AFROMESSAGE_ENABLED: boolean }>(
      envModule.ENVIRONMENT,
    );

    async function login(email: string, roleName?: string): Promise<Principal> {
      const user = await prisma.user.create({
        data: { email, credential: { create: { passwordHash: hash } } },
      });
      if (roleName) {
        const role = await prisma.role.findUniqueOrThrow({
          where: { name: roleName },
        });
        await prisma.userRoleAssignment.create({
          data: { userId: user.id, roleId: role.id },
        });
      }
      const response = await request(http)
        .post("/api/v1/auth/login")
        .send({ email, password: PASSWORD });
      expect(response.status).toBe(200);
      const cookies = setCookies(response);
      return { cookies, csrfToken: cookieValue(cookies, "csrf_token") };
    }

    superAdmin = await login("super-admin@sms-admin.test", "Super Admin");
    admin = await login("admin@sms-admin.test", "Admin");
    plainUser = await login("plain@sms-admin.test");
    recipient = await prisma.user.create({
      data: {
        email: `recipient-${rand()}@sms-admin.test`,
        phone: `0${PHONE_DIGITS}`,
        firstName: "Hanna",
        lastName: "Bekele",
      },
    });

    provider.send.mockImplementation(async () => ({
      kind: "ACCEPTED",
      providerMessageId: `provider-${rand()}`,
      httpStatus: 200,
      response: { acknowledge: "success", status: "Send in progress..." },
    }));
    provider.getBalance.mockImplementation(async () => ({
      kind: "OK",
      balance: "205.65",
      estimatedMessages: "3577",
    }));
  });

  afterAll(async () => {
    await app?.close();
    await prisma?.$disconnect();
    await db?.drop();
  });

  function as(
    principal: Principal,
    method: "get" | "post" | "patch",
    path: string,
  ) {
    const req = request(http)[method](path).set("Cookie", principal.cookies);
    return method === "get"
      ? req
      : req.set("x-csrf-token", principal.csrfToken);
  }

  /** Inserts a message directly, so each test controls its status, category and creation time. */
  async function message(input: {
    category?: "TEST" | "TASK_ASSIGNED";
    status:
      "PENDING" | "ACCEPTED" | "FAILED" | "SKIPPED" | "UNCERTAIN" | "CANCELLED";
    recipientUserId?: string | null;
    createdAt?: Date;
  }) {
    return prisma.smsMessage.create({
      data: {
        idempotencyKey: `admin-test:${randomUUID()}`,
        category: input.category ?? "TEST",
        recipientUserId: input.recipientUserId ?? null,
        recipientPhone: input.recipientUserId ? `+251${PHONE_DIGITS}` : null,
        body: "LELA: admin test message",
        templateKey: "test.connection",
        status: input.status,
        ...(input.status === "ACCEPTED"
          ? {
              providerMessageId: `provider-${randomUUID()}`,
              acceptedAt: new Date(),
            }
          : {}),
        ...(input.status === "SKIPPED"
          ? { skipReason: "INVALID_PHONE_NUMBER" }
          : {}),
        ...(input.status === "FAILED" ? { lastError: "REJECTED" } : {}),
        ...(input.createdAt ? { createdAt: input.createdAt } : {}),
      },
    });
  }

  async function setGlobal(enabled: boolean): Promise<void> {
    await prisma.smsRuntimeSettings.upsert({
      where: { id: 1 },
      create: { id: 1, globalEnabled: enabled },
      update: { globalEnabled: enabled },
    });
  }

  // ---- Authorization -------------------------------------------------------

  it("lets only a Super Admin read the settings, and refuses other roles", async () => {
    const ok = await as(superAdmin, "get", "/api/v1/sms/settings");
    expect(ok.status).toBe(200);
    expect(await as(admin, "get", "/api/v1/sms/settings")).toMatchObject({
      status: 403,
    });
    expect(await as(plainUser, "get", "/api/v1/sms/settings")).toMatchObject({
      status: 403,
    });
  });

  it("requires Super Admin and the CSRF token to change the settings", async () => {
    expect(
      (
        await as(admin, "patch", "/api/v1/sms/settings").send({
          globalEnabled: true,
        })
      ).status,
    ).toBe(403);
    expect(
      (
        await request(http)
          .patch("/api/v1/sms/settings")
          .set("Cookie", superAdmin.cookies)
          .send({ globalEnabled: true })
      ).status,
    ).toBe(403);
  });

  it("refuses detail reads for other roles, and rejects a malformed message id", async () => {
    const row = await message({
      status: "ACCEPTED",
      recipientUserId: recipient.id,
    });
    expect(
      (await as(admin, "get", `/api/v1/sms/messages/${row.id}`)).status,
    ).toBe(403);
    expect(
      (await as(superAdmin, "get", "/api/v1/sms/messages/not-a-uuid")).status,
    ).toBe(400);
  });

  // ---- Settings ------------------------------------------------------------

  it("starts with global delivery disabled, and reports the environment switch and provider presence without secrets", async () => {
    const response = await as(superAdmin, "get", "/api/v1/sms/settings");
    expect(response.body).toMatchObject({
      environmentEnabled: true,
      globalEnabled: false,
      effectiveEnabled: false,
      provider: { apiKeyConfigured: true, callbackConfigured: true },
    });
    const text = JSON.stringify(response.body);
    expect(text).not.toContain(API_KEY);
    expect(text).not.toContain(CALLBACK_TOKEN);
  });

  it("changes the global and category switches, audits the change, and reports the new state", async () => {
    const response = await as(superAdmin, "patch", "/api/v1/sms/settings").send(
      {
        globalEnabled: true,
        categories: { TASK_ASSIGNED: false },
      },
    );
    expect(response.status).toBe(200);
    expect(response.body).toMatchObject({
      globalEnabled: true,
      effectiveEnabled: true,
    });
    const assigned = response.body.categories.find(
      (row: { category: string }) => row.category === "TASK_ASSIGNED",
    );
    expect(assigned).toMatchObject({ enabled: false });

    const audit = await prisma.auditRecord.findFirst({
      where: { action: "sms.settings.updated" },
      orderBy: { occurredAt: "desc" },
    });
    expect(audit).toMatchObject({ resourceType: "sms_settings" });
    expect(audit!.metadata).toMatchObject({
      globalEnabledBefore: false,
      globalEnabledAfter: true,
      changedCategories: "TASK_ASSIGNED:off",
    });
    expect(JSON.stringify(audit!.metadata)).not.toContain(API_KEY);
  });

  it("refuses an unknown category or a non-boolean value, and changes nothing", async () => {
    const before = await prisma.smsCategorySetting.count();
    const unknown = await as(superAdmin, "patch", "/api/v1/sms/settings").send({
      categories: { NOT_A_CATEGORY: true },
    });
    expect(unknown.status).toBe(400);
    expect(unknown.body.code).toBe("SMS_SETTINGS_INVALID");
    const notBoolean = await as(
      superAdmin,
      "patch",
      "/api/v1/sms/settings",
    ).send({
      globalEnabled: "yes",
    });
    expect(notBoolean.status).toBe(400);
    expect(await prisma.smsCategorySetting.count()).toBe(before);
  });

  it("writes no audit record when a change leaves every switch as it was", async () => {
    const before = await prisma.auditRecord.count({
      where: { action: "sms.settings.updated" },
    });
    await as(superAdmin, "patch", "/api/v1/sms/settings").send({
      globalEnabled: true,
    });
    expect(
      await prisma.auditRecord.count({
        where: { action: "sms.settings.updated" },
      }),
    ).toBe(before);
  });

  // ---- Send-time switches ---------------------------------------------------

  it("cancels a queued message with GLOBAL_DISABLED when global delivery is off at send time", async () => {
    const queued = await message({
      status: "PENDING",
      recipientUserId: recipient.id,
    });
    await setGlobal(false);
    const sendsBefore = provider.send.mock.calls.length;
    await app
      .get(await import("../src/sms/sms.service.js").then((m) => m.SmsService))
      .dispatch({ payload: { smsMessageId: queued.id } } as never);
    expect(
      await prisma.smsMessage.findUniqueOrThrow({ where: { id: queued.id } }),
    ).toMatchObject({ status: "CANCELLED", lastError: "GLOBAL_DISABLED" });
    expect(provider.send.mock.calls.length).toBe(sendsBefore);
    await setGlobal(true);
  });

  it("cancels a queued message with CATEGORY_DISABLED when its category is off, and keeps it in history", async () => {
    // TEST has no send-time precondition, so this exercises the category switch alone.
    await as(superAdmin, "patch", "/api/v1/sms/settings").send({
      categories: { TEST: false },
    });
    const queued = await message({
      category: "TEST",
      status: "PENDING",
      recipientUserId: recipient.id,
    });
    await app
      .get(await import("../src/sms/sms.service.js").then((m) => m.SmsService))
      .dispatch({ payload: { smsMessageId: queued.id } } as never);
    const row = await prisma.smsMessage.findUniqueOrThrow({
      where: { id: queued.id },
    });
    expect(row).toMatchObject({
      status: "CANCELLED",
      lastError: "CATEGORY_DISABLED",
    });
    await as(superAdmin, "patch", "/api/v1/sms/settings").send({
      categories: { TEST: true },
    });
  });

  it("rechecks the switches at send time, so a disable after queueing still stops the message", async () => {
    const queued = await message({
      status: "PENDING",
      recipientUserId: recipient.id,
    });
    await as(superAdmin, "patch", "/api/v1/sms/settings").send({
      globalEnabled: false,
    });
    await app
      .get(await import("../src/sms/sms.service.js").then((m) => m.SmsService))
      .dispatch({ payload: { smsMessageId: queued.id } } as never);
    expect(
      await prisma.smsMessage.findUniqueOrThrow({ where: { id: queued.id } }),
    ).toMatchObject({ status: "CANCELLED", lastError: "GLOBAL_DISABLED" });
    await as(superAdmin, "patch", "/api/v1/sms/settings").send({
      globalEnabled: true,
    });
  });

  it("never lets a runtime enable override the environment switch", async () => {
    const queued = await message({
      status: "PENDING",
      recipientUserId: recipient.id,
    });
    environment.AFROMESSAGE_ENABLED = false;
    try {
      const settings = await as(superAdmin, "get", "/api/v1/sms/settings");
      expect(settings.body).toMatchObject({
        globalEnabled: true,
        environmentEnabled: false,
        effectiveEnabled: false,
      });
      await app
        .get(
          await import("../src/sms/sms.service.js").then((m) => m.SmsService),
        )
        .dispatch({ payload: { smsMessageId: queued.id } } as never);
      expect(
        await prisma.smsMessage.findUniqueOrThrow({ where: { id: queued.id } }),
      ).toMatchObject({ status: "FAILED", lastError: "PROVIDER_DISABLED" });
    } finally {
      environment.AFROMESSAGE_ENABLED = true;
    }
  });

  // ---- History: filters and pagination -------------------------------------

  it("filters history by recipient, creation window, status and category, with pagination", async () => {
    const other = await prisma.user.create({
      data: {
        email: `other-${rand()}@sms-admin.test`,
        phone: "0912000001",
        firstName: "Yonas",
        lastName: "Tadesse",
      },
    });
    const early = new Date("2026-03-01T06:00:00Z");
    const late = new Date("2026-03-15T06:00:00Z");
    const tag = randomUUID();
    const mine = [
      await message({
        status: "ACCEPTED",
        recipientUserId: other.id,
        createdAt: early,
      }),
      await message({
        status: "FAILED",
        recipientUserId: other.id,
        createdAt: late,
      }),
      await message({
        status: "SKIPPED",
        recipientUserId: other.id,
        createdAt: late,
      }),
    ];
    await message({
      status: "ACCEPTED",
      recipientUserId: recipient.id,
      createdAt: late,
    });

    const byRecipient = await as(
      superAdmin,
      "get",
      "/api/v1/sms/messages",
    ).query({
      recipientUserId: other.id,
    });
    expect(byRecipient.status).toBe(200);
    expect(byRecipient.body.total).toBe(3);
    expect(
      byRecipient.body.items.every(
        (row: { recipientUserId: string }) => row.recipientUserId === other.id,
      ),
    ).toBe(true);

    const window = await as(superAdmin, "get", "/api/v1/sms/messages").query({
      recipientUserId: other.id,
      createdFrom: "2026-03-10T00:00:00Z",
      createdTo: "2026-03-20T00:00:00Z",
    });
    expect(window.body.total).toBe(2);

    const byStatus = await as(superAdmin, "get", "/api/v1/sms/messages").query({
      recipientUserId: other.id,
      status: "FAILED",
    });
    expect(byStatus.body.total).toBe(1);
    expect(byStatus.body.items[0].id).toBe(mine[1]!.id);

    const byCategory = await as(
      superAdmin,
      "get",
      "/api/v1/sms/messages",
    ).query({
      recipientUserId: other.id,
      category: "TASK_ASSIGNED",
    });
    expect(byCategory.body.total).toBe(0);

    const firstPage = await as(superAdmin, "get", "/api/v1/sms/messages").query(
      {
        recipientUserId: other.id,
        page: 1,
        pageSize: 2,
      },
    );
    const secondPage = await as(
      superAdmin,
      "get",
      "/api/v1/sms/messages",
    ).query({
      recipientUserId: other.id,
      page: 2,
      pageSize: 2,
    });
    expect(firstPage.body).toMatchObject({ total: 3, page: 1, pageSize: 2 });
    expect(firstPage.body.items).toHaveLength(2);
    expect(secondPage.body.items).toHaveLength(1);
    const seen = [...firstPage.body.items, ...secondPage.body.items].map(
      (row: { id: string }) => row.id,
    );
    expect(new Set(seen).size).toBe(3);
    expect(tag).toBeTruthy();
  });

  it("refuses a date range that ends before it starts", async () => {
    const response = await as(superAdmin, "get", "/api/v1/sms/messages").query({
      createdFrom: "2026-04-10T00:00:00Z",
      createdTo: "2026-04-01T00:00:00Z",
    });
    expect(response.status).toBe(400);
    expect(response.body.code).toBe("SMS_INVALID_DATE_RANGE");
  });

  it("masks phone numbers in the history", async () => {
    const response = await as(superAdmin, "get", "/api/v1/sms/messages").query({
      recipientUserId: recipient.id,
    });
    expect(response.body.items.length).toBeGreaterThan(0);
    const text = JSON.stringify(response.body);
    expect(text).not.toContain(PHONE_DIGITS);
    expect(text).toContain("******");
  });

  // ---- Detail --------------------------------------------------------------

  it("shows one message with sanitized delivery attempts, and masks the number", async () => {
    const row = await message({
      status: "FAILED",
      recipientUserId: recipient.id,
    });
    await prisma.smsDeliveryAttempt.create({
      data: {
        smsMessageId: row.id,
        attemptNumber: 1,
        outcome: "REJECTED",
        providerHttpStatus: 400,
        providerResponse: {
          acknowledge: "error",
          message: `Invalid number +251${PHONE_DIGITS}`,
          token: "leak-me",
        },
        error: "rejected by provider",
        finishedAt: new Date(),
      },
    });

    const response = await as(
      superAdmin,
      "get",
      `/api/v1/sms/messages/${row.id}`,
    );
    expect(response.status).toBe(200);
    expect(response.body).toMatchObject({
      id: row.id,
      status: "FAILED",
      recipientPhoneMasked: expect.stringContaining("******"),
      body: "LELA: admin test message",
    });
    expect(response.body.deliveryAttempts).toHaveLength(1);
    const attempt = response.body.deliveryAttempts[0];
    expect(attempt).toMatchObject({
      attemptNumber: 1,
      outcome: "REJECTED",
      providerHttpStatus: 400,
    });
    // Free-text provider fields are withheld, not masked. Only the acknowledgement and status tokens remain.
    expect(attempt.providerResponse).toEqual({
      acknowledge: "error",
      status: null,
    });
    expect(attempt.providerResponse).not.toHaveProperty("message");
    const text = JSON.stringify(response.body);
    expect(text).not.toContain("leak-me");
    expect(text).not.toContain(PHONE_DIGITS);
  });

  it("returns not-found for an unknown message", async () => {
    const response = await as(
      superAdmin,
      "get",
      `/api/v1/sms/messages/${randomUUID()}`,
    );
    expect(response.status).toBe(404);
    expect(response.body.code).toBe("SMS_MESSAGE_NOT_FOUND");
  });

  // ---- Recipient search ----------------------------------------------------

  it("finds recipients by name or id, returning no contact details, and only to settings readers", async () => {
    const byName = await as(superAdmin, "get", "/api/v1/sms/recipients").query({
      q: "Hanna",
    });
    expect(byName.status).toBe(200);
    expect(byName.body.items).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ id: recipient.id, name: "Hanna Bekele" }),
      ]),
    );
    const text = JSON.stringify(byName.body);
    expect(text).not.toContain(PHONE_DIGITS);
    expect(text).not.toContain("@");
    expect(text).not.toMatch(/phone|email/);

    const byId = await as(superAdmin, "get", "/api/v1/sms/recipients").query({
      q: recipient.id,
    });
    expect(byId.body.items.map((item: { id: string }) => item.id)).toEqual([
      recipient.id,
    ]);

    expect(
      (await as(admin, "get", "/api/v1/sms/recipients").query({ q: "Hanna" }))
        .status,
    ).toBe(403);
    expect(
      (await as(superAdmin, "get", "/api/v1/sms/recipients").query({ q: "H" }))
        .status,
    ).toBe(400);
  });

  // ---- Connection check ----------------------------------------------------

  it("checks the provider connection by reading the balance, and sends no SMS", async () => {
    const sendsBefore = provider.send.mock.calls.length;
    const response = await as(
      superAdmin,
      "post",
      "/api/v1/sms/test-connection",
    );
    expect(response.status).toBe(201);
    expect(response.body).toMatchObject({ ok: true, balance: "205.65" });
    expect(provider.send.mock.calls.length).toBe(sendsBefore);
  });
});
