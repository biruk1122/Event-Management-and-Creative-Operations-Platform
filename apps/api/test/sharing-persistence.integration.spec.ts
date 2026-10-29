import { PrismaPg } from "@prisma/adapter-pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { AuditWriterService } from "../src/audit/audit-writer.service.js";
import { AuditRepository } from "../src/audit/infrastructure/audit.repository.js";
import { PrismaClient } from "../src/generated/prisma/client.js";
import { LettersRepository } from "../src/letters/infrastructure/letters.repository.js";
import { OutboxWriterService } from "../src/outbox/outbox-writer.service.js";
import { OutboxRepository } from "../src/outbox/infrastructure/outbox.repository.js";
import { SharingRepository } from "../src/sharing/infrastructure/sharing.repository.js";
import {
  createIsolatedDatabase,
  type IsolatedDatabase,
} from "./support/database.js";

const REQUEST_ID = "req-1";

/**
 * Proves the real guarantee behind "exactly one active share per audience":
 * the partial unique indexes on `shares` (not application code) are what
 * reject a duplicate active grant, and a revoked share never blocks a new
 * one for the same audience.
 */
describe("share creation and revocation against real constraints", () => {
  let db: IsolatedDatabase;
  let prisma: PrismaClient;
  let letters: LettersRepository;
  let sharing: SharingRepository;
  let sharerId: string;
  let recipientId: string;
  let letterId: string;

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
    letters = new LettersRepository(prisma as never, audit);
    const outbox = new OutboxWriterService(
      prisma as never,
      new OutboxRepository(prisma as never),
    );
    sharing = new SharingRepository(prisma as never, audit, outbox);
    const sharer = await prisma.user.create({
      data: { email: "sharer@sharing-persistence.test" },
    });
    sharerId = sharer.id;
    const recipient = await prisma.user.create({
      data: { email: "recipient@sharing-persistence.test" },
    });
    recipientId = recipient.id;
    const letter = await letters.create(
      "LELA",
      2026,
      {
        direction: "INCOMING",
        category: "CAST",
        date: new Date("2026-01-01T00:00:00Z"),
        subject: "Subject",
        fromParty: "Sender",
      },
      sharerId,
      REQUEST_ID,
    );
    letterId = letter.id;
  });

  afterAll(async () => {
    await prisma?.$disconnect();
    await db?.drop();
  });

  it("rejects a second active direct share to the same recipient", async () => {
    const first = await sharing.createForLetter(
      letterId,
      { recipientId, allEmployees: false, scope: "VIEW" },
      sharerId,
      REQUEST_ID,
    );
    expect(first).not.toBe("duplicate");

    const second = await sharing.createForLetter(
      letterId,
      { recipientId, allEmployees: false, scope: "VIEW_AND_DOWNLOAD" },
      sharerId,
      REQUEST_ID,
    );
    expect(second).toBe("duplicate");
  });

  it("allows a new share for the same recipient once the first is revoked", async () => {
    const active = await sharing.findActiveForLetterAndUser(
      letterId,
      recipientId,
    );
    expect(active).not.toBeNull();

    const revoked = await sharing.revoke(active!.id, sharerId, REQUEST_ID);
    expect(revoked).toBe("revoked");

    const again = await sharing.revoke(active!.id, sharerId, REQUEST_ID);
    expect(again).toBe("already_revoked");

    const recreated = await sharing.createForLetter(
      letterId,
      { recipientId, allEmployees: false, scope: "VIEW" },
      sharerId,
      REQUEST_ID,
    );
    expect(recreated).not.toBe("duplicate");
  });

  it("rejects a second active all-employees share independently of direct shares", async () => {
    const first = await sharing.createForLetter(
      letterId,
      { recipientId: null, allEmployees: true, scope: "VIEW" },
      sharerId,
      REQUEST_ID,
    );
    expect(first).not.toBe("duplicate");

    const second = await sharing.createForLetter(
      letterId,
      { recipientId: null, allEmployees: true, scope: "VIEW" },
      sharerId,
      REQUEST_ID,
    );
    expect(second).toBe("duplicate");
  });

  it("lists the letter as shared with the recipient via listSharedLetterIds", async () => {
    const ids = await sharing.listSharedLetterIds(recipientId);
    expect(ids).toContain(letterId);
  });
});
