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
const API_KEY = "integration-api-key-value-do-not-leak";
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
  for (;;) {
    const value = await read();
    if (done(value)) return value;
    if (Date.now() > deadline) {
      throw new Error(
        `condition not reached; last value: ${JSON.stringify(value)}`,
      );
    }
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
}

describe("centralized SMS (Phase 1)", () => {
  let db: IsolatedDatabase;
  let prisma: PrismaClient;
  let app: NestExpressApplication;
  let http: ReturnType<NestExpressApplication["getHttpServer"]>;
  let superAdmin: Principal;
  let admin: Principal;
  let plainUser: Principal;
  let sms: { enqueue: unknown; checkStatus: (id: string) => Promise<unknown> };

  const provider = {
    send: vi.fn(),
    getStatus: vi.fn(),
    getBalance: vi.fn(),
  };

  beforeAll(async () => {
    db = await createIsolatedDatabase();
    process.env.DATABASE_URL = db.url;
    process.env.NODE_ENV = "test";
    process.env.AUTH_ACCESS_TOKEN_SECRET ??=
      "sms-access-token-secret-at-least-32-chars";
    process.env.AUTH_REFRESH_TOKEN_SECRET ??=
      "sms-refresh-token-secret-at-least-32-chars";
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

    const [{ Test }, appModule, appSetup, hasherModule, smsTypes] =
      await Promise.all([
        import("@nestjs/testing"),
        import("../src/app.module.js"),
        import("../src/app.setup.js"),
        import("../src/auth/domain/password-hasher.js"),
        import("../src/sms/sms.types.js"),
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
    const { SmsService } = await import("../src/sms/sms.service.js");
    sms = app.get(SmsService);

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

    superAdmin = await login("super-admin@sms.test", "Super Admin");
    admin = await login("admin@sms.test", "Admin");
    plainUser = await login("plain@sms.test");

    // Every provider call succeeds by default; each test overrides what it needs.
    provider.send.mockImplementation(async () => ({
      kind: "ACCEPTED",
      providerMessageId: `provider-${rand()}`,
      httpStatus: 200,
      response: { acknowledge: "success", status: "Send in progress..." },
    }));
    provider.getStatus.mockImplementation(async () => ({
      kind: "OK",
      providerStatus: "DELIVRD",
      description: null,
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

  function as(principal: Principal, method: "get" | "post", path: string) {
    const req = request(http)[method](path).set("Cookie", principal.cookies);
    return method === "get"
      ? req
      : req.set("x-csrf-token", principal.csrfToken);
  }

  async function userWithPhone(
    phone: string | null,
    status: "ACTIVE" | "INACTIVE" = "ACTIVE",
  ) {
    return prisma.user.create({
      data: {
        email: `recipient-${rand()}@sms.test`,
        phone,
        status,
        deactivatedAt: status === "INACTIVE" ? new Date() : null,
      },
    });
  }

  async function enqueueTest(
    recipientUserId: string | null,
    phone: string | null | undefined,
    key: string,
  ) {
    const service = sms as unknown as {
      enqueue: (
        tx: unknown,
        input: Record<string, unknown>,
      ) => Promise<{ kind: string; id?: string; reason?: string }>;
    };
    return prisma.$transaction((tx) =>
      service.enqueue(tx, {
        category: "TEST",
        idempotencyKey: key,
        recipientUserId,
        recipientPhone: phone,
        template: "TEST_CONNECTION",
        sourceType: "integration_test",
        sourceId: key,
        actorKind: "SYSTEM",
      }),
    );
  }

  it("queues one SMS in the caller's transaction and delivers it through the outbox", async () => {
    const recipient = await userWithPhone("0912345678");
    const key = `test:${rand()}`;
    const result = await enqueueTest(recipient.id, recipient.phone, key);
    expect(result.kind).toBe("QUEUED");

    const delivered = await eventually(
      () => prisma.smsMessage.findUniqueOrThrow({ where: { id: result.id! } }),
      (row) => row.status === "ACCEPTED",
    );
    expect(delivered.providerMessageId).toMatch(/^provider-/);
    expect(delivered.recipientPhone).toBe("+251912345678");
    expect(provider.send).toHaveBeenCalledWith(
      expect.objectContaining({ to: "+251912345678", sender: "LELA" }),
    );

    const attempts = await prisma.smsDeliveryAttempt.findMany({
      where: { smsMessageId: result.id! },
    });
    expect(attempts).toHaveLength(1);
    expect(attempts[0]!.outcome).toBe("ACCEPTED");
    // Stored provider responses never hold the recipient's number or the key.
    expect(JSON.stringify(attempts[0]!.providerResponse)).not.toContain(
      "+251912345678",
    );
    expect(JSON.stringify(attempts[0]!.providerResponse)).not.toContain(
      API_KEY,
    );
  });

  it("does not queue a duplicate for the same idempotency key", async () => {
    const recipient = await userWithPhone("0911000111");
    const key = `test:${rand()}`;
    const first = await enqueueTest(recipient.id, recipient.phone, key);
    const second = await enqueueTest(recipient.id, recipient.phone, key);
    expect(first.kind).toBe("QUEUED");
    expect(second.kind).toBe("DUPLICATE");
    // Let the one queued message finish, so it cannot leak into a later test.
    await eventually(
      () => prisma.smsMessage.findUniqueOrThrow({ where: { id: first.id! } }),
      (row) => row.status === "ACCEPTED",
    );
    const rows = await prisma.smsMessage.count({
      where: { idempotencyKey: key },
    });
    expect(rows).toBe(1);
    const events = await prisma.outboxEvent.count({
      where: { name: "sms.message.requested", resourceId: first.id! },
    });
    expect(events).toBe(1);
  });

  it("skips an invalid or missing number without queuing it", async () => {
    const invalid = await userWithPhone("0112345678");
    const invalidResult = await enqueueTest(
      invalid.id,
      invalid.phone,
      `test:${rand()}`,
    );
    expect(invalidResult).toMatchObject({
      kind: "SKIPPED",
      reason: "INVALID_PHONE_NUMBER",
    });
    const skipped = await prisma.smsMessage.findUniqueOrThrow({
      where: { id: invalidResult.id! },
    });
    expect(skipped.status).toBe("SKIPPED");
    expect(skipped.recipientPhone).toBeNull();

    const missing = await userWithPhone(null);
    const missingResult = await enqueueTest(
      missing.id,
      missing.phone,
      `test:${rand()}`,
    );
    expect(missingResult).toMatchObject({
      kind: "SKIPPED",
      reason: "MISSING_PHONE_NUMBER",
    });

    const queued = await prisma.outboxDelivery.count({
      where: {
        consumerName: "sms",
        event: { resourceId: { in: [invalidResult.id!, missingResult.id!] } },
      },
    });
    expect(queued).toBe(0);
  });

  it("marks a timed-out send UNCERTAIN and never resends it", async () => {
    provider.send.mockImplementationOnce(async () => {
      throw new Error("network down");
    });
    const recipient = await userWithPhone("0922222222");
    const result = await enqueueTest(
      recipient.id,
      recipient.phone,
      `test:${rand()}`,
    );

    const row = await eventually(
      () => prisma.smsMessage.findUniqueOrThrow({ where: { id: result.id! } }),
      (current) => current.status === "UNCERTAIN",
    );
    expect(row.lastError).toBeTruthy();
    const callsAfterFailure = provider.send.mock.calls.length;
    await new Promise((resolve) => setTimeout(resolve, 4500));
    expect(provider.send.mock.calls.length).toBe(callsAfterFailure);
    const delivery = await prisma.outboxDelivery.findFirstOrThrow({
      where: { consumerName: "sms", event: { resourceId: result.id! } },
    });
    expect(delivery.status).toBe("SUCCEEDED");
  });

  it("marks a definite provider refusal FAILED", async () => {
    provider.send.mockImplementationOnce(async () => ({
      kind: "REJECTED",
      httpStatus: 400,
      error: "provider rejected the request (400)",
      response: { acknowledge: "error" },
    }));
    const recipient = await userWithPhone("0933333333");
    const result = await enqueueTest(
      recipient.id,
      recipient.phone,
      `test:${rand()}`,
    );
    const row = await eventually(
      () => prisma.smsMessage.findUniqueOrThrow({ where: { id: result.id! } }),
      (current) => current.status === "FAILED",
    );
    expect(row.attempts).toBe(1);
  });

  it("cancels, without sending, when the recipient is no longer active", async () => {
    const recipient = await userWithPhone("0944444444", "INACTIVE");
    const callsBefore = provider.send.mock.calls.length;
    const result = await enqueueTest(
      recipient.id,
      recipient.phone,
      `test:${rand()}`,
    );
    const row = await eventually(
      () => prisma.smsMessage.findUniqueOrThrow({ where: { id: result.id! } }),
      (current) => current.status === "CANCELLED",
    );
    expect(row.lastError).toBe("RECIPIENT_INACTIVE");
    expect(provider.send.mock.calls.length).toBe(callsBefore);
  });

  it("confirms a callback through a status check, and refuses a wrong token", async () => {
    const recipient = await userWithPhone("0955555555");
    const result = await enqueueTest(
      recipient.id,
      recipient.phone,
      `test:${rand()}`,
    );
    const accepted = await eventually(
      () => prisma.smsMessage.findUniqueOrThrow({ where: { id: result.id! } }),
      (current) => current.status === "ACCEPTED",
    );

    const refused = await request(http).get(
      `/api/v1/sms/callbacks/not-the-token?message_id=${accepted.providerMessageId}&status=DELIVRD`,
    );
    expect(refused.status).toBe(404);
    expect((refused.body as { code: string }).code).toBe(
      "SMS_CALLBACK_NOT_FOUND",
    );

    const accepted204 = await request(http).get(
      `/api/v1/sms/callbacks/${CALLBACK_TOKEN}?message_id=${accepted.providerMessageId}&status=DELIVRD`,
    );
    expect(accepted204.status).toBe(204);
    const confirmed = await eventually(
      () => prisma.smsMessage.findUniqueOrThrow({ where: { id: result.id! } }),
      (current) => current.providerStatus === "DELIVRD",
    );
    expect(confirmed.callbackStatus).toBe("DELIVRD");
    // The callback records the provider's status; the message itself stays ACCEPTED.
    expect(confirmed.status).toBe("ACCEPTED");

    const unknown = await request(http).get(
      `/api/v1/sms/callbacks/${CALLBACK_TOKEN}?message_id=does-not-exist&status=DELIVRD`,
    );
    expect(unknown.status).toBe(204);
  });

  it("limits the history to settings readers and masks phone numbers", async () => {
    const recipient = await userWithPhone("0966666666");
    const queued = await enqueueTest(
      recipient.id,
      recipient.phone,
      `test:${rand()}`,
    );
    await eventually(
      () => prisma.smsMessage.findUniqueOrThrow({ where: { id: queued.id! } }),
      (row) => row.status === "ACCEPTED",
    );

    const denied = await as(plainUser, "get", "/api/v1/sms/messages");
    expect(denied.status).toBe(403);
    const adminDenied = await as(admin, "get", "/api/v1/sms/messages");
    expect(adminDenied.status).toBe(403);
    // Admin holds no SMS settings grant, so it can neither read nor change SMS settings.
    const adminStatusDenied = await as(admin, "get", "/api/v1/sms/status");
    expect(adminStatusDenied.status).toBe(403);
    const adminTestDenied = await as(
      admin,
      "post",
      "/api/v1/sms/test-connection",
    );
    expect(adminTestDenied.status).toBe(403);

    const allowed = await as(
      superAdmin,
      "get",
      "/api/v1/sms/messages?pageSize=100",
    );
    expect(allowed.status).toBe(200);
    const text = JSON.stringify(allowed.body);
    expect(text).not.toContain(API_KEY);
    expect(text).not.toContain(CALLBACK_TOKEN);
    expect(text).not.toContain("+251966666666");
    expect(text).toContain("+251******666");
  });

  it("reports SMS status without exposing any setting value", async () => {
    const response = await as(superAdmin, "get", "/api/v1/sms/status");
    expect(response.status).toBe(200);
    expect(response.body).toMatchObject({
      enabled: true,
      apiKeyConfigured: true,
      senderConfigured: true,
      callbackConfigured: true,
    });
    expect(JSON.stringify(response.body)).not.toContain(API_KEY);
    expect(JSON.stringify(response.body)).not.toContain(CALLBACK_TOKEN);
  });

  it("checks the connection by reading the balance, sends no SMS, and records an audit row", async () => {
    const before = await prisma.smsMessage.count();
    const response = await as(
      superAdmin,
      "post",
      "/api/v1/sms/test-connection",
    );
    expect(response.status).toBe(201);
    expect(response.body).toMatchObject({ ok: true, balance: "205.65" });
    expect(await prisma.smsMessage.count()).toBe(before);
    const audit = await prisma.auditRecord.count({
      where: { action: "sms.provider.tested" },
    });
    expect(audit).toBeGreaterThanOrEqual(1);
  });

  it("resolves an uncertain send by cancelling it, and refuses a second resolution", async () => {
    provider.send.mockImplementationOnce(async () => {
      throw new Error("network down");
    });
    const recipient = await userWithPhone("0977777777");
    const result = await enqueueTest(
      recipient.id,
      recipient.phone,
      `test:${rand()}`,
    );
    await eventually(
      () => prisma.smsMessage.findUniqueOrThrow({ where: { id: result.id! } }),
      (current) => current.status === "UNCERTAIN",
    );

    const cancelled = await as(
      superAdmin,
      "post",
      `/api/v1/sms/messages/${result.id}/resolve`,
    ).send({
      decision: "CANCEL",
    });
    expect(cancelled.status).toBe(201);
    const row = await prisma.smsMessage.findUniqueOrThrow({
      where: { id: result.id! },
    });
    expect(row.status).toBe("CANCELLED");

    const again = await as(
      superAdmin,
      "post",
      `/api/v1/sms/messages/${result.id}/resolve`,
    ).send({
      decision: "REQUEUE",
    });
    expect(again.status).toBe(409);
    expect((again.body as { code: string }).code).toBe(
      "SMS_MESSAGE_NOT_RESOLVABLE",
    );
  });

  it("requeues an uncertain send only when an administrator asks, and then sends it", async () => {
    provider.send.mockImplementationOnce(async () => {
      throw new Error("network down");
    });
    const recipient = await userWithPhone("0988888888");
    const result = await enqueueTest(
      recipient.id,
      recipient.phone,
      `test:${rand()}`,
    );
    await eventually(
      () => prisma.smsMessage.findUniqueOrThrow({ where: { id: result.id! } }),
      (current) => current.status === "UNCERTAIN",
    );
    const sendsBefore = provider.send.mock.calls.length;

    const requeued = await as(
      superAdmin,
      "post",
      `/api/v1/sms/messages/${result.id}/resolve`,
    ).send({
      decision: "REQUEUE",
    });
    expect(requeued.status).toBe(201);
    await eventually(
      () => prisma.smsMessage.findUniqueOrThrow({ where: { id: result.id! } }),
      (current) => current.status === "ACCEPTED",
    );
    expect(provider.send.mock.calls.length).toBe(sendsBefore + 1);
    const audit = await prisma.auditRecord.count({
      where: { action: "sms.message.resolved", resourceId: result.id! },
    });
    expect(audit).toBe(1);
  });

  it("records and queues nothing while SMS is disabled", async () => {
    const { ENVIRONMENT } = await import("../src/config/environment.js");
    const environment = app.get<{ AFROMESSAGE_ENABLED: boolean }>(ENVIRONMENT);
    const recipient = await userWithPhone("0900000001");
    const key = `test:${rand()}`;
    environment.AFROMESSAGE_ENABLED = false;
    try {
      const result = await enqueueTest(recipient.id, recipient.phone, key);
      expect(result.kind).toBe("DISABLED");
    } finally {
      environment.AFROMESSAGE_ENABLED = true;
    }
    expect(
      await prisma.smsMessage.count({ where: { idempotencyKey: key } }),
    ).toBe(0);
  });

  it("recovers a message stuck in SENDING as UNCERTAIN, without resending it", async () => {
    const recipient = await userWithPhone("0900000002");
    const stuck = await prisma.smsMessage.create({
      data: {
        idempotencyKey: `test:${rand()}`,
        category: "TEST",
        recipientUserId: recipient.id,
        recipientPhone: "+251900000002",
        body: "LELA: stuck",
        templateKey: "test.connection",
        status: "SENDING",
        attempts: 1,
      },
    });
    // Backdate the last update past the five-minute timeout.
    await prisma.$executeRaw`UPDATE "sms_messages" SET "updated_at" = now() - interval '10 minutes' WHERE "id" = ${stuck.id}::uuid`;
    const recent = await prisma.smsMessage.create({
      data: {
        idempotencyKey: `test:${rand()}`,
        category: "TEST",
        recipientUserId: recipient.id,
        recipientPhone: "+251900000002",
        body: "LELA: recent",
        templateKey: "test.connection",
        status: "SENDING",
        attempts: 1,
      },
    });

    const sendsBefore = provider.send.mock.calls.length;
    const recovered = await (
      sms as unknown as { recoverStuckSending: () => Promise<number> }
    ).recoverStuckSending();
    expect(recovered).toBeGreaterThanOrEqual(1);

    const row = await prisma.smsMessage.findUniqueOrThrow({
      where: { id: stuck.id },
    });
    expect(row.status).toBe("UNCERTAIN");
    expect(row.lastError).toContain("stuck in SENDING");
    const attempt = await prisma.smsDeliveryAttempt.findFirstOrThrow({
      where: { smsMessageId: stuck.id },
    });
    expect(attempt.outcome).toBe("UNCERTAIN");

    // A message updated moments ago is still in progress, so it is left alone.
    const stillRecent = await prisma.smsMessage.findUniqueOrThrow({
      where: { id: recent.id },
    });
    expect(stillRecent.status).toBe("SENDING");

    // Nothing is resent, even after the relay has had time to run.
    await new Promise((resolve) => setTimeout(resolve, 2500));
    expect(provider.send.mock.calls.length).toBe(sendsBefore);
  });

  it("keeps a late worker result from overwriting a sweep or an administrator decision", async () => {
    const { SmsRepository } = await import("../src/sms/sms.repository.js");
    const repository = app.get(SmsRepository);
    const recipient = await userWithPhone("0900000003");
    const makeStuck = async (status: "SENDING" | "CANCELLED") => {
      const row = await prisma.smsMessage.create({
        data: {
          idempotencyKey: `test:${rand()}`,
          category: "TEST",
          recipientUserId: recipient.id,
          recipientPhone: "+251900000003",
          body: "LELA: race",
          templateKey: "test.connection",
          status,
          attempts: 1,
        },
      });
      await prisma.$executeRaw`UPDATE "sms_messages" SET "updated_at" = now() - interval '10 minutes' WHERE "id" = ${row.id}::uuid`;
      return row;
    };
    const late = {
      kind: "ACCEPTED" as const,
      providerMessageId: `late-${rand()}`,
      httpStatus: 200,
      response: {},
    };

    // The sweep moves the message to UNCERTAIN first; then the slow worker reports acceptance.
    const swept = await makeStuck("SENDING");
    await (
      sms as unknown as { recoverStuckSending: () => Promise<number> }
    ).recoverStuckSending();
    await repository.recordAttemptOutcome(swept.id, 1, late, new Date());
    const afterSweep = await prisma.smsMessage.findUniqueOrThrow({
      where: { id: swept.id },
    });
    expect(afterSweep.status).toBe("UNCERTAIN");
    expect(afterSweep.providerMessageId).toBe(late.providerMessageId);
    expect(
      await prisma.smsDeliveryAttempt.count({
        where: { smsMessageId: swept.id },
      }),
    ).toBe(1);

    // An administrator cancels a stuck message; the slow worker reports a refusal. Status stays CANCELLED.
    const cancelled = await makeStuck("CANCELLED");
    await repository.recordAttemptOutcome(
      cancelled.id,
      1,
      {
        kind: "REJECTED",
        httpStatus: 400,
        error: "provider rejected the request (400)",
        response: null,
      },
      new Date(),
    );
    expect(
      (
        await prisma.smsMessage.findUniqueOrThrow({
          where: { id: cancelled.id },
        })
      ).status,
    ).toBe("CANCELLED");

    // A message the sweep already moved is never dispatched or claimed again.
    const callsBefore = provider.send.mock.calls.length;
    await (
      sms as unknown as { dispatch: (event: unknown) => Promise<void> }
    ).dispatch({ payload: { smsMessageId: swept.id } });
    expect(await repository.claimForSend(swept.id)).toBeNull();
    expect(provider.send.mock.calls.length).toBe(callsBefore);
  });

  it("does not let a failing SMS provider undo the business change that queued it", async () => {
    provider.send.mockImplementationOnce(async () => {
      throw new Error("provider exploded");
    });
    const recipient = await userWithPhone("0999999999");
    const workspace = await prisma.$transaction(async (tx) => {
      const created = await tx.workspace.create({ data: { kind: "EVENT" } });
      const queued = await (
        sms as unknown as {
          enqueue: (
            t: unknown,
            i: Record<string, unknown>,
          ) => Promise<{ kind: string; id?: string }>;
        }
      ).enqueue(tx, {
        category: "TEST",
        idempotencyKey: `test:${rand()}`,
        recipientUserId: recipient.id,
        recipientPhone: recipient.phone,
        template: "TEST_CONNECTION",
        actorKind: "SYSTEM",
      });
      expect(queued.kind).toBe("QUEUED");
      return created;
    });
    // The provider throws for this message, so it must settle as UNCERTAIN before the test ends.
    const queuedRow = await prisma.smsMessage.findFirstOrThrow({
      where: { recipientUserId: recipient.id },
      orderBy: { createdAt: "desc" },
    });
    await eventually(
      () =>
        prisma.smsMessage.findUniqueOrThrow({ where: { id: queuedRow.id } }),
      (row) => row.status === "UNCERTAIN",
    );
    expect(
      await prisma.workspace.findUnique({ where: { id: workspace.id } }),
    ).not.toBeNull();
  });
});
