import { afterAll, beforeAll, describe, expect, it } from "vitest";

import {
  createIsolatedDatabase,
  PG_ERROR,
  type IsolatedDatabase,
} from "./support/database.js";

describe("authentication and session security schema", () => {
  let db: IsolatedDatabase;

  beforeAll(async () => {
    db = await createIsolatedDatabase();
  });

  afterAll(async () => {
    await db?.drop();
  });

  async function insertUser(email: string): Promise<string> {
    const [row] = await db.query<{ id: string; status: string }>(
      `INSERT INTO users (email) VALUES ($1) RETURNING id, status`,
      [email],
    );
    return row!.id;
  }

  it("generates a uuid id and defaults status to ACTIVE", async () => {
    const [row] = await db.query<{ id: string; status: string }>(
      `INSERT INTO users (email) VALUES ($1) RETURNING id, status`,
      ["defaults@e2e.test"],
    );

    expect(row!.id).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-7[0-9a-f]{3}-[0-9a-f]{4}-[0-9a-f]{12}$/i,
    );
    expect(row!.status).toBe("ACTIVE");
  });

  it("rejects a duplicate email", async () => {
    await insertUser("dup@e2e.test");
    await expect(insertUser("dup@e2e.test")).rejects.toMatchObject({
      code: PG_ERROR.uniqueViolation,
    });
  });

  it("allows at most one credential per user", async () => {
    const userId = await insertUser("cred@e2e.test");
    await db.query(
      `INSERT INTO user_credentials (user_id, password_hash) VALUES ($1, $2)`,
      [userId, "argon2id$hash"],
    );

    await expect(
      db.query(
        `INSERT INTO user_credentials (user_id, password_hash) VALUES ($1, $2)`,
        [userId, "argon2id$hash2"],
      ),
    ).rejects.toMatchObject({ code: PG_ERROR.uniqueViolation });
  });

  it("rejects a non-negative failed attempt count violation", async () => {
    const userId = await insertUser("lockout@e2e.test");
    await expect(
      db.query(
        `INSERT INTO user_credentials (user_id, password_hash, failed_attempt_count)
         VALUES ($1, $2, -1)`,
        [userId, "argon2id$hash"],
      ),
    ).rejects.toMatchObject({ code: PG_ERROR.checkViolation });
  });

  it("requires a session to reference an existing user", async () => {
    await expect(
      db.query(
        `INSERT INTO auth_sessions (user_id, family_id, refresh_token_hash, expires_at)
         VALUES (gen_random_uuid(), gen_random_uuid(), 'hash-a', now() + interval '30 days')`,
      ),
    ).rejects.toMatchObject({ code: PG_ERROR.foreignKeyViolation });
  });

  it("cascades credential and session deletion when the user is removed", async () => {
    const userId = await insertUser("cascade@e2e.test");
    await db.query(
      `INSERT INTO user_credentials (user_id, password_hash) VALUES ($1, 'h')`,
      [userId],
    );
    await db.query(
      `INSERT INTO auth_sessions (user_id, family_id, refresh_token_hash, expires_at)
       VALUES ($1, gen_random_uuid(), 'hash-cascade', now() + interval '30 days')`,
      [userId],
    );

    await db.query(`DELETE FROM users WHERE id = $1`, [userId]);

    const [credentials] = await db.query<{ count: string }>(
      `SELECT count(*)::text AS count FROM user_credentials WHERE user_id = $1`,
      [userId],
    );
    const [sessions] = await db.query<{ count: string }>(
      `SELECT count(*)::text AS count FROM auth_sessions WHERE user_id = $1`,
      [userId],
    );
    expect(credentials!.count).toBe("0");
    expect(sessions!.count).toBe("0");
  });

  it("enforces expires_at after issued_at", async () => {
    const userId = await insertUser("expiry@e2e.test");
    await expect(
      db.query(
        `INSERT INTO auth_sessions (user_id, family_id, refresh_token_hash, issued_at, expires_at)
         VALUES ($1, gen_random_uuid(), 'hash-expiry', now(), now() - interval '1 second')`,
        [userId],
      ),
    ).rejects.toMatchObject({ code: PG_ERROR.checkViolation });
  });

  it("couples revoked_reason with revoked_at", async () => {
    const userId = await insertUser("revoke@e2e.test");
    await expect(
      db.query(
        `INSERT INTO auth_sessions
           (user_id, family_id, refresh_token_hash, expires_at, revoked_reason)
         VALUES ($1, gen_random_uuid(), 'hash-revoke', now() + interval '30 days', 'LOGOUT')`,
        [userId],
      ),
    ).rejects.toMatchObject({ code: PG_ERROR.checkViolation });
  });

  it("rejects a rotated session that is not revoked", async () => {
    const userId = await insertUser("rotate@e2e.test");
    await expect(
      db.query(
        `INSERT INTO auth_sessions
           (user_id, family_id, refresh_token_hash, expires_at, rotated_at)
         VALUES ($1, gen_random_uuid(), 'hash-rotate', now() + interval '30 days', now())`,
        [userId],
      ),
    ).rejects.toMatchObject({ code: PG_ERROR.checkViolation });
  });

  it("keeps refresh_token_hash unique and the rotation link one-to-one", async () => {
    const userId = await insertUser("family@e2e.test");
    const [first] = await db.query<{ id: string }>(
      `INSERT INTO auth_sessions (user_id, family_id, refresh_token_hash, expires_at)
       VALUES ($1, gen_random_uuid(), 'hash-shared', now() + interval '30 days') RETURNING id`,
      [userId],
    );

    await expect(
      db.query(
        `INSERT INTO auth_sessions (user_id, family_id, refresh_token_hash, expires_at)
         VALUES ($1, gen_random_uuid(), 'hash-shared', now() + interval '30 days')`,
        [userId],
      ),
    ).rejects.toMatchObject({ code: PG_ERROR.uniqueViolation });

    const [successor] = await db.query<{ id: string }>(
      `INSERT INTO auth_sessions
         (user_id, family_id, refresh_token_hash, expires_at, replaced_by_session_id)
       VALUES ($1, gen_random_uuid(), 'hash-successor', now() + interval '30 days', $2) RETURNING id`,
      [userId, first!.id],
    );
    expect(successor!.id).not.toEqual(first!.id);

    await expect(
      db.query(
        `INSERT INTO auth_sessions
           (user_id, family_id, refresh_token_hash, expires_at, replaced_by_session_id)
         VALUES ($1, gen_random_uuid(), 'hash-second-successor', now() + interval '30 days', $2)`,
        [userId, first!.id],
      ),
    ).rejects.toMatchObject({ code: PG_ERROR.uniqueViolation });
  });

  it("clears replaced_by_session_id when the successor row is deleted", async () => {
    const userId = await insertUser("setnull@e2e.test");
    const [predecessor] = await db.query<{ id: string }>(
      `INSERT INTO auth_sessions (user_id, family_id, refresh_token_hash, expires_at)
       VALUES ($1, gen_random_uuid(), 'hash-pred', now() + interval '30 days') RETURNING id`,
      [userId],
    );
    const [successor] = await db.query<{ id: string }>(
      `INSERT INTO auth_sessions
         (user_id, family_id, refresh_token_hash, expires_at, replaced_by_session_id)
       VALUES ($1, gen_random_uuid(), 'hash-succ', now() + interval '30 days', $2) RETURNING id`,
      [userId, predecessor!.id],
    );

    // Point predecessor at successor, then delete successor.
    await db.query(
      `UPDATE auth_sessions SET replaced_by_session_id = $1 WHERE id = $2`,
      [successor!.id, predecessor!.id],
    );
    await db.query(`DELETE FROM auth_sessions WHERE id = $1`, [successor!.id]);

    const [row] = await db.query<{ replaced_by_session_id: string | null }>(
      `SELECT replaced_by_session_id FROM auth_sessions WHERE id = $1`,
      [predecessor!.id],
    );
    expect(row!.replaced_by_session_id).toBeNull();
  });

  it("reports the migration as applied", async () => {
    const [row] = await db.query<{ count: string }>(
      `SELECT count(*)::text AS count FROM "_prisma_migrations"
        WHERE finished_at IS NOT NULL AND rolled_back_at IS NULL`,
    );
    expect(Number(row!.count)).toBeGreaterThanOrEqual(2);
  });
});
