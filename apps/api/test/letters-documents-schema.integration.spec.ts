import { execSync } from "node:child_process";
import { resolve } from "node:path";

import { afterAll, beforeAll, describe, expect, it } from "vitest";

import {
  createIsolatedDatabase,
  PG_ERROR,
  type IsolatedDatabase,
} from "./support/database.js";

describe("letters, documents, and sharing schema", () => {
  let db: IsolatedDatabase;
  let counter = 0;

  beforeAll(async () => {
    db = await createIsolatedDatabase();
  });
  afterAll(async () => {
    await db?.drop();
  });

  function unique(prefix: string): string {
    counter += 1;
    return `${prefix}-${counter}@letters.test`;
  }

  async function insertUser(email?: string): Promise<string> {
    const [row] = await db.query<{ id: string }>(
      "INSERT INTO users (email) VALUES ($1) RETURNING id",
      [email ?? unique("user")],
    );
    return row!.id;
  }

  async function insertWorkspace(): Promise<string> {
    const [row] = await db.query<{ id: string }>(
      `INSERT INTO workspaces (kind) VALUES ('PROJECT') RETURNING id`,
    );
    return row!.id;
  }

  async function insertProject(): Promise<string> {
    const [row] = await db.query<{ id: string }>(
      `INSERT INTO projects (workspace_id, name) VALUES ($1, $2) RETURNING id`,
      [await insertWorkspace(), "Project"],
    );
    return row!.id;
  }

  async function insertLetter(
    columns: Record<string, unknown> = {},
  ): Promise<string> {
    const base = {
      reference_number: `LELA-CAST-2026-${counter++}`,
      direction: "INCOMING",
      category: "CAST",
      date: "2026-01-01",
      subject: "Subject",
      from_party: "Sender Co.",
      ...columns,
    };
    const keys = Object.keys(base);
    const values = Object.values(base);
    const placeholders = keys.map((_, index) => `$${index + 1}`).join(", ");
    const [row] = await db.query<{ id: string }>(
      `INSERT INTO letters (${keys.join(", ")}) VALUES (${placeholders}) RETURNING id`,
      values,
    );
    return row!.id;
  }

  async function insertDocument(
    columns: Record<string, unknown> = {},
  ): Promise<string> {
    const base = {
      display_name: "Document",
      document_type: "OTHER",
      ...columns,
    };
    const keys = Object.keys(base);
    const values = Object.values(base);
    const placeholders = keys.map((_, index) => `$${index + 1}`).join(", ");
    const [row] = await db.query<{ id: string }>(
      `INSERT INTO documents (${keys.join(", ")}) VALUES (${placeholders}) RETURNING id`,
      values,
    );
    return row!.id;
  }

  async function insertShare(
    columns: Record<string, unknown>,
  ): Promise<string> {
    const keys = Object.keys(columns);
    const values = Object.values(columns);
    const placeholders = keys.map((_, index) => `$${index + 1}`).join(", ");
    const [row] = await db.query<{ id: string }>(
      `INSERT INTO shares (${keys.join(", ")}) VALUES (${placeholders}) RETURNING id`,
      values,
    );
    return row!.id;
  }

  it("applies all migrations to a clean PostgreSQL schema", () => {
    const output = execSync("pnpm exec prisma migrate status", {
      cwd: resolve(import.meta.dirname, ".."),
      env: { ...process.env, DATABASE_URL: db.url },
      encoding: "utf8",
    });
    expect(output).toContain("Database schema is up to date");
  });

  describe("letters", () => {
    it("stores a letter with the right defaults", async () => {
      const id = await insertLetter();
      const [row] = await db.query<{ to_party: string | null }>(
        "SELECT to_party FROM letters WHERE id = $1",
        [id],
      );
      expect(row!.to_party).toBeNull();
    });

    it("enforces a unique reference number", async () => {
      const referenceNumber = "LELA-CAST-2026-999";
      await insertLetter({ reference_number: referenceNumber });
      await expect(
        insertLetter({ reference_number: referenceNumber }),
      ).rejects.toMatchObject({ code: PG_ERROR.uniqueViolation });
    });

    it("rejects a blank reference number or subject", async () => {
      await expect(
        insertLetter({ reference_number: "   " }),
      ).rejects.toMatchObject({ code: PG_ERROR.checkViolation });
      await expect(insertLetter({ subject: "  " })).rejects.toMatchObject({
        code: PG_ERROR.checkViolation,
      });
    });

    it("pairs direction with exactly the matching party field", async () => {
      // Incoming without from_party.
      await expect(
        insertLetter({ direction: "INCOMING", from_party: null }),
      ).rejects.toMatchObject({ code: PG_ERROR.checkViolation });
      // Incoming with to_party also set.
      await expect(
        insertLetter({
          direction: "INCOMING",
          from_party: "Sender",
          to_party: "Recipient",
        }),
      ).rejects.toMatchObject({ code: PG_ERROR.checkViolation });
      // Outgoing without to_party.
      await expect(
        insertLetter({ direction: "OUTGOING", from_party: "Sender" }),
      ).rejects.toMatchObject({ code: PG_ERROR.checkViolation });
      // Valid outgoing.
      const id = await insertLetter({
        direction: "OUTGOING",
        from_party: null,
        to_party: "Recipient",
      });
      expect(id).toBeTruthy();
    });

    it("only allows a sender reference number on an incoming letter", async () => {
      await expect(
        insertLetter({
          direction: "OUTGOING",
          from_party: null,
          to_party: "Recipient",
          sender_reference_number: "X-1",
        }),
      ).rejects.toMatchObject({ code: PG_ERROR.checkViolation });
      const id = await insertLetter({ sender_reference_number: "X-1" });
      expect(id).toBeTruthy();
    });

    it("links to an existing project and clears the link if it is removed", async () => {
      const projectId = await insertProject();
      const id = await insertLetter({ project_id: projectId });
      await db.query("DELETE FROM projects WHERE id = $1", [projectId]);
      const [row] = await db.query<{ project_id: string | null }>(
        "SELECT project_id FROM letters WHERE id = $1",
        [id],
      );
      expect(row!.project_id).toBeNull();
    });
  });

  describe("letter reference counters", () => {
    it("tracks one sequence per category and year, atomically", async () => {
      const upsert = () =>
        db.query<{ last_sequence: number }>(
          `INSERT INTO letter_reference_counters (category, year, last_sequence)
           VALUES ('CAST', 2026, 1)
           ON CONFLICT (category, year)
           DO UPDATE SET last_sequence = letter_reference_counters.last_sequence + 1
           RETURNING last_sequence`,
        );
      const first = await upsert();
      const second = await upsert();
      const third = await upsert();
      expect([
        first[0]!.last_sequence,
        second[0]!.last_sequence,
        third[0]!.last_sequence,
      ]).toEqual([1, 2, 3]);
    });

    it("keeps categories and years independent", async () => {
      await db.query(
        `INSERT INTO letter_reference_counters (category, year, last_sequence) VALUES ('MKT', 2026, 1)`,
      );
      await db.query(
        `INSERT INTO letter_reference_counters (category, year, last_sequence) VALUES ('MKT', 2027, 1)`,
      );
      const rows = await db.query<{ year: number; last_sequence: number }>(
        `SELECT year, last_sequence FROM letter_reference_counters WHERE category = 'MKT' ORDER BY year`,
      );
      expect(rows).toEqual([
        { year: 2026, last_sequence: 1 },
        { year: 2027, last_sequence: 1 },
      ]);
    });

    it("rejects a duplicate (category, year) insert outside the upsert path", async () => {
      await db.query(
        `INSERT INTO letter_reference_counters (category, year, last_sequence) VALUES ('PROD', 2026, 1)`,
      );
      await expect(
        db.query(
          `INSERT INTO letter_reference_counters (category, year, last_sequence) VALUES ('PROD', 2026, 1)`,
        ),
      ).rejects.toMatchObject({ code: PG_ERROR.uniqueViolation });
    });
  });

  describe("letter attachments and remarks", () => {
    it("removes attachments and remarks when the letter is deleted", async () => {
      const letterId = await insertLetter();
      await db.query(
        "INSERT INTO letter_remarks (letter_id, body) VALUES ($1, 'A note')",
        [letterId],
      );
      await db.query("DELETE FROM letters WHERE id = $1", [letterId]);
      expect(
        await db.query("SELECT 1 FROM letter_remarks WHERE letter_id = $1", [
          letterId,
        ]),
      ).toHaveLength(0);
    });

    it("rejects a blank remark body", async () => {
      const letterId = await insertLetter();
      await expect(
        db.query(
          "INSERT INTO letter_remarks (letter_id, body) VALUES ($1, '   ')",
          [letterId],
        ),
      ).rejects.toMatchObject({ code: PG_ERROR.checkViolation });
    });
  });

  describe("documents", () => {
    it("allows multiple documents with no file yet (pending upload)", async () => {
      await insertDocument();
      await insertDocument();
      const rows = await db.query(
        "SELECT 1 FROM documents WHERE managed_file_id IS NULL",
      );
      expect(rows.length).toBeGreaterThanOrEqual(2);
    });

    it("rejects a blank display name", async () => {
      await expect(
        insertDocument({ display_name: "   " }),
      ).rejects.toMatchObject({ code: PG_ERROR.checkViolation });
    });

    it("keeps a document independently accessible after its source letter is deleted", async () => {
      const letterId = await insertLetter();
      const documentId = await insertDocument({ source_letter_id: letterId });
      await db.query("DELETE FROM letters WHERE id = $1", [letterId]);
      const [row] = await db.query<{ source_letter_id: string | null }>(
        "SELECT source_letter_id FROM documents WHERE id = $1",
        [documentId],
      );
      expect(row!.source_letter_id).toBeNull();
      expect(
        await db.query("SELECT 1 FROM documents WHERE id = $1", [documentId]),
      ).toHaveLength(1);
    });
  });

  describe("shares", () => {
    it("requires exactly one target", async () => {
      const letterId = await insertLetter();
      const documentId = await insertDocument();
      const recipientId = await insertUser();
      await expect(
        insertShare({ recipient_id: recipientId }),
      ).rejects.toMatchObject({ code: PG_ERROR.checkViolation });
      await expect(
        insertShare({
          letter_id: letterId,
          document_id: documentId,
          recipient_id: recipientId,
        }),
      ).rejects.toMatchObject({ code: PG_ERROR.checkViolation });
    });

    it("requires exactly one audience", async () => {
      const letterId = await insertLetter();
      const recipientId = await insertUser();
      await expect(insertShare({ letter_id: letterId })).rejects.toMatchObject({
        code: PG_ERROR.checkViolation,
      });
      await expect(
        insertShare({
          letter_id: letterId,
          recipient_id: recipientId,
          all_employees: true,
        }),
      ).rejects.toMatchObject({ code: PG_ERROR.checkViolation });
    });

    it("prevents a second active direct share for the same recipient and target", async () => {
      const letterId = await insertLetter();
      const recipientId = await insertUser();
      await insertShare({ letter_id: letterId, recipient_id: recipientId });
      await expect(
        insertShare({ letter_id: letterId, recipient_id: recipientId }),
      ).rejects.toMatchObject({ code: PG_ERROR.uniqueViolation });
    });

    it("allows a fresh share after the previous one is revoked", async () => {
      const letterId = await insertLetter();
      const recipientId = await insertUser();
      const shareId = await insertShare({
        letter_id: letterId,
        recipient_id: recipientId,
      });
      await db.query("UPDATE shares SET revoked_at = now() WHERE id = $1", [
        shareId,
      ]);
      const secondShareId = await insertShare({
        letter_id: letterId,
        recipient_id: recipientId,
      });
      expect(secondShareId).toBeTruthy();
    });

    it("prevents a second active all-employees share for the same target", async () => {
      const documentId = await insertDocument();
      await insertShare({ document_id: documentId, all_employees: true });
      await expect(
        insertShare({ document_id: documentId, all_employees: true }),
      ).rejects.toMatchObject({ code: PG_ERROR.uniqueViolation });
    });

    it("still allows a direct share alongside an active all-employees share for the same target", async () => {
      const documentId = await insertDocument();
      const recipientId = await insertUser();
      await insertShare({ document_id: documentId, all_employees: true });
      const id = await insertShare({
        document_id: documentId,
        recipient_id: recipientId,
      });
      expect(id).toBeTruthy();
    });

    it("requires a revocation timestamp whenever a revoking actor is recorded", async () => {
      const letterId = await insertLetter();
      const recipientId = await insertUser();
      const actorId = await insertUser();
      const shareId = await insertShare({
        letter_id: letterId,
        recipient_id: recipientId,
      });
      await expect(
        db.query("UPDATE shares SET revoked_by_id = $1 WHERE id = $2", [
          actorId,
          shareId,
        ]),
      ).rejects.toMatchObject({ code: PG_ERROR.checkViolation });
    });

    it("removes shares when the shared letter or document is deleted", async () => {
      const letterId = await insertLetter();
      const recipientId = await insertUser();
      await insertShare({ letter_id: letterId, recipient_id: recipientId });
      await db.query("DELETE FROM letters WHERE id = $1", [letterId]);
      expect(
        await db.query("SELECT 1 FROM shares WHERE letter_id = $1", [letterId]),
      ).toHaveLength(0);
    });

    it("blocks deleting a user who still has an active share as recipient", async () => {
      const letterId = await insertLetter();
      const recipientId = await insertUser();
      await insertShare({ letter_id: letterId, recipient_id: recipientId });
      await expect(
        db.query("DELETE FROM users WHERE id = $1", [recipientId]),
      ).rejects.toMatchObject({ code: PG_ERROR.restrictViolation });
    });
  });

  describe("managed file intent columns", () => {
    it("adds intent_letter_id and intent_document_id, each restricting delete of the referenced row", async () => {
      const letterId = await insertLetter();
      const [row] = await db.query<{ id: string }>(
        `INSERT INTO managed_files
           (storage_key, original_filename, declared_media_type, declared_size_bytes, intent_expires_at, intent_letter_id)
         VALUES ($1, 'file.pdf', 'application/pdf', 100, now() + interval '1 day', $2)
         RETURNING id`,
        [`files/${letterId}-test`, letterId],
      );
      expect(row!.id).toBeTruthy();
      await expect(
        db.query("DELETE FROM letters WHERE id = $1", [letterId]),
      ).rejects.toMatchObject({ code: PG_ERROR.restrictViolation });
    });
  });
});
