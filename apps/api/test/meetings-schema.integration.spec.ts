import { afterAll, beforeAll, describe, expect, it } from "vitest";

import {
  createIsolatedDatabase,
  PG_ERROR,
  type IsolatedDatabase,
} from "./support/database.js";

describe("meetings schema", () => {
  let db: IsolatedDatabase;
  let counter = 0;

  beforeAll(async () => {
    db = await createIsolatedDatabase();
  });
  afterAll(async () => {
    await db?.drop();
  });

  async function user(): Promise<string> {
    counter += 1;
    const [row] = await db.query<{ id: string }>(
      "INSERT INTO users (email) VALUES ($1) RETURNING id",
      [`meeting-${counter}@example.test`],
    );
    return row!.id;
  }

  async function meeting(
    values: Record<string, unknown> = {},
  ): Promise<string> {
    const organizerId = await user();
    const base = {
      title: `Meeting ${++counter}`,
      type: "ONLINE",
      organizer_id: organizerId,
      start_at: "2026-11-10T10:00:00.000Z",
      end_at: "2026-11-10T11:00:00.000Z",
      online_link: "https://meet.example.test/room",
      ...values,
    };
    const keys = Object.keys(base);
    const [row] = await db.query<{ id: string }>(
      `INSERT INTO meetings (${keys.join(", ")}) VALUES (${keys.map((_, i) => `$${i + 1}`).join(", ")}) RETURNING id`,
      Object.values(base),
    );
    return row!.id;
  }

  it("stores UTC meetings and pending participants", async () => {
    const id = await meeting();
    const participant = await user();
    await db.query(
      "INSERT INTO meeting_participants (meeting_id, user_id) VALUES ($1, $2)",
      [id, participant],
    );
    const [row] = await db.query<{
      status: string;
      response: string;
      responded_at: Date | null;
    }>(
      "SELECT m.status, p.response, p.responded_at FROM meeting_participants p JOIN meetings m ON m.id = p.meeting_id WHERE p.meeting_id = $1 AND p.user_id = $2",
      [id, participant],
    );
    expect(row).toMatchObject({
      status: "SCHEDULED",
      response: "PENDING",
      responded_at: null,
    });
  });

  it("enforces participant uniqueness and response timestamp state", async () => {
    const id = await meeting();
    const participant = await user();
    await db.query(
      "INSERT INTO meeting_participants (meeting_id, user_id) VALUES ($1, $2)",
      [id, participant],
    );
    await expect(
      db.query(
        "INSERT INTO meeting_participants (meeting_id, user_id) VALUES ($1, $2)",
        [id, participant],
      ),
    ).rejects.toMatchObject({ code: PG_ERROR.uniqueViolation });
    await expect(
      db.query(
        "INSERT INTO meeting_participants (meeting_id, user_id, response) VALUES ($1, $2, 'ACCEPTED')",
        [id, await user()],
      ),
    ).rejects.toMatchObject({ code: PG_ERROR.checkViolation });
    await expect(
      db.query(
        "INSERT INTO meeting_participants (meeting_id, user_id, response, responded_at) VALUES ($1, $2, 'PENDING', NOW())",
        [id, await user()],
      ),
    ).rejects.toMatchObject({ code: PG_ERROR.checkViolation });
    await expect(
      db.query(
        "INSERT INTO meeting_participants (meeting_id, user_id, response, responded_at) VALUES ($1, $2, 'DECLINED', NOW()) RETURNING response",
        [id, await user()],
      ),
    ).resolves.toEqual([{ response: "DECLINED" }]);
  });

  it("enforces meeting modality, schedule, reminder, and organizer invariants", async () => {
    await expect(
      meeting({ type: "PHYSICAL", online_link: null }),
    ).rejects.toMatchObject({ code: PG_ERROR.checkViolation });
    await expect(
      meeting({ end_at: "2026-11-10T09:00:00.000Z" }),
    ).rejects.toMatchObject({ code: PG_ERROR.checkViolation });
    await expect(
      meeting({ reminder_at: "2026-11-10T12:00:00.000Z" }),
    ).rejects.toMatchObject({ code: PG_ERROR.checkViolation });
  });

  it("enforces organizer, workspace, and participant foreign keys", async () => {
    await expect(
      meeting({ organizer_id: "00000000-0000-0000-0000-000000000000" }),
    ).rejects.toMatchObject({ code: PG_ERROR.foreignKeyViolation });
    await expect(
      meeting({ workspace_id: "00000000-0000-0000-0000-000000000000" }),
    ).rejects.toMatchObject({ code: PG_ERROR.foreignKeyViolation });
    await expect(
      db.query(
        "INSERT INTO meeting_participants (meeting_id, user_id) VALUES ($1, $2)",
        [await meeting(), "00000000-0000-0000-0000-000000000000"],
      ),
    ).rejects.toMatchObject({ code: PG_ERROR.foreignKeyViolation });
  });

  it("restricts organizer deletion and cascades participant removal", async () => {
    const id = await meeting();
    const [row] = await db.query<{ organizer_id: string }>(
      "SELECT organizer_id FROM meetings WHERE id = $1",
      [id],
    );
    await expect(
      db.query("DELETE FROM users WHERE id = $1", [row!.organizer_id]),
    ).rejects.toMatchObject({ code: PG_ERROR.restrictViolation });
    const participant = await user();
    await db.query(
      "INSERT INTO meeting_participants (meeting_id, user_id) VALUES ($1, $2)",
      [id, participant],
    );
    await db.query("DELETE FROM users WHERE id = $1", [participant]);
    await expect(
      db.query(
        "SELECT user_id FROM meeting_participants WHERE meeting_id = $1",
        [id],
      ),
    ).resolves.toEqual([]);
  });

  it("projects meetings into a caller calendar only through the concrete FK", async () => {
    const id = await meeting();
    const owner = await user();
    await db.query(
      "INSERT INTO calendar_entries (title, type, start_at, user_id, meeting_id) VALUES ('Meeting projection', 'MEETING', $1, $2, $3)",
      ["2026-11-10T10:00:00.000Z", owner, id],
    );
    await expect(
      db.query(
        "INSERT INTO calendar_entries (title, type, start_at, user_id) VALUES ('Missing source', 'MEETING', $1, $2)",
        ["2026-11-10T10:00:00.000Z", owner],
      ),
    ).rejects.toMatchObject({ code: PG_ERROR.checkViolation });
    await db.query("DELETE FROM meetings WHERE id = $1", [id]);
    await expect(
      db.query("SELECT id FROM calendar_entries WHERE meeting_id = $1", [id]),
    ).resolves.toEqual([]);
  });
});
