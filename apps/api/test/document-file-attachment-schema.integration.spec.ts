import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  createIsolatedDatabase,
  PG_ERROR,
  type IsolatedDatabase,
} from "./support/database.js";

describe("document and letter managed-file ownership", () => {
  let db: IsolatedDatabase;
  beforeAll(async () => {
    db = await createIsolatedDatabase();
  });
  afterAll(async () => {
    await db?.drop();
  });

  async function shell() {
    const [row] = await db.query<{ id: string }>(
      `INSERT INTO documents (display_name, document_type) VALUES ('Attachment regression', 'OTHER') RETURNING id`,
    );
    return row!.id;
  }

  async function availableDocument() {
    const documentId = await shell();
    const [row] = await db.query<{ managed_file_id: string }>(
      `
      WITH file AS (
        INSERT INTO managed_files (storage_key, original_filename, declared_media_type, declared_size_bytes, verified_media_type, verified_size_bytes, state, intent_expires_at, uploaded_at, available_at, intent_document_id)
        VALUES ($1, 'sample.pdf', 'application/pdf', 512, 'application/pdf', 512, 'AVAILABLE', now() + interval '1 day', now(), now(), $2)
        RETURNING id
      )
      UPDATE documents SET managed_file_id = (SELECT id FROM file) WHERE id = $2 RETURNING managed_file_id
    `,
      [`regression/${crypto.randomUUID()}`, documentId],
    );
    return { documentId, fileId: row!.managed_file_id };
  }

  async function availableLetter() {
    const [letter] = await db.query<{ id: string }>(
      `INSERT INTO letters (reference_number, direction, category, date, subject, from_party) VALUES ($1, 'INCOMING', 'OTHER', current_date, 'Attachment regression', 'Sender') RETURNING id`,
      [`LELA-OTHER-${crypto.randomUUID()}`],
    );
    const [file] = await db.query<{ managed_file_id: string }>(
      `
      WITH file AS (
        INSERT INTO managed_files (storage_key, original_filename, declared_media_type, declared_size_bytes, verified_media_type, verified_size_bytes, state, intent_expires_at, uploaded_at, available_at, intent_letter_id)
        VALUES ($1, 'sample.pdf', 'application/pdf', 512, 'application/pdf', 512, 'AVAILABLE', now() + interval '1 day', now(), now(), $2)
        RETURNING id
      )
      INSERT INTO letter_attachments (letter_id, managed_file_id) SELECT $2, id FROM file RETURNING managed_file_id
    `,
      [`regression/${crypto.randomUUID()}`, letter!.id],
    );
    return { letterId: letter!.id, fileId: file!.managed_file_id };
  }

  it("commits an available upload linked directly to its document", async () => {
    const { documentId, fileId } = await availableDocument();
    const [row] = await db.query<{ state: string }>(
      `SELECT f.state FROM documents d JOIN managed_files f ON f.id = d.managed_file_id WHERE d.id = $1 AND f.id = $2`,
      [documentId, fileId],
    );
    expect(row?.state).toBe("AVAILABLE");
  });

  it("commits an available upload linked only through a letter attachment", async () => {
    const { fileId } = await availableLetter();
    const [row] = await db.query<{ state: string }>(
      `SELECT state FROM managed_files WHERE id=$1`,
      [fileId],
    );
    expect(row?.state).toBe("AVAILABLE");
  });

  it("still rejects an available file with no concrete parent", async () => {
    await expect(
      db.query(
        `INSERT INTO managed_files (storage_key, original_filename, declared_media_type, declared_size_bytes, verified_media_type, verified_size_bytes, state, intent_expires_at, uploaded_at, available_at) VALUES ($1, 'sample.pdf', 'application/pdf', 512, 'application/pdf', 512, 'AVAILABLE', now() + interval '1 day', now(), now())`,
        [`regression/${crypto.randomUUID()}`],
      ),
    ).rejects.toMatchObject({
      code: PG_ERROR.checkViolation,
      constraint: "managed_files_available_require_attachment",
    });
  });

  it("rejects detaching or deleting the last document parent", async () => {
    const { documentId } = await availableDocument();
    await expect(
      db.query(`UPDATE documents SET managed_file_id=NULL WHERE id=$1`, [
        documentId,
      ]),
    ).rejects.toMatchObject({ code: PG_ERROR.checkViolation });
    // The pending upload's intent FK also restricts hard deletion, so clear
    // that independent FK before exercising the deferred ownership trigger.
    await db.query(
      `UPDATE managed_files SET intent_document_id=NULL WHERE intent_document_id=$1`,
      [documentId],
    );
    await expect(
      db.query(`DELETE FROM documents WHERE id=$1`, [documentId]),
    ).rejects.toMatchObject({ code: PG_ERROR.checkViolation });
  });

  it("checks the previous file when a document replaces its attachment", async () => {
    const { documentId } = await availableDocument();
    const [pending] = await db.query<{ id: string }>(
      `INSERT INTO managed_files (storage_key, original_filename, declared_media_type, declared_size_bytes, intent_expires_at) VALUES ($1,'new.pdf','application/pdf',512,now()+interval '1 day') RETURNING id`,
      [`regression/${crypto.randomUUID()}`],
    );
    await expect(
      db.query(`UPDATE documents SET managed_file_id=$2 WHERE id=$1`, [
        documentId,
        pending!.id,
      ]),
    ).rejects.toMatchObject({ code: PG_ERROR.checkViolation });
  });

  it("allows one shared parent to be removed but protects the last letter link", async () => {
    const { letterId, fileId } = await availableLetter();
    const documentId = await shell();
    await db.query(`UPDATE documents SET managed_file_id=$2 WHERE id=$1`, [
      documentId,
      fileId,
    ]);
    await db.query(`UPDATE documents SET managed_file_id=NULL WHERE id=$1`, [
      documentId,
    ]);
    await expect(
      db.query(`DELETE FROM letter_attachments WHERE letter_id=$1`, [letterId]),
    ).rejects.toMatchObject({ code: PG_ERROR.checkViolation });
  });

  it("allows atomic detachment when the file becomes unavailable", async () => {
    const { documentId, fileId } = await availableDocument();
    await db.query(
      `WITH detached AS (UPDATE documents SET managed_file_id=NULL WHERE id=$1) UPDATE managed_files SET state='UNAVAILABLE', unavailable_at=now(), cleanup_after=now()+interval '1 day' WHERE id=$2`,
      [documentId, fileId],
    );
    const [row] = await db.query<{ state: string }>(
      `SELECT state FROM managed_files WHERE id=$1`,
      [fileId],
    );
    expect(row?.state).toBe("UNAVAILABLE");
  });
});
