import { PrismaPg } from "@prisma/adapter-pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { AuditWriterService } from "../src/audit/audit-writer.service.js";
import { AuditRepository } from "../src/audit/infrastructure/audit.repository.js";
import { DocumentsRepository } from "../src/documents/infrastructure/documents.repository.js";
import { PrismaClient } from "../src/generated/prisma/client.js";
import { LettersRepository } from "../src/letters/infrastructure/letters.repository.js";
import { OutboxWriterService } from "../src/outbox/outbox-writer.service.js";
import { OutboxRepository } from "../src/outbox/infrastructure/outbox.repository.js";
import { SharedRecordsService } from "../src/shared-records/shared-records.service.js";
import { SharingRepository } from "../src/sharing/infrastructure/sharing.repository.js";
import {
  createIsolatedDatabase,
  type IsolatedDatabase,
} from "./support/database.js";

const REQUEST_ID = "req-1";

/**
 * Proves the shared-with-me surface end to end against real Postgres: a
 * recipient sees exactly the records they have an active share for, sees
 * nothing once that share is revoked, and a 404 (not a silent empty
 * result) is what a stale/direct id lookup gets once access is gone.
 */
describe("shared-with-me surface against real data", () => {
  let db: IsolatedDatabase;
  let prisma: PrismaClient;
  let letters: LettersRepository;
  let documents: DocumentsRepository;
  let sharing: SharingRepository;
  let sharedRecords: SharedRecordsService;
  let sharerId: string;
  let recipientId: string;
  let outsiderId: string;
  let letterId: string;
  let documentId: string;

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
    documents = new DocumentsRepository(prisma as never, audit);
    const outbox = new OutboxWriterService(
      prisma as never,
      new OutboxRepository(prisma as never),
    );
    sharing = new SharingRepository(prisma as never, audit, outbox);
    sharedRecords = new SharedRecordsService(sharing, letters, documents);

    const sharer = await prisma.user.create({
      data: { email: "sharer@shared-records-persistence.test" },
    });
    sharerId = sharer.id;
    const recipient = await prisma.user.create({
      data: { email: "recipient@shared-records-persistence.test" },
    });
    recipientId = recipient.id;
    const outsider = await prisma.user.create({
      data: { email: "outsider@shared-records-persistence.test" },
    });
    outsiderId = outsider.id;

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
    const document = await documents.create(
      { displayName: "Vendor contract", documentType: "CONTRACT" },
      sharerId,
      REQUEST_ID,
    );
    documentId = document.id;
  });

  afterAll(async () => {
    await prisma?.$disconnect();
    await db?.drop();
  });

  it("is invisible to an outsider with no share", async () => {
    await expect(
      sharedRecords.listLetters(outsiderId, {
        sort: "date",
        order: "desc",
        page: 1,
        pageSize: 20,
      }),
    ).resolves.toMatchObject({ total: 0, items: [] });
    await expect(
      sharedRecords.getLetter(outsiderId, letterId),
    ).rejects.toMatchObject({ status: 404 });
  });

  it("becomes visible to the recipient once shared, with the right scope", async () => {
    await sharing.createForLetter(
      letterId,
      { recipientId, allEmployees: false, scope: "VIEW_AND_DOWNLOAD" },
      sharerId,
      REQUEST_ID,
    );
    await sharing.createForDocument(
      documentId,
      { recipientId, allEmployees: false, scope: "VIEW" },
      sharerId,
      REQUEST_ID,
    );

    const letterList = await sharedRecords.listLetters(recipientId, {
      sort: "date",
      order: "desc",
      page: 1,
      pageSize: 20,
    });
    expect(letterList.total).toBe(1);
    expect(letterList.items[0]!.id).toBe(letterId);

    const letterDetail = await sharedRecords.getLetter(recipientId, letterId);
    expect(letterDetail.shareScope).toBe("VIEW_AND_DOWNLOAD");

    const documentDetail = await sharedRecords.getDocument(
      recipientId,
      documentId,
    );
    expect(documentDetail.shareScope).toBe("VIEW");

    // Still invisible to an unrelated outsider.
    await expect(
      sharedRecords.getLetter(outsiderId, letterId),
    ).rejects.toMatchObject({ status: 404 });
  });

  it("disappears once the share is revoked", async () => {
    const active = await sharing.findActiveForLetterAndUser(
      letterId,
      recipientId,
    );
    await sharing.revoke(active!.id, sharerId, REQUEST_ID);

    await expect(
      sharedRecords.getLetter(recipientId, letterId),
    ).rejects.toMatchObject({ status: 404 });
    await expect(
      sharedRecords.listLetters(recipientId, {
        sort: "date",
        order: "desc",
        page: 1,
        pageSize: 20,
      }),
    ).resolves.toMatchObject({ total: 0 });
  });

  it("gates a document's file download by scope, not merely by sharing", async () => {
    const file = await prisma.managedFile.create({
      data: {
        storageKey: `files/${crypto.randomUUID()}`,
        originalFilename: "quotation.pdf",
        declaredMediaType: "application/pdf",
        declaredSizeBytes: 2048,
        intentExpiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000),
        intentDocumentId: documentId,
      },
    });
    await prisma.$transaction((tx) =>
      documents.setManagedFile(tx, documentId, file.id),
    );

    // All-employees share from an earlier test is VIEW_AND_DOWNLOAD -
    // revoke it first so this test controls the scope precisely.
    const existing = await sharing.findActiveForDocumentAndUser(
      documentId,
      recipientId,
    );
    if (existing) await sharing.revoke(existing.id, sharerId, REQUEST_ID);

    const viewOnly = await sharing.createForDocument(
      documentId,
      { recipientId, allEmployees: false, scope: "VIEW" },
      sharerId,
      REQUEST_ID,
    );
    await expect(
      sharedRecords.readSharedDocumentFileId(recipientId, documentId),
    ).resolves.toBeNull();

    if (viewOnly !== "duplicate") {
      await sharing.revoke(viewOnly.id, sharerId, REQUEST_ID);
    }
    await sharing.createForDocument(
      documentId,
      { recipientId, allEmployees: false, scope: "VIEW_AND_DOWNLOAD" },
      sharerId,
      REQUEST_ID,
    );
    await expect(
      sharedRecords.readSharedDocumentFileId(recipientId, documentId),
    ).resolves.toBe(file.id);
  });
});
