import { randomUUID } from "node:crypto";
/* eslint-disable @typescript-eslint/require-await -- provider test doubles return promises without awaiting anything */
import { PrismaPg } from "@prisma/adapter-pg";
import type { NestExpressApplication } from "@nestjs/platform-express";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

import { PrismaClient } from "../src/generated/prisma/client.js";
import { seedRbac } from "../src/rbac/seed-rbac.js";
import {
  createIsolatedDatabase,
  type IsolatedDatabase,
} from "./support/database.js";
import type { ReportsRepository } from "../src/reports/infrastructure/reports.repository.js";
import type { ReportsSmsService } from "../src/reports/reports-sms.service.js";
import type { SmsService } from "../src/sms/sms.service.js";

const DAY = 86_400_000;

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

describe("report SMS (Phase 4): submission notices", () => {
  let db: IsolatedDatabase;
  let prisma: PrismaClient;
  let app: NestExpressApplication;
  let repository: ReportsRepository;
  let reportsSms: ReportsSmsService;
  let smsService: SmsService;
  let phoneCounter = 0;
  let dayCounter = 0;

  const provider = { send: vi.fn(), getStatus: vi.fn(), getBalance: vi.fn() };

  beforeAll(async () => {
    db = await createIsolatedDatabase();
    process.env.DATABASE_URL = db.url;
    process.env.NODE_ENV = "test";
    process.env.AUTH_ACCESS_TOKEN_SECRET ??=
      "report-sms-access-token-secret-at-least-32";
    process.env.AUTH_REFRESH_TOKEN_SECRET ??=
      "report-sms-refresh-token-secret-at-least-32";
    process.env.AFROMESSAGE_ENABLED = "true";
    process.env.AFROMESSAGE_API_KEY = "report-sms-api-key-value";
    process.env.AFROMESSAGE_SENDER_ID = "LELA";
    process.env.AFROMESSAGE_CALLBACK_TOKEN =
      "report-sms-callback-token-0123456789abcdef";

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
      smsTypes,
      reportsRepoModule,
      reportsSmsModule,
      smsServiceModule,
    ] = await Promise.all([
      import("@nestjs/testing"),
      import("../src/app.module.js"),
      import("../src/sms/sms.types.js"),
      import("../src/reports/infrastructure/reports.repository.js"),
      import("../src/reports/reports-sms.service.js"),
      import("../src/sms/sms.service.js"),
    ]);

    const moduleRef = await Test.createTestingModule({
      imports: [appModule.AppModule],
    })
      .overrideProvider(smsTypes.SMS_PROVIDER)
      .useValue(provider)
      .compile();
    app = moduleRef.createNestApplication<NestExpressApplication>();
    await app.init();

    provider.send.mockImplementation(async () => ({
      kind: "ACCEPTED",
      providerMessageId: `provider-${rand()}`,
      httpStatus: 200,
      response: { acknowledge: "success", status: "Send in progress..." },
    }));

    repository = app.get(reportsRepoModule.ReportsRepository);
    reportsSms = app.get(reportsSmsModule.ReportsSmsService);
    smsService = app.get(smsServiceModule.SmsService);
  });

  afterAll(async () => {
    await app?.close();
    await prisma?.$disconnect();
    await db?.drop();
  });

  /** Ethiopian mobile numbers in the 09 format; each call returns a new one. */
  function nextPhone(): string {
    phoneCounter += 1;
    return `0910${String(100000 + phoneCounter).padStart(6, "0")}`;
  }

  /** A distinct, past calendar day per call. Daily reports need a unique period per author. */
  function nextPeriod(): Date {
    dayCounter += 1;
    return new Date(Date.UTC(2020, 0, 1) + dayCounter * DAY);
  }

  async function person(
    name: string,
    options: {
      phone?: string | null;
      role?: "Super Admin" | "Admin";
      status?: "ACTIVE" | "INACTIVE";
    } = {},
  ) {
    const user = await prisma.user.create({
      data: {
        email: `${name.toLowerCase()}-${rand()}@report-sms.test`,
        phone: options.phone === undefined ? nextPhone() : options.phone,
        firstName: name,
        lastName: "Test",
        status: options.status ?? "ACTIVE",
        deactivatedAt: options.status === "INACTIVE" ? new Date() : null,
      },
    });
    if (options.role) {
      const role = await prisma.role.findUniqueOrThrow({
        where: { name: options.role },
      });
      await prisma.userRoleAssignment.create({
        data: { userId: user.id, roleId: role.id },
      });
    }
    return user;
  }

  async function draft(authorId: string) {
    const day = nextPeriod();
    return prisma.report.create({
      data: {
        type: "DAILY",
        title: `Daily ${rand()}`,
        periodStart: day,
        periodEnd: day,
        authorId,
        status: "DRAFT",
      },
    });
  }

  async function currentUpdatedAt(id: string): Promise<Date> {
    return (
      await prisma.report.findUniqueOrThrow({
        where: { id },
        select: { updatedAt: true },
      })
    ).updatedAt;
  }

  /** Creates a draft and submits it. Returns the report id. */
  async function submit(
    authorId: string,
    designatedRecipientId: string | null,
  ): Promise<string> {
    const report = await draft(authorId);
    await repository.submit(
      report.id,
      await currentUpdatedAt(report.id),
      authorId,
      randomUUID(),
      designatedRecipientId,
    );
    return report.id;
  }

  async function submissionRows(reportId: string) {
    return prisma.smsMessage.findMany({
      where: { sourceId: reportId, category: "REPORT_SUBMITTED" },
      orderBy: { createdAt: "asc" },
    });
  }

  /** A pending row written directly, so the relay does not send it first. */
  async function queuePending(input: {
    recipientUserId: string;
    reportId: string;
    sourceDueAt: Date;
  }) {
    return prisma.smsMessage.create({
      data: {
        idempotencyKey: `test.report.submitted:${randomUUID()}`,
        category: "REPORT_SUBMITTED",
        recipientUserId: input.recipientUserId,
        recipientPhone: "+251910100099",
        body: "LELA: test",
        templateKey: "report.submitted",
        sourceType: "report",
        sourceId: input.reportId,
        sourceDueAt: input.sourceDueAt,
        status: "PENDING",
      },
    });
  }

  /** Sends one queued message the way the relay would, without waiting for it. */
  async function dispatchMessage(smsMessageId: string): Promise<void> {
    await smsService.dispatch({
      payload: { smsMessageId },
    } as unknown as Parameters<SmsService["dispatch"]>[0]);
  }

  /** Puts a submitted report back to draft, as a changes-requested resubmission does. */
  async function backToDraft(id: string): Promise<void> {
    await prisma.report.update({
      where: { id },
      data: {
        status: "DRAFT",
        submittedAt: null,
        reviewedAt: null,
        reviewerId: null,
        reportToId: null,
      },
    });
  }

  it("notifies both an active Super Admin and an active Admin", async () => {
    const author = await person("Hana");
    const superAdmin = await person("Yared", { role: "Super Admin" });
    const admin = await person("Mekdes", { role: "Admin" });
    const reportId = await submit(author.id, null);
    const rows = await submissionRows(reportId);
    const recipients = rows.map((row) => row.recipientUserId);
    expect(recipients).toEqual(
      expect.arrayContaining([superAdmin.id, admin.id]),
    );
    expect(
      rows.find((row) => row.recipientUserId === admin.id)?.body,
    ).toContain("submitted by Hana Test");
  });

  it("notifies the designated recipient as well, and sends it only once when they are also a reviewer", async () => {
    const author = await person("Tsion");
    const designatedAdmin = await person("Abel", { role: "Admin" });
    const designatedOther = await person("Selam");
    const reportId = await submit(author.id, designatedAdmin.id);
    const rows = await submissionRows(reportId);
    expect(
      rows.filter((row) => row.recipientUserId === designatedAdmin.id),
    ).toHaveLength(1);
    const otherReportId = await submit(author.id, designatedOther.id);
    expect(
      (await submissionRows(otherReportId)).map((row) => row.recipientUserId),
    ).toContain(designatedOther.id);
  });

  it("excludes inactive reviewers and reviewers without a valid number", async () => {
    const author = await person("Girma");
    const inactive = await person("Kidus", {
      role: "Admin",
      status: "INACTIVE",
    });
    const badNumber = await person("Liya", { role: "Admin", phone: "123" });
    const noNumber = await person("Dawit", { role: "Admin", phone: null });
    const valid = await person("Ruth", { role: "Admin" });
    const reportId = await submit(author.id, null);
    const recipients = (await submissionRows(reportId)).map(
      (row) => row.recipientUserId,
    );
    expect(recipients).toContain(valid.id);
    expect(recipients).not.toContain(inactive.id);
    expect(recipients).not.toContain(badNumber.id);
    expect(recipients).not.toContain(noNumber.id);
  });

  it("does not notify the author, even when the author is a Super Admin", async () => {
    const author = await person("Eyob", { role: "Super Admin" });
    const otherAdmin = await person("Hiwot", { role: "Admin" });
    const reportId = await submit(author.id, null);
    const recipients = (await submissionRows(reportId)).map(
      (row) => row.recipientUserId,
    );
    expect(recipients).not.toContain(author.id);
    expect(recipients).toContain(otherAdmin.id);
  });

  it("notifies reviewers of a legacy report that has no designated recipient", async () => {
    const author = await person("Samson");
    const admin = await person("Meron", { role: "Admin" });
    const reportId = await submit(author.id, null);
    const rows = await submissionRows(reportId);
    expect(rows.map((row) => row.recipientUserId)).toContain(admin.id);
    expect(rows.every((row) => row.status !== "SKIPPED")).toBe(true);
  });

  it("queues each submission notice once, however often the same submission is queued", async () => {
    const author = await person("Nahom");
    const admin = await person("Sara", { role: "Admin" });
    const reportId = await submit(author.id, null);
    const report = await prisma.report.findUniqueOrThrow({
      where: { id: reportId },
    });
    const queueAgain = () =>
      prisma.$transaction((tx) =>
        reportsSms.enqueueSubmitted(tx, {
          reportId,
          designatedRecipientId: null,
          actorUserId: author.id,
          submittedAt: report.submittedAt,
          requestId: randomUUID(),
        }),
      );
    await queueAgain();
    await queueAgain();
    const forAdmin = (await submissionRows(reportId)).filter(
      (row) => row.recipientUserId === admin.id,
    );
    expect(forAdmin).toHaveLength(1);
  });

  it("cancels a notice from an earlier submission when the report has been resubmitted", async () => {
    const author = await person("Robel");
    const admin = await person("Hanan", { role: "Admin" });
    const reportId = await submit(author.id, null);
    const firstSubmission = (
      await prisma.report.findUniqueOrThrow({ where: { id: reportId } })
    ).submittedAt!;
    // Written directly, so the relay does not send the first notice before the resubmission.
    const stale = await queuePending({
      recipientUserId: admin.id,
      reportId,
      sourceDueAt: firstSubmission,
    });
    await backToDraft(reportId);
    await repository.submit(
      reportId,
      await currentUpdatedAt(reportId),
      author.id,
      randomUUID(),
      null,
    );
    await dispatchMessage(stale.id);
    expect(
      await prisma.smsMessage.findUniqueOrThrow({ where: { id: stale.id } }),
    ).toMatchObject({
      status: "CANCELLED",
      lastError: "SUBMISSION_SUPERSEDED",
    });
  });

  it("cancels a queued notice when the recipient no longer holds a reviewer role", async () => {
    const author = await person("Yonatan");
    const admin = await person("Lemlem", { role: "Admin" });
    const reportId = await submit(author.id, null);
    const pending = await queuePending({
      recipientUserId: admin.id,
      reportId,
      sourceDueAt: (
        await prisma.report.findUniqueOrThrow({ where: { id: reportId } })
      ).submittedAt!,
    });
    await prisma.userRoleAssignment.delete({ where: { userId: admin.id } });
    await dispatchMessage(pending.id);
    expect(
      await prisma.smsMessage.findUniqueOrThrow({ where: { id: pending.id } }),
    ).toMatchObject({
      status: "CANCELLED",
      lastError: "RECIPIENT_NOT_ELIGIBLE",
    });
  });

  it("submits the report, and still notifies in-app, when a notice cannot be queued", async () => {
    const author = await person("Meseret");
    const designated = await person("Tewodros");
    const draftReport = await draft(author.id);
    const spy = vi
      .spyOn(smsService, "enqueue")
      .mockRejectedValueOnce(new Error("simulated report failure"));
    const submitted = await repository.submit(
      draftReport.id,
      await currentUpdatedAt(draftReport.id),
      author.id,
      randomUUID(),
      designated.id,
    );
    spy.mockRestore();

    expect(submitted).toMatchObject({ status: "SUBMITTED" });
    const failures = await prisma.auditRecord.findMany({
      where: { action: "sms.enqueue_failed", resourceId: draftReport.id },
    });
    expect(failures).toHaveLength(1);
    expect(failures[0]!.metadata).toMatchObject({
      category: "REPORT_SUBMITTED",
    });
    const notification = await eventually(
      () =>
        prisma.notification.findFirst({
          where: { recipientUserId: designated.id, reportId: draftReport.id },
        }),
      (value) => value !== null,
    );
    expect(notification).not.toBeNull();
  });

  it("regression: a global Admin who is not the designated reviewer still receives the submission SMS at send time", async () => {
    const author = await person("Aster");
    const designated = await person("Bereket");
    const globalAdmin = await person("Chaltu", { role: "Admin" });
    const reportId = await submit(author.id, designated.id);
    const report = await prisma.report.findUniqueOrThrow({
      where: { id: reportId },
    });
    const pending = await queuePending({
      recipientUserId: globalAdmin.id,
      reportId,
      sourceDueAt: report.submittedAt!,
    });
    await dispatchMessage(pending.id);
    expect(
      await prisma.smsMessage.findUniqueOrThrow({ where: { id: pending.id } }),
    ).toMatchObject({ status: "ACCEPTED" });
  });

  it("revalidates the recipient's current number at send time", async () => {
    const author = await person("Dagim");
    const admin = await person("Eden", { role: "Admin" });
    const reportId = await submit(author.id, null);
    const sourceDueAt = (
      await prisma.report.findUniqueOrThrow({ where: { id: reportId } })
    ).submittedAt!;
    const invalidated = await queuePending({
      recipientUserId: admin.id,
      reportId,
      sourceDueAt,
    });
    await prisma.user.update({
      where: { id: admin.id },
      data: { phone: "123" },
    });
    await dispatchMessage(invalidated.id);
    expect(
      await prisma.smsMessage.findUniqueOrThrow({
        where: { id: invalidated.id },
      }),
    ).toMatchObject({ status: "SKIPPED", skipReason: "INVALID_PHONE_NUMBER" });

    const replaced = await queuePending({
      recipientUserId: admin.id,
      reportId,
      sourceDueAt,
    });
    const newNumber = nextPhone();
    await prisma.user.update({
      where: { id: admin.id },
      data: { phone: newNumber },
    });
    await dispatchMessage(replaced.id);
    const sent = await prisma.smsMessage.findUniqueOrThrow({
      where: { id: replaced.id },
    });
    expect(sent.status).toBe("ACCEPTED");
    expect(sent.recipientPhone).toBe("+251" + newNumber.slice(1));
  });

  it("cancels a queued notice when the recipient has been deactivated since", async () => {
    const author = await person("Fikru");
    const admin = await person("Genet", { role: "Admin" });
    const reportId = await submit(author.id, null);
    const sourceDueAt = (
      await prisma.report.findUniqueOrThrow({ where: { id: reportId } })
    ).submittedAt!;
    const pending = await queuePending({
      recipientUserId: admin.id,
      reportId,
      sourceDueAt,
    });
    await prisma.user.update({
      where: { id: admin.id },
      data: { status: "INACTIVE", deactivatedAt: new Date() },
    });
    await dispatchMessage(pending.id);
    expect(
      await prisma.smsMessage.findUniqueOrThrow({ where: { id: pending.id } }),
    ).toMatchObject({ status: "CANCELLED", lastError: "RECIPIENT_INACTIVE" });
  });
});
