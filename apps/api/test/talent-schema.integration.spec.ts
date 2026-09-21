import { afterAll, beforeAll, describe, expect, it } from "vitest";

import {
  createIsolatedDatabase,
  PG_ERROR,
  type IsolatedDatabase,
} from "./support/database.js";

const MISSING_UUID = "00000000-0000-0000-0000-000000000000";

interface TalentRow {
  id: string;
  full_name: string;
  type: string;
  profile_image_id: string | null;
  email: string | null;
  phone: string | null;
  biography: string | null;
  availability: string;
  manager_id: string | null;
  created_at: Date;
  updated_at: Date;
}

describe("talent management schema", () => {
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
    return `${prefix} ${counter}`;
  }

  async function insertUser(): Promise<string> {
    const [row] = await db.query<{ id: string }>(
      `INSERT INTO users (email) VALUES ($1) RETURNING id`,
      [`talent-manager-${++counter}@example.test`],
    );
    return row!.id;
  }

  async function insertTalent(
    columns: Record<string, unknown> = {},
  ): Promise<TalentRow> {
    const base: Record<string, unknown> = {
      full_name: unique("Talent"),
      type: "ARTIST",
      ...columns,
    };
    const keys = Object.keys(base);
    const values = Object.values(base);
    const placeholders = keys.map((_, index) => `$${index + 1}`).join(", ");
    const [row] = await db.query<TalentRow & Record<string, unknown>>(
      `INSERT INTO talents (${keys.join(", ")})
       VALUES (${placeholders}) RETURNING *`,
      values,
    );
    return row!;
  }

  async function insertEvent(): Promise<string> {
    const [workspace] = await db.query<{ id: string }>(
      `INSERT INTO workspaces (kind) VALUES ('EVENT') RETURNING id`,
    );
    const [event] = await db.query<{ id: string }>(
      `INSERT INTO events (workspace_id, name, event_type)
       VALUES ($1, $2, 'CONCERT') RETURNING id`,
      [workspace!.id, unique("Talent event")],
    );
    return event!.id;
  }

  async function insertAvailableProfileImage(): Promise<{
    fileId: string;
    talentId: string;
  }> {
    const [row] = await db.query<{ file_id: string; talent_id: string }>(
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
         VALUES ($1, 'portrait.jpg', 'image/jpeg', 512, 'image/jpeg', 512,
                 'AVAILABLE', NOW() + INTERVAL '1 day', NOW(), NOW())
         RETURNING id
       ), talent AS (
         INSERT INTO talents (full_name, type, profile_image_id)
         SELECT $2, 'ARTIST', id FROM managed_file
         RETURNING id, profile_image_id
       )
       SELECT profile_image_id AS file_id, id AS talent_id FROM talent`,
      [`managed/talent/${unique("portrait")}`, unique("Portrait talent")],
    );
    return { fileId: row!.file_id, talentId: row!.talent_id };
  }

  it("creates a talent with UUID, UTC timestamps, and approved defaults", async () => {
    const row = await insertTalent();

    expect(row).toMatchObject({
      type: "ARTIST",
      availability: "AVAILABLE",
      profile_image_id: null,
      email: null,
      phone: null,
      biography: null,
      manager_id: null,
    });
    expect(row.id).toEqual(expect.any(String));
    expect(row.created_at).toBeInstanceOf(Date);
    expect(row.updated_at).toBeInstanceOf(Date);
  });

  it("stores every approved talent type and availability state", async () => {
    for (const type of [
      "ARTIST",
      "INFLUENCER",
      "ACTOR",
      "MUSICIAN",
      "MODEL",
      "PRESENTER",
      "CONTENT_CREATOR",
    ]) {
      await expect(insertTalent({ type })).resolves.toMatchObject({ type });
    }
    for (const availability of [
      "AVAILABLE",
      "ASSIGNED",
      "UNAVAILABLE",
      "INACTIVE",
    ]) {
      await expect(insertTalent({ availability })).resolves.toMatchObject({
        availability,
      });
    }
    await expect(insertTalent({ type: "DANCER" })).rejects.toMatchObject({
      code: PG_ERROR.invalidTextRepresentation,
    });
    await expect(
      insertTalent({ availability: "ARCHIVED" }),
    ).rejects.toMatchObject({ code: PG_ERROR.invalidTextRepresentation });
  });

  it("rejects blank profile text while preserving optional contacts", async () => {
    await expect(insertTalent({ full_name: "  " })).rejects.toMatchObject({
      code: PG_ERROR.checkViolation,
    });
    for (const column of ["email", "phone", "biography"]) {
      await expect(insertTalent({ [column]: " " })).rejects.toMatchObject({
        code: PG_ERROR.checkViolation,
      });
      await expect(insertTalent({ [column]: null })).resolves.toMatchObject({
        [column]: null,
      });
    }
  });

  it("uses a real optional manager and clears the link when the user is removed", async () => {
    const managerId = await insertUser();
    const talent = await insertTalent({ manager_id: managerId });
    expect(talent.manager_id).toBe(managerId);

    await expect(
      insertTalent({ manager_id: MISSING_UUID }),
    ).rejects.toMatchObject({ code: PG_ERROR.foreignKeyViolation });

    await db.query(`DELETE FROM users WHERE id = $1`, [managerId]);
    const [afterRemoval] = await db.query<{ manager_id: string | null }>(
      `SELECT manager_id FROM talents WHERE id = $1`,
      [talent.id],
    );
    expect(afterRemoval?.manager_id).toBeNull();
  });

  describe("secure profile image", () => {
    it("accepts an available managed file and makes it exclusive to one profile", async () => {
      const { fileId } = await insertAvailableProfileImage();

      await expect(
        insertTalent({ profile_image_id: fileId }),
      ).rejects.toMatchObject({ code: PG_ERROR.uniqueViolation });
      await expect(
        db.query(`DELETE FROM managed_files WHERE id = $1`, [fileId]),
      ).rejects.toMatchObject({ code: PG_ERROR.restrictViolation });
    });

    it("rejects a pending file and preserves an available file until lifecycle transition", async () => {
      const [pending] = await db.query<{ id: string }>(
        `INSERT INTO managed_files (
           storage_key, original_filename, declared_media_type,
           declared_size_bytes, intent_expires_at
         ) VALUES ($1, 'pending.jpg', 'image/jpeg', 512, NOW() + INTERVAL '1 day')
         RETURNING id`,
        [`managed/talent/${unique("pending")}`],
      );
      await expect(
        insertTalent({ profile_image_id: pending!.id }),
      ).rejects.toMatchObject({ code: PG_ERROR.checkViolation });

      const { talentId } = await insertAvailableProfileImage();
      await expect(
        db.query(`UPDATE talents SET profile_image_id = NULL WHERE id = $1`, [
          talentId,
        ]),
      ).rejects.toMatchObject({ code: PG_ERROR.checkViolation });
    });

    it("binds an upload intent to exactly one talent parent", async () => {
      const talent = await insertTalent();
      const [workspace] = await db.query<{ id: string }>(
        `INSERT INTO workspaces (kind) VALUES ('EVENT') RETURNING id`,
      );
      await expect(
        db.query(
          `INSERT INTO managed_files (
             storage_key, original_filename, declared_media_type,
             declared_size_bytes, intent_expires_at, intent_talent_id
           ) VALUES ($1, 'portrait.jpg', 'image/jpeg', 512,
                     NOW() + INTERVAL '1 day', $2)`,
          [`managed/talent/${unique("intent")}`, talent.id],
        ),
      ).resolves.toBeTruthy();
      await expect(
        db.query(
          `INSERT INTO managed_files (
             storage_key, original_filename, declared_media_type,
             declared_size_bytes, intent_expires_at,
             intent_talent_id, intent_workspace_id
           ) VALUES ($1, 'portrait.jpg', 'image/jpeg', 512,
                     NOW() + INTERVAL '1 day', $2, $3)`,
          [
            `managed/talent/${unique("ambiguous-intent")}`,
            talent.id,
            workspace!.id,
          ],
        ),
      ).rejects.toMatchObject({ code: PG_ERROR.checkViolation });
    });
  });

  describe("social links and schedule", () => {
    it("normalizes social links and rejects duplicate or blank values", async () => {
      const talent = await insertTalent();
      await db.query(
        `INSERT INTO talent_social_links (talent_id, label, url)
         VALUES ($1, 'Instagram', 'https://social.example/talent')`,
        [talent.id],
      );
      await expect(
        db.query(
          `INSERT INTO talent_social_links (talent_id, label, url)
           VALUES ($1, 'Portfolio', 'https://social.example/talent')`,
          [talent.id],
        ),
      ).rejects.toMatchObject({ code: PG_ERROR.uniqueViolation });
      await expect(
        db.query(
          `INSERT INTO talent_social_links (talent_id, label, url)
           VALUES ($1, ' ', 'https://social.example/other')`,
          [talent.id],
        ),
      ).rejects.toMatchObject({ code: PG_ERROR.checkViolation });
    });

    it("requires a real talent and a forward UTC schedule interval", async () => {
      const talent = await insertTalent();
      await expect(
        db.query(
          `INSERT INTO talent_schedules (talent_id, title, start_at, end_at)
           VALUES ($1, 'Rehearsal', $2, $3)`,
          [talent.id, "2026-10-01T09:00:00.000Z", "2026-10-01T11:00:00.000Z"],
        ),
      ).resolves.toBeTruthy();
      await expect(
        db.query(
          `INSERT INTO talent_schedules (talent_id, title, start_at, end_at)
           VALUES ($1, 'Invalid', $2, $2)`,
          [talent.id, "2026-10-01T09:00:00.000Z"],
        ),
      ).rejects.toMatchObject({ code: PG_ERROR.checkViolation });
      await expect(
        db.query(
          `INSERT INTO talent_schedules (talent_id, title, start_at, end_at)
           VALUES ($1, 'Unknown', NOW(), NOW() + INTERVAL '1 hour')`,
          [MISSING_UUID],
        ),
      ).rejects.toMatchObject({ code: PG_ERROR.foreignKeyViolation });
    });
  });

  describe("event assignment", () => {
    it("stores one role-bearing assignment per event and talent", async () => {
      const eventId = await insertEvent();
      const talent = await insertTalent();
      const [assignment] = await db.query<{
        status: string;
        assigned_at: Date;
      }>(
        `INSERT INTO event_talents (event_id, talent_id, role)
         VALUES ($1, $2, 'Headliner') RETURNING status, assigned_at`,
        [eventId, talent.id],
      );
      expect(assignment?.status).toBe("ASSIGNED");
      expect(assignment?.assigned_at).toBeInstanceOf(Date);

      await expect(
        db.query(
          `INSERT INTO event_talents (event_id, talent_id, role)
           VALUES ($1, $2, 'Guest')`,
          [eventId, talent.id],
        ),
      ).rejects.toMatchObject({ code: PG_ERROR.uniqueViolation });
    });

    it("enforces assignment relations, role text, and lifecycle states", async () => {
      const eventId = await insertEvent();
      const talent = await insertTalent();

      await expect(
        db.query(
          `INSERT INTO event_talents (event_id, talent_id, role)
           VALUES ($1, $2, ' ')`,
          [eventId, talent.id],
        ),
      ).rejects.toMatchObject({ code: PG_ERROR.checkViolation });
      await expect(
        db.query(
          `INSERT INTO event_talents (event_id, talent_id, role)
           VALUES ($1, $2, 'Guest')`,
          [MISSING_UUID, talent.id],
        ),
      ).rejects.toMatchObject({ code: PG_ERROR.foreignKeyViolation });
      await expect(
        db.query(
          `INSERT INTO event_talents (event_id, talent_id, role)
           VALUES ($1, $2, 'Guest')`,
          [eventId, MISSING_UUID],
        ),
      ).rejects.toMatchObject({ code: PG_ERROR.foreignKeyViolation });
      for (const status of ["ASSIGNED", "COMPLETED", "CANCELLED"]) {
        await expect(
          db.query(
            `INSERT INTO event_talents (event_id, talent_id, role, status)
             VALUES ($1, $2, $3, $4)`,
            [await insertEvent(), (await insertTalent()).id, "Guest", status],
          ),
        ).resolves.toBeTruthy();
      }
      await expect(
        db.query(
          `INSERT INTO event_talents (event_id, talent_id, role, status)
           VALUES ($1, $2, 'Guest', 'PENDING')`,
          [await insertEvent(), (await insertTalent()).id],
        ),
      ).rejects.toMatchObject({
        code: PG_ERROR.invalidTextRepresentation,
      });
    });
  });

  it("creates the required access-path indexes and applies every migration", async () => {
    const indexes = await db.query<{ indexname: string }>(
      `SELECT indexname FROM pg_indexes
        WHERE tablename IN ('talents', 'talent_social_links',
                            'talent_schedules', 'event_talents')`,
    );
    expect(indexes.map(({ indexname }) => indexname)).toEqual(
      expect.arrayContaining([
        "talents_availability_full_name_idx",
        "talents_type_availability_idx",
        "talents_manager_id_idx",
        "talent_social_links_talent_id_url_key",
        "talent_schedules_talent_id_start_at_end_at_idx",
        "event_talents_event_id_talent_id_key",
        "event_talents_talent_id_status_idx",
      ]),
    );

    const [migration] = await db.query<{ count: string }>(
      `SELECT count(*)::text AS count FROM "_prisma_migrations"
        WHERE migration_name = '20260921100000_add_talent_management'
          AND finished_at IS NOT NULL
          AND rolled_back_at IS NULL`,
    );
    expect(migration?.count).toBe("1");
  });
});
