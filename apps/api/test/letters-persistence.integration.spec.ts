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
 * Proves the one piece of this feature with no prior precedent: a letter
 * attachment also creates a linked `Document` row pointing at the same
 * `ManagedFile` - the file is never duplicated, and the dual-link survives
 * real transactional commit against Postgres.
 */
describe("letter attachments and their linked documents", () => {
  let db: IsolatedDatabase;
  let prisma: PrismaClient;
  let repository: LettersRepository;
  let actorId: string;
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
    repository = new LettersRepository(prisma as never, audit);
    const actor = await prisma.user.create({
      data: { email: "actor@letters-persistence.test" },
    });
    actorId = actor.id;
    const created = await repository.create(
      "LELA",
      2026,
      {
        direction: "INCOMING",
        category: "CAST",
        date: new Date("2026-01-01T00:00:00Z"),
        subject: "Subject",
        fromParty: "Sender",
      },
      actorId,
      REQUEST_ID,
    );
    letterId = created.id;
  });

  afterAll(async () => {
    await prisma?.$disconnect();
    await db?.drop();
  });

  async function createPendingFile(): Promise<string> {
    const file = await prisma.managedFile.create({
      data: {
        storageKey: `files/${crypto.randomUUID()}`,
        originalFilename: "contract.pdf",
        declaredMediaType: "application/pdf",
        declaredSizeBytes: 1024,
        intentExpiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000),
        intentLetterId: letterId,
      },
    });
    return file.id;
  }

  it("creates both the letter attachment and its linked document in one transaction", async () => {
    const fileId = await createPendingFile();

    await prisma.$transaction(async (tx) => {
      const access = await repository.lockAttachmentAccess(tx, letterId);
      expect(access).toBe("visible");
      await repository.createAttachment(tx, {
        letterId,
        fileId,
        attachedById: actorId,
        originalFilename: "contract.pdf",
      });
    });

    const attachment = await prisma.letterAttachment.findUnique({
      where: { letterId_managedFileId: { letterId, managedFileId: fileId } },
    });
    expect(attachment).not.toBeNull();

    const document = await prisma.document.findUnique({
      where: { managedFileId: fileId },
    });
    expect(document).not.toBeNull();
    expect(document!.documentType).toBe("LETTER");
    expect(document!.sourceLetterId).toBe(letterId);
    expect(document!.displayName).toBe("Letter Attachment (contract.pdf)");
    expect(document!.uploadedById).toBe(actorId);

    const hasAttachment = await repository.hasAttachment(letterId, fileId);
    expect(hasAttachment).toBe(true);

    const { fileIds, total } = await repository.listAttachmentFileIds(
      letterId,
      1,
      20,
    );
    expect(total).toBe(1);
    expect(fileIds).toEqual([fileId]);
  });

  it("keeps the document independently accessible if the letter is later soft-deleted", async () => {
    const fileId = await createPendingFile();
    await prisma.$transaction(async (tx) => {
      await repository.createAttachment(tx, {
        letterId,
        fileId,
        attachedById: actorId,
        originalFilename: "invoice.pdf",
      });
    });

    await repository.softDelete(letterId, actorId, REQUEST_ID);

    // Soft delete is an UPDATE, not a row DELETE, so the FK's `onDelete:
    // SetNull` never fires - `sourceLetterId` stays exactly as it was. The
    // real guarantee is that the referenced letter itself becomes
    // unreachable through every ordinary query, which any "From letter"
    // resolution must independently re-check rather than trust this column.
    const document = await prisma.document.findUnique({
      where: { managedFileId: fileId },
    });
    expect(document).not.toBeNull();
    expect(document!.sourceLetterId).toBe(letterId);

    expect(await repository.findById(letterId)).toBeNull();
  });

  it("rejects locking attachment access for a letter that no longer exists", async () => {
    const result = await prisma.$transaction((tx) =>
      repository.lockAttachmentAccess(
        tx,
        "00000000-0000-0000-0000-000000000000",
      ),
    );
    expect(result).toBe("not_found");
  });
});
