import { afterAll, beforeAll, describe, expect, it } from "vitest";

import {
  createIsolatedDatabase,
  PG_ERROR,
  type IsolatedDatabase,
} from "./support/database.js";

const MISSING_UUID = "00000000-0000-0000-0000-000000000000";
const TEN_MEBIBYTES = 10 * 1024 * 1024;

interface ManagedFileRow {
  id: string;
  storage_key: string;
  state: "PENDING" | "AVAILABLE" | "UNAVAILABLE";
  initiated_by_id: string | null;
  created_at: Date;
  updated_at: Date;
}

describe("secure file management schema", () => {
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
    return `${prefix}-${counter}`;
  }

  function futureDate(days = 1): string {
    return new Date(Date.now() + days * 24 * 60 * 60 * 1000).toISOString();
  }

  async function insertUser(): Promise<string> {
    const [row] = await db.query<{ id: string }>(
      `INSERT INTO users (email) VALUES ($1) RETURNING id`,
      [`${unique("file-user")}@example.test`],
    );
    return row!.id;
  }

  async function insertWorkspace(): Promise<string> {
    const [row] = await db.query<{ id: string }>(
      `INSERT INTO workspaces (kind) VALUES ('EVENT') RETURNING id`,
    );
    return row!.id;
  }

  async function insertManagedFile(
    columns: Record<string, unknown> = {},
  ): Promise<ManagedFileRow> {
    const base: Record<string, unknown> = {
      storage_key: `managed/${unique("object")}`,
      original_filename: "brief.pdf",
      declared_media_type: "application/pdf",
      declared_size_bytes: 512,
      intent_expires_at: futureDate(),
      ...columns,
    };
    const keys = Object.keys(base);
    const values = Object.values(base);
    const placeholders = keys.map((_, index) => `$${index + 1}`).join(", ");
    const [row] = await db.query<ManagedFileRow & Record<string, unknown>>(
      `INSERT INTO managed_files (${keys.join(", ")})
       VALUES (${placeholders})
       RETURNING *`,
      values,
    );
    return row!;
  }

  async function insertUnavailableFile(): Promise<ManagedFileRow> {
    const unavailableAt = futureDate();
    return insertManagedFile({
      state: "UNAVAILABLE",
      unavailable_at: unavailableAt,
      cleanup_after: futureDate(2),
    });
  }

  async function insertAvailableFileWithAttachment(): Promise<{
    managedFileId: string;
    workspaceId: string;
  }> {
    const workspaceId = await insertWorkspace();
    const uploadedAt = futureDate();
    const [row] = await db.query<{ id: string }>(
      `WITH managed_file AS (
         INSERT INTO managed_files (
           storage_key,
           original_filename,
           declared_media_type,
           declared_size_bytes,
           verified_media_type,
           verified_size_bytes,
           state,
           intent_expires_at,
           uploaded_at,
           available_at
         )
         VALUES ($1, 'brief.pdf', 'application/pdf', 512, 'application/pdf', 512,
                 'AVAILABLE', $2, $3, $3)
         RETURNING id
       ), attachment AS (
         INSERT INTO workspace_file_attachments (workspace_id, managed_file_id)
         SELECT $4, id FROM managed_file
       )
       SELECT id FROM managed_file`,
      [
        `managed/${unique("available-object")}`,
        futureDate(),
        uploadedAt,
        workspaceId,
      ],
    );
    return { managedFileId: row!.id, workspaceId };
  }

  it("creates a pending upload intent with UUID and UTC defaults", async () => {
    const row = await insertManagedFile();

    expect(row.id).toEqual(expect.any(String));
    expect(row.state).toBe("PENDING");
    expect(row.initiated_by_id).toBeNull();
    expect(row.created_at).toBeInstanceOf(Date);
    expect(row.updated_at).toBeInstanceOf(Date);
  });

  describe("managed file metadata and lifecycle invariants", () => {
    it("rejects duplicate opaque keys and invalid object metadata", async () => {
      const storageKey = `managed/${unique("duplicate")}`;
      await insertManagedFile({ storage_key: storageKey });

      await expect(
        insertManagedFile({ storage_key: storageKey }),
      ).rejects.toMatchObject({ code: PG_ERROR.uniqueViolation });
      await expect(
        insertManagedFile({ storage_key: "   " }),
      ).rejects.toMatchObject({ code: PG_ERROR.checkViolation });
      await expect(
        insertManagedFile({ original_filename: " " }),
      ).rejects.toMatchObject({ code: PG_ERROR.checkViolation });
      await expect(
        insertManagedFile({ declared_media_type: "" }),
      ).rejects.toMatchObject({ code: PG_ERROR.checkViolation });
      await expect(
        insertManagedFile({ declared_size_bytes: 0 }),
      ).rejects.toMatchObject({ code: PG_ERROR.checkViolation });
      await expect(
        insertManagedFile({ declared_size_bytes: TEN_MEBIBYTES + 1 }),
      ).rejects.toMatchObject({ code: PG_ERROR.checkViolation });
    });

    it("requires complete verified metadata and coherent lifecycle timestamps", async () => {
      await expect(
        insertManagedFile({ verified_media_type: "application/pdf" }),
      ).rejects.toMatchObject({ code: PG_ERROR.checkViolation });
      await expect(
        insertManagedFile({ verified_size_bytes: 512 }),
      ).rejects.toMatchObject({ code: PG_ERROR.checkViolation });
      await expect(
        insertManagedFile({ intent_expires_at: "2020-01-01T00:00:00.000Z" }),
      ).rejects.toMatchObject({ code: PG_ERROR.checkViolation });
      await expect(
        insertManagedFile({
          state: "UNAVAILABLE",
          unavailable_at: futureDate(),
        }),
      ).rejects.toMatchObject({ code: PG_ERROR.checkViolation });
      await expect(
        insertManagedFile({
          state: "UNAVAILABLE",
          unavailable_at: futureDate(2),
          cleanup_after: futureDate(),
        }),
      ).rejects.toMatchObject({ code: PG_ERROR.checkViolation });
    });

    it("rejects an unknown storage lifecycle state", async () => {
      await expect(
        insertManagedFile({ state: "DELETED" }),
      ).rejects.toMatchObject({ code: PG_ERROR.invalidTextRepresentation });
    });
  });

  describe("explicit authorized workspace attachment", () => {
    it("rejects links to pending or unavailable files", async () => {
      const workspaceId = await insertWorkspace();
      const pendingFile = await insertManagedFile();
      const unavailableFile = await insertUnavailableFile();

      await expect(
        db.query(
          `INSERT INTO workspace_file_attachments (workspace_id, managed_file_id)
           VALUES ($1, $2)`,
          [workspaceId, pendingFile.id],
        ),
      ).rejects.toMatchObject({ code: PG_ERROR.checkViolation });
      await expect(
        db.query(
          `INSERT INTO workspace_file_attachments (workspace_id, managed_file_id)
           VALUES ($1, $2)`,
          [workspaceId, unavailableFile.id],
        ),
      ).rejects.toMatchObject({ code: PG_ERROR.checkViolation });
    });

    it("requires an attachment when a file becomes available", async () => {
      await expect(
        insertManagedFile({
          state: "AVAILABLE",
          uploaded_at: futureDate(),
          available_at: futureDate(2),
          verified_media_type: "application/pdf",
          verified_size_bytes: 512,
        }),
      ).rejects.toMatchObject({ code: PG_ERROR.checkViolation });
    });

    it("requires upload evidence before an available file can be attached", async () => {
      const workspaceId = await insertWorkspace();

      await expect(
        db.query(
          `WITH managed_file AS (
             INSERT INTO managed_files (
               storage_key,
               original_filename,
               declared_media_type,
               declared_size_bytes,
               verified_media_type,
               verified_size_bytes,
               state,
               intent_expires_at,
               available_at
             )
             VALUES ($1, 'brief.pdf', 'application/pdf', 512,
                     'application/pdf', 512, 'AVAILABLE', $2, $3)
             RETURNING id
           )
           INSERT INTO workspace_file_attachments (workspace_id, managed_file_id)
           SELECT $4, id FROM managed_file`,
          [
            `managed/${unique("missing-upload")}`,
            futureDate(),
            futureDate(),
            workspaceId,
          ],
        ),
      ).rejects.toMatchObject({ code: PG_ERROR.checkViolation });
    });

    it("allows atomic finalization with an explicit attachment and prevents duplicates", async () => {
      const { managedFileId, workspaceId } =
        await insertAvailableFileWithAttachment();

      await expect(
        db.query(
          `INSERT INTO workspace_file_attachments (workspace_id, managed_file_id)
           VALUES ($1, $2)`,
          [workspaceId, managedFileId],
        ),
      ).rejects.toMatchObject({ code: PG_ERROR.uniqueViolation });
    });

    it("preserves an available file's authorization context until a lifecycle transaction updates it", async () => {
      const { managedFileId, workspaceId } =
        await insertAvailableFileWithAttachment();

      await expect(
        db.query(
          `DELETE FROM workspace_file_attachments
           WHERE workspace_id = $1 AND managed_file_id = $2`,
          [workspaceId, managedFileId],
        ),
      ).rejects.toMatchObject({ code: PG_ERROR.checkViolation });

      await expect(
        db.query(`DELETE FROM workspaces WHERE id = $1`, [workspaceId]),
      ).rejects.toMatchObject({ code: PG_ERROR.restrictViolation });
      await expect(
        db.query(`DELETE FROM managed_files WHERE id = $1`, [managedFileId]),
      ).rejects.toMatchObject({ code: PG_ERROR.restrictViolation });
    });

    it("enforces real parent and actor references and clears optional actor references", async () => {
      const { managedFileId } = await insertAvailableFileWithAttachment();

      await expect(
        db.query(
          `INSERT INTO workspace_file_attachments (workspace_id, managed_file_id)
           VALUES ($1, $2)`,
          [MISSING_UUID, managedFileId],
        ),
      ).rejects.toMatchObject({ code: PG_ERROR.foreignKeyViolation });
      await expect(
        insertManagedFile({ initiated_by_id: MISSING_UUID }),
      ).rejects.toMatchObject({ code: PG_ERROR.foreignKeyViolation });

      const actor = await insertUser();
      const attributedFile = await insertManagedFile({
        initiated_by_id: actor,
      });
      await db.query(`DELETE FROM users WHERE id = $1`, [actor]);
      const [row] = await db.query<{ initiated_by_id: string | null }>(
        `SELECT initiated_by_id FROM managed_files WHERE id = $1`,
        [attributedFile.id],
      );
      expect(row?.initiated_by_id).toBeNull();
    });
  });

  it("creates the lifecycle access indexes and applies every committed migration", async () => {
    const indexes = await db.query<{ indexname: string }>(
      `SELECT indexname
       FROM pg_indexes
       WHERE schemaname = current_schema()
         AND tablename IN ('managed_files', 'workspace_file_attachments')`,
    );
    expect(indexes.map(({ indexname }) => indexname)).toEqual(
      expect.arrayContaining([
        "managed_files_state_intent_expires_at_idx",
        "managed_files_state_cleanup_after_idx",
        "workspace_file_attachments_managed_file_id_idx",
      ]),
    );

    const [row] = await db.query<{ count: string }>(
      `SELECT count(*)::text AS count FROM "_prisma_migrations"
       WHERE finished_at IS NOT NULL AND rolled_back_at IS NULL`,
    );
    expect(Number(row!.count)).toBeGreaterThanOrEqual(10);
  });
});
