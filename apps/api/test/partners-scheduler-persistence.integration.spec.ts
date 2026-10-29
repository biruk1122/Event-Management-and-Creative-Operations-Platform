import { PrismaPg } from "@prisma/adapter-pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { PartnerStatus, PrismaClient } from "../src/generated/prisma/client.js";
import { PartnersSchedulerRepository } from "../src/partners/infrastructure/partners-scheduler.repository.js";
import {
  createIsolatedDatabase,
  type IsolatedDatabase,
} from "./support/database.js";

/**
 * Verifies `PartnersSchedulerRepository`'s candidate query - the terminal-
 * status exclusion list combined with a nullable `followUpAt` - and
 * `ScheduledOccurrenceClaim` uniqueness against a real isolated Postgres
 * schema.
 */
describe("partners scheduler persistence", () => {
  let db: IsolatedDatabase;
  let prisma: PrismaClient;
  let repository: PartnersSchedulerRepository;

  beforeAll(async () => {
    db = await createIsolatedDatabase();
    prisma = new PrismaClient({
      adapter: new PrismaPg(
        { connectionString: db.url },
        { schema: db.schema },
      ),
    });
    repository = new PartnersSchedulerRepository(prisma as never);
  });

  afterAll(async () => {
    await prisma?.$disconnect();
    await db?.drop();
  });

  let counter = 0;
  async function makePartner(input: {
    followUpAt: Date | null;
    status?: PartnerStatus;
  }): Promise<string> {
    counter += 1;
    const partner = await prisma.partner.create({
      data: {
        organizationName: `Partner ${counter}`,
        category: "Media",
        followUpAt: input.followUpAt,
        status: input.status ?? PartnerStatus.PROSPECTIVE,
      },
    });
    return partner.id;
  }

  describe("findReminderCandidates", () => {
    it("includes a nonterminal partner whose followUpAt has been reached", async () => {
      const now = new Date("2026-03-01T12:00:00.000Z");
      const past = new Date("2026-03-01T09:00:00.000Z");
      const partnerId = await makePartner({ followUpAt: past });

      const candidates = await repository.findReminderCandidates(now);
      expect(candidates.map((c) => c.id)).toContain(partnerId);
      const match = candidates.find((c) => c.id === partnerId);
      expect(match?.followUpAt.getTime()).toBe(past.getTime());
    });

    it("excludes a Declined or Completed partner, a future followUpAt, and a null followUpAt", async () => {
      const now = new Date("2026-03-02T12:00:00.000Z");
      const past = new Date("2026-03-02T09:00:00.000Z");
      const future = new Date("2026-03-02T18:00:00.000Z");

      const declined = await makePartner({
        followUpAt: past,
        status: PartnerStatus.DECLINED,
      });
      const completed = await makePartner({
        followUpAt: past,
        status: PartnerStatus.COMPLETED,
      });
      const notYetDue = await makePartner({ followUpAt: future });
      const noFollowUp = await makePartner({ followUpAt: null });

      const candidates = await repository.findReminderCandidates(now);
      const ids = candidates.map((c) => c.id);
      expect(ids).not.toContain(declined);
      expect(ids).not.toContain(completed);
      expect(ids).not.toContain(notYetDue);
      expect(ids).not.toContain(noFollowUp);
    });

    it("includes an In Discussion or Committed partner (not just Prospective)", async () => {
      const now = new Date("2026-03-05T12:00:00.000Z");
      const past = new Date("2026-03-05T09:00:00.000Z");
      const inDiscussion = await makePartner({
        followUpAt: past,
        status: PartnerStatus.IN_DISCUSSION,
      });
      const committed = await makePartner({
        followUpAt: past,
        status: PartnerStatus.COMMITTED,
      });

      const ids = (await repository.findReminderCandidates(now)).map(
        (c) => c.id,
      );
      expect(ids).toContain(inDiscussion);
      expect(ids).toContain(committed);
    });
  });

  describe("tryClaim", () => {
    it("claims once, then reports the exact same occurrence as already claimed", async () => {
      const followUpAt = new Date("2026-03-07T09:00:00.000Z");
      const partnerId = await makePartner({ followUpAt });

      const first = await prisma.$transaction((tx) =>
        repository.tryClaim(tx as never, { id: partnerId, followUpAt }),
      );
      expect(first).toBe(true);

      const second = await prisma.$transaction((tx) =>
        repository.tryClaim(tx as never, { id: partnerId, followUpAt }),
      );
      expect(second).toBe(false);

      expect(
        await prisma.scheduledOccurrenceClaim.count({
          where: { resourceId: partnerId, ruleName: "partner.follow_up_due" },
        }),
      ).toBe(1);
    });

    it("allows a distinct claim for the same partner at a different followUpAt (reschedule safety)", async () => {
      const partnerId = await makePartner({
        followUpAt: new Date("2026-03-09T09:00:00.000Z"),
      });

      const first = await prisma.$transaction((tx) =>
        repository.tryClaim(tx as never, {
          id: partnerId,
          followUpAt: new Date("2026-03-09T09:00:00.000Z"),
        }),
      );
      const second = await prisma.$transaction((tx) =>
        repository.tryClaim(tx as never, {
          id: partnerId,
          followUpAt: new Date("2026-03-09T18:00:00.000Z"),
        }),
      );

      expect(first).toBe(true);
      expect(second).toBe(true);
    });
  });
});
