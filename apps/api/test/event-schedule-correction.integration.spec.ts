import { readFileSync } from "node:fs";

import { PrismaPg } from "@prisma/adapter-pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { PrismaClient } from "../src/generated/prisma/client.js";
import {
  createIsolatedDatabase,
  type IsolatedDatabase,
} from "./support/database.js";

/**
 * The migration's own correction statement, read from the migration file so the
 * test exercises exactly what will run in production, not a copy of it.
 */
const MIGRATION = new URL(
  "../prisma/migrations/20261106120000_event_schedule_timezone_correction/migration.sql",
  import.meta.url,
);

function correctionStatement(): string {
  const sql = readFileSync(MIGRATION, "utf8");
  const start = sql.indexOf('UPDATE "events"');
  if (start < 0) throw new Error("correction statement not found in migration");
  return sql.slice(start);
}

describe("event schedule timezone correction", () => {
  let db: IsolatedDatabase;
  let prisma: PrismaClient;

  beforeAll(async () => {
    db = await createIsolatedDatabase();
    prisma = new PrismaClient({
      adapter: new PrismaPg(
        { connectionString: db.url },
        { schema: db.schema },
      ),
    });
  });

  afterAll(async () => {
    await prisma?.$disconnect();
    await db?.drop();
  });

  async function event(
    name: string,
    schedule: { start?: string; end?: string; reminder?: string },
    version: number,
  ) {
    const workspace = await prisma.workspace.create({
      data: { kind: "EVENT" },
    });
    return prisma.event.create({
      data: {
        workspaceId: workspace.id,
        name,
        eventType: "OTHER",
        startAt: schedule.start ? new Date(schedule.start) : null,
        endAt: schedule.end ? new Date(schedule.end) : null,
        reminderAt: schedule.reminder ? new Date(schedule.reminder) : null,
        scheduleTzVersion: version,
      },
    });
  }

  it("stores a new event as corrected, so its times are not shifted", async () => {
    const created = await event(
      "Created after the fix",
      { start: "2026-12-01T09:00:00.000Z" },
      2,
    );
    expect(created.scheduleTzVersion).toBe(2);
    expect(created.startAt?.toISOString()).toBe("2026-12-01T09:00:00.000Z");
  });

  it("corrects legacy schedules by three hours, once, and leaves other fields alone", async () => {
    const legacy = await event(
      "Legacy schedule",
      {
        start: "2026-10-24T17:00:00.000Z",
        end: "2026-10-24T23:00:00.000Z",
        reminder: "2026-10-24T12:00:00.000Z",
      },
      1,
    );
    const before = await prisma.event.findUniqueOrThrow({
      where: { id: legacy.id },
    });

    const applied = await prisma.$executeRawUnsafe(correctionStatement());
    expect(applied).toBeGreaterThanOrEqual(1);

    const after = await prisma.event.findUniqueOrThrow({
      where: { id: legacy.id },
    });
    expect(after.startAt?.toISOString()).toBe("2026-10-24T14:00:00.000Z");
    expect(after.endAt?.toISOString()).toBe("2026-10-24T20:00:00.000Z");
    expect(after.reminderAt?.toISOString()).toBe("2026-10-24T09:00:00.000Z");
    expect(after.scheduleTzVersion).toBe(2);
    // Timestamps that describe the row, not the schedule, never move.
    expect(after.createdAt).toEqual(before.createdAt);
    expect(after.updatedAt).toEqual(before.updatedAt);

    // A second run finds no legacy rows and changes nothing.
    const again = await prisma.$executeRawUnsafe(correctionStatement());
    expect(again).toBe(0);
    const unchanged = await prisma.event.findUniqueOrThrow({
      where: { id: legacy.id },
    });
    expect(unchanged.startAt?.toISOString()).toBe("2026-10-24T14:00:00.000Z");
  });

  it("does not move a schedule that is already corrected", async () => {
    const corrected = await event(
      "Already corrected",
      { start: "2026-11-02T08:00:00.000Z" },
      2,
    );
    await prisma.$executeRawUnsafe(correctionStatement());
    const row = await prisma.event.findUniqueOrThrow({
      where: { id: corrected.id },
    });
    expect(row.startAt?.toISOString()).toBe("2026-11-02T08:00:00.000Z");
  });
});
