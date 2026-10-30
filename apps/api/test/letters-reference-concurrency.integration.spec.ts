import { PrismaPg } from "@prisma/adapter-pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { AuditWriterService } from "../src/audit/audit-writer.service.js";
import { AuditRepository } from "../src/audit/infrastructure/audit.repository.js";
import { PrismaClient } from "../src/generated/prisma/client.js";
import { LettersRepository } from "../src/letters/infrastructure/letters.repository.js";
import {
  createIsolatedDatabase,
  type IsolatedDatabase,
} from "./support/database.js";

const REQUEST_ID = "req-1";

/**
 * Proves the reference-number counter is safe under real concurrency: N
 * parallel `create()` calls for the same (category, year) must all succeed
 * with N distinct, sequential numbers - never a duplicate, never a silent
 * overwrite. This can only be verified against a real database; the
 * unit-test mock in `letters-service.spec.ts` cannot exercise Postgres's own
 * atomic `INSERT ... ON CONFLICT DO UPDATE` behavior under contention.
 */
describe("letter reference number concurrency", () => {
  let db: IsolatedDatabase;
  let prisma: PrismaClient;
  let repository: LettersRepository;
  let actorId: string;

  beforeAll(async () => {
    db = await createIsolatedDatabase();
    prisma = new PrismaClient({
      adapter: new PrismaPg(
        { connectionString: db.url },
        { schema: db.schema },
      ),
    });
    const audit = new AuditWriterService(
      prisma as never,
      new AuditRepository(),
    );
    repository = new LettersRepository(prisma as never, audit);
    const actor = await prisma.user.create({
      data: { email: "actor@letters.test" },
    });
    actorId = actor.id;
  });

  afterAll(async () => {
    await prisma?.$disconnect();
    await db?.drop();
  });

  const baseFields = {
    direction: "INCOMING" as const,
    date: new Date("2026-01-01T00:00:00Z"),
    subject: "Subject",
    fromParty: "Sender",
  };

  it("assigns N unique, sequential numbers under concurrent creation for one category/year", async () => {
    const CONCURRENCY = 20;
    const results = await Promise.all(
      Array.from({ length: CONCURRENCY }, () =>
        repository.create(
          "LELA",
          2026,
          { ...baseFields, category: "CAST" },
          actorId,
          REQUEST_ID,
        ),
      ),
    );
    const referenceNumbers = results.map((r) => r.referenceNumber);
    expect(new Set(referenceNumbers).size).toBe(CONCURRENCY);

    const sequences = referenceNumbers
      .map((ref) => Number(ref.split("-")[3]))
      .sort((a, b) => a - b);
    expect(sequences).toEqual(
      Array.from({ length: CONCURRENCY }, (_, index) => index + 1),
    );
    for (const ref of referenceNumbers) {
      expect(ref).toMatch(/^LELA-CAST-2026-\d{3}$/);
    }
  });

  it("keeps two categories' sequences independent even when created concurrently", async () => {
    const [castResults, mktResults] = await Promise.all([
      Promise.all(
        Array.from({ length: 5 }, () =>
          repository.create(
            "LELA",
            2027,
            { ...baseFields, category: "CAST" },
            actorId,
            REQUEST_ID,
          ),
        ),
      ),
      Promise.all(
        Array.from({ length: 5 }, () =>
          repository.create(
            "LELA",
            2027,
            { ...baseFields, category: "MKT" },
            actorId,
            REQUEST_ID,
          ),
        ),
      ),
    ]);
    const castSequences = castResults
      .map((r) => Number(r.referenceNumber.split("-")[3]))
      .sort((a, b) => a - b);
    const mktSequences = mktResults
      .map((r) => Number(r.referenceNumber.split("-")[3]))
      .sort((a, b) => a - b);
    expect(castSequences).toEqual([1, 2, 3, 4, 5]);
    expect(mktSequences).toEqual([1, 2, 3, 4, 5]);
  });

  it("never reserves a number via the non-reserving preview", async () => {
    const before = await repository.previewNextSequence("PROD", 2028);
    const beforeAgain = await repository.previewNextSequence("PROD", 2028);
    expect(before).toBe(beforeAgain);

    const created = await repository.create(
      "LELA",
      2028,
      { ...baseFields, category: "PROD" },
      actorId,
      REQUEST_ID,
    );
    expect(Number(created.referenceNumber.split("-")[3])).toBe(before);

    const after = await repository.previewNextSequence("PROD", 2028);
    expect(after).toBe(before + 1);
  });
});
