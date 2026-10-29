import { PrismaPg } from "@prisma/adapter-pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { AuditWriterService } from "../src/audit/audit-writer.service.js";
import { AuditRepository } from "../src/audit/infrastructure/audit.repository.js";
import { DocumentsRepository } from "../src/documents/infrastructure/documents.repository.js";
import { PrismaClient } from "../src/generated/prisma/client.js";
import {
  createIsolatedDatabase,
  type IsolatedDatabase,
} from "./support/database.js";

const REQUEST_ID = "req-1";

/**
 * Proves the one-file-only shape of a Document's attachment contract: a
 * fresh shell locks as available for attachment, attaching a file flips it
 * to already-attached, and a second finalize attempt is rejected as a
 * conflict rather than silently replacing the first file.
 */
describe("document attachment lifecycle (one file, direct FK)", () => {
  let db: IsolatedDatabase;
  let prisma: PrismaClient;
  let repository: DocumentsRepository;
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
    repository = new DocumentsRepository(prisma as never, audit);
    const actor = await prisma.user.create({
      data: { email: "actor@documents-persistence.test" },
    });
    actorId = actor.id;
  });

  afterAll(async () => {
    await prisma?.$disconnect();
    await db?.drop();
  });

  async function createPendingFile(documentId: string): Promise<string> {
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
    return file.id;
  }

  it("locks a fresh shell as available for attachment, then as already attached", async () => {
    const created = await repository.create(
      { displayName: "Quotation", documentType: "PRICE_QUOTATION" },
      actorId,
      REQUEST_ID,
    );
    const fileId = await createPendingFile(created.id);

    const before = await prisma.$transaction((tx) =>
      repository.lockAttachmentAccess(tx, created.id),
    );
    expect(before).toBe("available_for_attachment");

    await prisma.$transaction(async (tx) => {
      await repository.setManagedFile(tx, created.id, fileId);
    });

    const after = await prisma.$transaction((tx) =>
      repository.lockAttachmentAccess(tx, created.id),
    );
    expect(after).toBe("already_attached");

    expect(await repository.getManagedFileId(created.id)).toBe(fileId);

    const found = await repository.findById(created.id);
    expect(found!.managedFileId).toBe(fileId);
  });

  it("rejects locking attachment access for a document that no longer exists", async () => {
    const result = await prisma.$transaction((tx) =>
      repository.lockAttachmentAccess(
        tx,
        "00000000-0000-0000-0000-000000000000",
      ),
    );
    expect(result).toBe("not_found");
  });

  it("excludes a soft-deleted document from lockAttachmentAccess", async () => {
    const created = await repository.create(
      { displayName: "To be removed", documentType: "OTHER" },
      actorId,
      REQUEST_ID,
    );
    await repository.softDelete(created.id, actorId, REQUEST_ID);
    const result = await prisma.$transaction((tx) =>
      repository.lockAttachmentAccess(tx, created.id),
    );
    expect(result).toBe("not_found");
  });
});
