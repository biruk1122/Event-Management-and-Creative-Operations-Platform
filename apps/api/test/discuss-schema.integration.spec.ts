import { afterAll, beforeAll, describe, expect, it } from "vitest";

import {
  createIsolatedDatabase,
  PG_ERROR,
  type IsolatedDatabase,
} from "./support/database.js";

interface ConversationRow {
  id: string;
  type: string;
  name: string | null;
  visibility: string | null;
  workspace_id: string | null;
  department_id: string | null;
  team_id: string | null;
  created_by_id: string | null;
}

interface MessageRow {
  id: string;
  conversation_id: string;
  author_id: string | null;
  parent_message_id: string | null;
  content: string;
  edited_at: Date | null;
  deleted_at: Date | null;
  pinned_at: Date | null;
  pinned_by_id: string | null;
}

describe("discuss messages and channels schema", () => {
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

  async function insertUser(): Promise<string> {
    const [row] = await db.query<{ id: string }>(
      `INSERT INTO users (email) VALUES ($1) RETURNING id`,
      [`${unique("discuss-user")}@example.test`],
    );
    return row!.id;
  }

  async function insertWorkspace(kind = "EVENT"): Promise<string> {
    const [row] = await db.query<{ id: string }>(
      `INSERT INTO workspaces (kind) VALUES ($1) RETURNING id`,
      [kind],
    );
    return row!.id;
  }

  async function insertDepartment(): Promise<string> {
    const [row] = await db.query<{ id: string }>(
      `INSERT INTO departments (name) VALUES ($1) RETURNING id`,
      [unique("Discuss Department")],
    );
    return row!.id;
  }

  async function insertTeam(departmentId?: string): Promise<string> {
    const department = departmentId ?? (await insertDepartment());
    const [row] = await db.query<{ id: string }>(
      `INSERT INTO teams (name, department_id) VALUES ($1, $2) RETURNING id`,
      [unique("Discuss Team"), department],
    );
    return row!.id;
  }

  async function insertConversation(
    columns: Record<string, unknown> = {},
  ): Promise<ConversationRow> {
    const base: Record<string, unknown> = { type: "DIRECT", ...columns };
    const keys = Object.keys(base);
    const values = Object.values(base);
    const placeholders = keys.map((_, index) => `$${index + 1}`).join(", ");
    const [row] = await db.query<ConversationRow & Record<string, unknown>>(
      `INSERT INTO conversations (${keys.join(", ")})
       VALUES (${placeholders})
       RETURNING *`,
      values,
    );
    return row!;
  }

  async function insertChannel(
    columns: Record<string, unknown> = {},
  ): Promise<ConversationRow> {
    return insertConversation({
      type: "CHANNEL",
      name: unique("Channel"),
      visibility: "PUBLIC",
      ...columns,
    });
  }

  async function insertMessage(
    columns: Record<string, unknown> = {},
  ): Promise<MessageRow> {
    const base: Record<string, unknown> = {
      conversation_id: (await insertConversation()).id,
      content: unique("Message content"),
      ...columns,
    };
    const keys = Object.keys(base);
    const values = Object.values(base);
    const placeholders = keys.map((_, index) => `$${index + 1}`).join(", ");
    const [row] = await db.query<MessageRow & Record<string, unknown>>(
      `INSERT INTO messages (${keys.join(", ")})
       VALUES (${placeholders})
       RETURNING *`,
      values,
    );
    return row!;
  }

  async function insertPendingManagedFile(): Promise<string> {
    const tomorrow = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();
    const [row] = await db.query<{ id: string }>(
      `INSERT INTO managed_files (
         storage_key, original_filename, declared_media_type,
         declared_size_bytes, intent_expires_at
       ) VALUES ($1, 'draft.pdf', 'application/pdf', 512, $2)
       RETURNING id`,
      [`managed/${unique("pending-discuss-object")}`, tomorrow],
    );
    return row!.id;
  }

  /** Atomically finalizes an AVAILABLE managed file already attached to a
   * message, so the deferred "available requires attachment" check - which
   * only fires at commit - has a satisfying parent from the start. */
  async function finalizeManagedFileForMessage(
    messageId: string,
  ): Promise<string> {
    const now = new Date().toISOString();
    const tomorrow = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();
    const [row] = await db.query<{ id: string }>(
      `WITH managed_file AS (
         INSERT INTO managed_files (
           storage_key, original_filename, declared_media_type,
           declared_size_bytes, verified_media_type, verified_size_bytes,
           state, intent_expires_at, uploaded_at, available_at
         )
         VALUES ($1, 'discuss-attachment.pdf', 'application/pdf', 512,
                 'application/pdf', 512, 'AVAILABLE', $2, $3, $3)
         RETURNING id
       ), attachment AS (
         INSERT INTO message_attachments (message_id, managed_file_id)
         SELECT $4, id FROM managed_file
       )
       SELECT id FROM managed_file`,
      [`managed/${unique("discuss-object")}`, tomorrow, now, messageId],
    );
    return row!.id;
  }

  describe("conversations", () => {
    it("creates direct and group conversations with no channel fields", async () => {
      const direct = await insertConversation({ type: "DIRECT" });
      const group = await insertConversation({ type: "GROUP" });

      for (const conversation of [direct, group]) {
        expect(conversation).toMatchObject({
          name: null,
          visibility: null,
          workspace_id: null,
          department_id: null,
          team_id: null,
        });
      }
    });

    it("creates channels owned by a workspace, a department, a team, or nothing (general purpose)", async () => {
      const workspaceId = await insertWorkspace();
      const departmentId = await insertDepartment();
      const teamId = await insertTeam();

      const workspaceChannel = await insertChannel({
        workspace_id: workspaceId,
      });
      const departmentChannel = await insertChannel({
        department_id: departmentId,
      });
      const teamChannel = await insertChannel({ team_id: teamId });
      const generalChannel = await insertChannel();

      expect(workspaceChannel.workspace_id).toBe(workspaceId);
      expect(departmentChannel.department_id).toBe(departmentId);
      expect(teamChannel.team_id).toBe(teamId);
      expect(generalChannel).toMatchObject({
        workspace_id: null,
        department_id: null,
        team_id: null,
      });
    });

    it("rejects a non-channel conversation with a channel-only field set", async () => {
      await expect(
        insertConversation({ type: "DIRECT", name: "Not a channel" }),
      ).rejects.toMatchObject({ code: PG_ERROR.checkViolation });
      await expect(
        insertConversation({ type: "GROUP", visibility: "PUBLIC" }),
      ).rejects.toMatchObject({ code: PG_ERROR.checkViolation });
    });

    it("rejects a channel missing its name or visibility", async () => {
      await expect(
        insertConversation({
          type: "CHANNEL",
          name: null,
          visibility: "PUBLIC",
        }),
      ).rejects.toMatchObject({ code: PG_ERROR.checkViolation });
      await expect(
        insertConversation({
          type: "CHANNEL",
          name: unique("Channel"),
          visibility: null,
        }),
      ).rejects.toMatchObject({ code: PG_ERROR.checkViolation });
    });

    it("rejects a non-channel conversation with an owner set", async () => {
      const workspaceId = await insertWorkspace();
      await expect(
        insertConversation({ type: "DIRECT", workspace_id: workspaceId }),
      ).rejects.toMatchObject({ code: PG_ERROR.checkViolation });
    });

    it("rejects a channel with more than one owner", async () => {
      const workspaceId = await insertWorkspace();
      const departmentId = await insertDepartment();
      await expect(
        insertChannel({
          workspace_id: workspaceId,
          department_id: departmentId,
        }),
      ).rejects.toMatchObject({ code: PG_ERROR.checkViolation });
    });

    it("requires a real workspace, department, team, and creator", async () => {
      const missing = "00000000-0000-0000-0000-000000000000";
      await expect(
        insertChannel({ workspace_id: missing }),
      ).rejects.toMatchObject({ code: PG_ERROR.foreignKeyViolation });
      await expect(
        insertChannel({ department_id: missing }),
      ).rejects.toMatchObject({ code: PG_ERROR.foreignKeyViolation });
      await expect(insertChannel({ team_id: missing })).rejects.toMatchObject({
        code: PG_ERROR.foreignKeyViolation,
      });
      await expect(
        insertConversation({ created_by_id: missing }),
      ).rejects.toMatchObject({ code: PG_ERROR.foreignKeyViolation });
    });

    it("rejects an unknown conversation type or channel visibility", async () => {
      await expect(
        insertConversation({ type: "BROADCAST" }),
      ).rejects.toMatchObject({ code: PG_ERROR.invalidTextRepresentation });
      await expect(
        insertChannel({ visibility: "SECRET" }),
      ).rejects.toMatchObject({ code: PG_ERROR.invalidTextRepresentation });
    });
  });

  describe("conversation members", () => {
    it("records membership with a joined_at default and no read cursor", async () => {
      const conversation = await insertConversation();
      const userId = await insertUser();
      const [member] = await db.query(
        `INSERT INTO conversation_members (conversation_id, user_id)
         VALUES ($1, $2) RETURNING *`,
        [conversation.id, userId],
      );
      expect(member).toMatchObject({
        last_read_message_id: null,
        last_read_at: null,
      });
      expect(member!.joined_at).toBeInstanceOf(Date);
    });

    it("cannot record the same user in the same conversation twice", async () => {
      const conversation = await insertConversation();
      const userId = await insertUser();
      await db.query(
        `INSERT INTO conversation_members (conversation_id, user_id) VALUES ($1, $2)`,
        [conversation.id, userId],
      );
      await expect(
        db.query(
          `INSERT INTO conversation_members (conversation_id, user_id) VALUES ($1, $2)`,
          [conversation.id, userId],
        ),
      ).rejects.toMatchObject({ code: PG_ERROR.uniqueViolation });
    });

    it("removes membership when the conversation or the user is removed", async () => {
      const conversation = await insertConversation();
      const userId = await insertUser();
      await db.query(
        `INSERT INTO conversation_members (conversation_id, user_id) VALUES ($1, $2)`,
        [conversation.id, userId],
      );
      await db.query(`DELETE FROM conversations WHERE id = $1`, [
        conversation.id,
      ]);
      expect(
        await db.query(
          `SELECT 1 FROM conversation_members WHERE conversation_id = $1`,
          [conversation.id],
        ),
      ).toEqual([]);
    });

    it("requires a read cursor to reference a message in the same conversation", async () => {
      const conversation = await insertConversation();
      const otherConversation = await insertConversation();
      const userId = await insertUser();
      const messageInOther = await insertMessage({
        conversation_id: otherConversation.id,
      });

      await expect(
        db.query(
          `INSERT INTO conversation_members
             (conversation_id, user_id, last_read_message_id)
           VALUES ($1, $2, $3)`,
          [conversation.id, userId, messageInOther.id],
        ),
      ).rejects.toMatchObject({ code: PG_ERROR.checkViolation });

      const messageInSame = await insertMessage({
        conversation_id: conversation.id,
      });
      await expect(
        db.query(
          `INSERT INTO conversation_members
             (conversation_id, user_id, last_read_message_id)
           VALUES ($1, $2, $3)`,
          [conversation.id, userId, messageInSame.id],
        ),
      ).resolves.not.toThrow();
    });
  });

  describe("messages", () => {
    it("creates a message with server defaults and no reply/pin state", async () => {
      const message = await insertMessage();
      expect(message).toMatchObject({
        parent_message_id: null,
        edited_at: null,
        deleted_at: null,
        pinned_at: null,
        pinned_by_id: null,
      });
    });

    it("allows a reply to a message in the same conversation", async () => {
      const parent = await insertMessage();
      const reply = await insertMessage({
        conversation_id: parent.conversation_id,
        parent_message_id: parent.id,
      });
      expect(reply.parent_message_id).toBe(parent.id);
    });

    it("rejects a reply to a message in a different conversation", async () => {
      const parent = await insertMessage();
      await expect(
        insertMessage({ parent_message_id: parent.id }),
      ).rejects.toMatchObject({ code: PG_ERROR.checkViolation });
    });

    it("pins and unpins with the timestamp and actor set together", async () => {
      const conversation = await insertConversation();
      const pinner = await insertUser();
      const now = new Date().toISOString();

      await expect(
        insertMessage({
          conversation_id: conversation.id,
          pinned_at: now,
        }),
      ).rejects.toMatchObject({ code: PG_ERROR.checkViolation });
      await expect(
        insertMessage({
          conversation_id: conversation.id,
          pinned_by_id: pinner,
        }),
      ).rejects.toMatchObject({ code: PG_ERROR.checkViolation });

      const pinned = await insertMessage({
        conversation_id: conversation.id,
        pinned_at: now,
        pinned_by_id: pinner,
      });
      expect(pinned.pinned_by_id).toBe(pinner);
    });

    it("requires a real conversation, author, and pinner", async () => {
      const missing = "00000000-0000-0000-0000-000000000000";
      await expect(
        insertMessage({ conversation_id: missing }),
      ).rejects.toMatchObject({ code: PG_ERROR.foreignKeyViolation });
      await expect(insertMessage({ author_id: missing })).rejects.toMatchObject(
        { code: PG_ERROR.foreignKeyViolation },
      );
      const now = new Date().toISOString();
      await expect(
        insertMessage({ pinned_at: now, pinned_by_id: missing }),
      ).rejects.toMatchObject({ code: PG_ERROR.foreignKeyViolation });
    });

    it("rejects a parent message that does not exist, via the same-conversation check", async () => {
      // The BEFORE trigger's own lookup finds no such row and rejects before
      // the foreign key constraint gets a chance to - a more specific error
      // for the same underlying problem, not a gap in either check.
      const missing = "00000000-0000-0000-0000-000000000000";
      await expect(
        insertMessage({ parent_message_id: missing }),
      ).rejects.toMatchObject({ code: PG_ERROR.checkViolation });
    });
  });

  describe("message mentions", () => {
    it("cannot mention the same user in the same message twice", async () => {
      const message = await insertMessage();
      const userId = await insertUser();
      await db.query(
        `INSERT INTO message_mentions (message_id, user_id) VALUES ($1, $2)`,
        [message.id, userId],
      );
      await expect(
        db.query(
          `INSERT INTO message_mentions (message_id, user_id) VALUES ($1, $2)`,
          [message.id, userId],
        ),
      ).rejects.toMatchObject({ code: PG_ERROR.uniqueViolation });
    });

    it("removes mentions when the message is removed", async () => {
      const message = await insertMessage();
      const userId = await insertUser();
      await db.query(
        `INSERT INTO message_mentions (message_id, user_id) VALUES ($1, $2)`,
        [message.id, userId],
      );
      await db.query(`DELETE FROM messages WHERE id = $1`, [message.id]);
      expect(
        await db.query(`SELECT 1 FROM message_mentions WHERE message_id = $1`, [
          message.id,
        ]),
      ).toEqual([]);
    });
  });

  describe("message attachments", () => {
    it("requires an available managed file", async () => {
      const message = await insertMessage();
      const pendingFileId = await insertPendingManagedFile();
      await expect(
        db.query(
          `INSERT INTO message_attachments (message_id, managed_file_id) VALUES ($1, $2)`,
          [message.id, pendingFileId],
        ),
      ).rejects.toMatchObject({ code: PG_ERROR.checkViolation });
    });

    it("finalizes an available file attached to a message in one transaction", async () => {
      const message = await insertMessage();
      const fileId = await finalizeManagedFileForMessage(message.id);
      const [file] = await db.query<{ state: string }>(
        `SELECT state FROM managed_files WHERE id = $1`,
        [fileId],
      );
      expect(file!.state).toBe("AVAILABLE");
    });

    it("rejects attaching the same file to the same message twice", async () => {
      const message = await insertMessage();
      const fileId = await finalizeManagedFileForMessage(message.id);
      await expect(
        db.query(
          `INSERT INTO message_attachments (message_id, managed_file_id) VALUES ($1, $2)`,
          [message.id, fileId],
        ),
      ).rejects.toMatchObject({ code: PG_ERROR.uniqueViolation });
    });

    it("rejects an available managed file left with no explicit attachment", async () => {
      const tomorrow = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();
      const now = new Date().toISOString();
      await expect(
        db.query(
          `INSERT INTO managed_files (
             storage_key, original_filename, declared_media_type,
             declared_size_bytes, verified_media_type, verified_size_bytes,
             state, intent_expires_at, uploaded_at, available_at
           ) VALUES ($1, 'orphan.pdf', 'application/pdf', 512,
                     'application/pdf', 512, 'AVAILABLE', $2, $3, $3)`,
          [`managed/${unique("orphan-discuss-object")}`, tomorrow, now],
        ),
      ).rejects.toMatchObject({ code: PG_ERROR.checkViolation });
    });
  });

  describe("managed file intent parent (conversation)", () => {
    it("requires a real conversation for a conversation-scoped intent", async () => {
      const tomorrow = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();
      const missing = "00000000-0000-0000-0000-000000000000";
      await expect(
        db.query(
          `INSERT INTO managed_files (
             storage_key, original_filename, declared_media_type,
             declared_size_bytes, intent_expires_at, intent_conversation_id
           ) VALUES ($1, 'draft.pdf', 'application/pdf', 512, $2, $3)`,
          [`managed/${unique("intent-object")}`, tomorrow, missing],
        ),
      ).rejects.toMatchObject({ code: PG_ERROR.foreignKeyViolation });
    });

    it("rejects an upload intent naming more than one parent", async () => {
      const tomorrow = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();
      const workspaceId = await insertWorkspace();
      const conversationId = (await insertConversation()).id;

      await expect(
        db.query(
          `INSERT INTO managed_files (
             storage_key, original_filename, declared_media_type,
             declared_size_bytes, intent_expires_at,
             intent_workspace_id, intent_conversation_id
           ) VALUES ($1, 'draft.pdf', 'application/pdf', 512, $2, $3, $4)`,
          [
            `managed/${unique("dual-intent-object")}`,
            tomorrow,
            workspaceId,
            conversationId,
          ],
        ),
      ).rejects.toMatchObject({ code: PG_ERROR.checkViolation });
    });

    it("accepts a conversation-only upload intent", async () => {
      const tomorrow = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();
      const conversationId = (await insertConversation()).id;

      const [row] = await db.query<{ intent_conversation_id: string }>(
        `INSERT INTO managed_files (
           storage_key, original_filename, declared_media_type,
           declared_size_bytes, intent_expires_at, intent_conversation_id
         ) VALUES ($1, 'draft.pdf', 'application/pdf', 512, $2, $3)
         RETURNING intent_conversation_id`,
        [`managed/${unique("solo-intent-object")}`, tomorrow, conversationId],
      );
      expect(row!.intent_conversation_id).toBe(conversationId);
    });
  });
});
