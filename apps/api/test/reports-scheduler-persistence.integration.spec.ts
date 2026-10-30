import { PrismaPg } from "@prisma/adapter-pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { PrismaClient, ReportStatus } from "../src/generated/prisma/client.js";
import { ReportsSchedulerRepository } from "../src/reports/infrastructure/reports-scheduler.repository.js";
import {
  createIsolatedDatabase,
  type IsolatedDatabase,
} from "./support/database.js";

/**
 * Verifies `ReportsSchedulerRepository`'s candidate query - in particular
 * the `periodEnd` (a `@db.Date` column) vs. UTC-midnight-boundary
 * comparison, the kind of off-by-one-day logic that can pass a mocked unit
 * test yet fail against the column's real stored representation - and
 * `ScheduledOccurrenceClaim` uniqueness, against a real isolated Postgres
 * schema.
 */
describe("reports scheduler persistence", () => {
  let db: IsolatedDatabase;
  let prisma: PrismaClient;
  let repository: ReportsSchedulerRepository;

  beforeAll(async () => {
    db = await createIsolatedDatabase();
    prisma = new PrismaClient({
      adapter: new PrismaPg(
        { connectionString: db.url },
        { schema: db.schema },
      ),
    });
    repository = new ReportsSchedulerRepository(prisma as never);
  });

  afterAll(async () => {
    await prisma?.$disconnect();
    await db?.drop();
  });

  let counter = 0;
  /** `reports_review_state` requires submitted_at/reviewed_at/reviewer_id to
   * accompany SUBMITTED/REVIEWED/CHANGES_REQUESTED - mirrored here so a
   * fixture at any status satisfies the same CHECK the real service does. */
  async function makeReport(input: {
    periodStart: string;
    periodEnd: string;
    status?: ReportStatus;
  }): Promise<string> {
    counter += 1;
    const status = input.status ?? ReportStatus.DRAFT;
    const author = await prisma.user.create({
      data: { email: `reporter-${counter}@example.test` },
    });
    const submittedAt =
      status === ReportStatus.DRAFT
        ? undefined
        : new Date("2026-01-01T00:00:00.000Z");
    const isReviewed =
      status === ReportStatus.REVIEWED ||
      status === ReportStatus.CHANGES_REQUESTED;
    const reviewedAt = isReviewed
      ? new Date("2026-01-02T00:00:00.000Z")
      : undefined;
    const reviewer = isReviewed
      ? await prisma.user.create({
          data: { email: `reviewer-${counter}@example.test` },
        })
      : null;
    const report = await prisma.report.create({
      data: {
        type: "DAILY",
        title: `Report ${counter}`,
        periodStart: new Date(`${input.periodStart}T00:00:00.000Z`),
        periodEnd: new Date(`${input.periodEnd}T00:00:00.000Z`),
        authorId: author.id,
        status,
        ...(submittedAt ? { submittedAt } : {}),
        ...(reviewedAt ? { reviewedAt } : {}),
        ...(reviewer ? { reviewerId: reviewer.id } : {}),
      },
    });
    return report.id;
  }

  describe("findReminderCandidates", () => {
    it("includes a DRAFT report once the day after periodEnd has started in UTC", async () => {
      const asOf = new Date("2026-03-03T00:00:01.000Z");
      const reportId = await makeReport({
        periodStart: "2026-03-02",
        periodEnd: "2026-03-02",
      });

      const ids = (await repository.findReminderCandidates(asOf)).map(
        (c) => c.id,
      );
      expect(ids).toContain(reportId);
    });

    it("excludes a report on the exact UTC midnight boundary of its own periodEnd", async () => {
      // "the period has fully elapsed" means asOf's own day must be strictly
      // after periodEnd's day - asOf at periodEnd's own midnight does not count.
      const asOf = new Date("2026-03-04T00:00:00.000Z");
      const reportId = await makeReport({
        periodStart: "2026-03-04",
        periodEnd: "2026-03-04",
      });

      const ids = (await repository.findReminderCandidates(asOf)).map(
        (c) => c.id,
      );
      expect(ids).not.toContain(reportId);
    });

    it("includes a CHANGES_REQUESTED report but excludes SUBMITTED/REVIEWED and a too-recent periodEnd", async () => {
      const asOf = new Date("2026-03-10T12:00:00.000Z");
      const changesRequested = await makeReport({
        periodStart: "2026-03-05",
        periodEnd: "2026-03-05",
        status: ReportStatus.CHANGES_REQUESTED,
      });
      const submitted = await makeReport({
        periodStart: "2026-03-05",
        periodEnd: "2026-03-05",
        status: ReportStatus.SUBMITTED,
      });
      const reviewed = await makeReport({
        periodStart: "2026-03-05",
        periodEnd: "2026-03-05",
        status: ReportStatus.REVIEWED,
      });
      const tooRecent = await makeReport({
        periodStart: "2026-03-10",
        periodEnd: "2026-03-10",
      });

      const ids = (await repository.findReminderCandidates(asOf)).map(
        (c) => c.id,
      );
      expect(ids).toContain(changesRequested);
      expect(ids).not.toContain(submitted);
      expect(ids).not.toContain(reviewed);
      expect(ids).not.toContain(tooRecent);
    });
  });

  describe("tryClaim", () => {
    it("claims once, then reports the exact same occurrence as already claimed", async () => {
      const periodEnd = new Date("2026-03-15T00:00:00.000Z");
      const reportId = await makeReport({
        periodStart: "2026-03-15",
        periodEnd: "2026-03-15",
      });

      const first = await prisma.$transaction((tx) =>
        repository.tryClaim(tx as never, { id: reportId, periodEnd }),
      );
      expect(first).toBe(true);

      const second = await prisma.$transaction((tx) =>
        repository.tryClaim(tx as never, { id: reportId, periodEnd }),
      );
      expect(second).toBe(false);

      expect(
        await prisma.scheduledOccurrenceClaim.count({
          where: { resourceId: reportId, ruleName: "report.reminder" },
        }),
      ).toBe(1);
    });
  });
});
