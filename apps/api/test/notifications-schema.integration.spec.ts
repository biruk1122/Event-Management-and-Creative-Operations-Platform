import { afterAll, beforeAll, describe, expect, it } from "vitest";

import {
  createIsolatedDatabase,
  PG_ERROR,
  type IsolatedDatabase,
} from "./support/database.js";

const MISSING = "00000000-0000-0000-0000-000000000000";

interface OutboxEventRow {
  id: string;
  name: string;
  version: number;
  actor_kind: string;
  actor_user_id: string | null;
  resource_type: string;
  resource_id: string | null;
  payload: unknown;
  created_at: Date;
}

interface OutboxDeliveryRow {
  id: string;
  event_id: string;
  consumer_name: string;
  consumer_version: number;
  status: string;
  attempts: number;
  succeeded_at: Date | null;
}

interface NotificationRow {
  id: string;
  recipient_user_id: string;
  type: string;
  source_event_id: string;
  occurrence_key: string;
  task_id: string | null;
  message_id: string | null;
  event_id: string | null;
  created_at: Date;
  read_at: Date | null;
}

describe("in-app notifications schema", () => {
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
      [`${unique("ntf-user")}@example.test`],
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

  async function insertTask(): Promise<string> {
    const workspaceId = await insertWorkspace();
    const [row] = await db.query<{ id: string }>(
      `INSERT INTO tasks (workspace_id, title) VALUES ($1, $2) RETURNING id`,
      [workspaceId, unique("Notification Task")],
    );
    return row!.id;
  }

  async function insertConversation(): Promise<string> {
    const [row] = await db.query<{ id: string }>(
      `INSERT INTO conversations (type) VALUES ('DIRECT') RETURNING id`,
    );
    return row!.id;
  }

  async function insertMessage(): Promise<string> {
    const conversationId = await insertConversation();
    const [row] = await db.query<{ id: string }>(
      `INSERT INTO messages (conversation_id, content) VALUES ($1, $2) RETURNING id`,
      [conversationId, unique("Notification message content")],
    );
    return row!.id;
  }

  async function insertEvent(): Promise<string> {
    const workspaceId = await insertWorkspace();
    const [row] = await db.query<{ id: string }>(
      `INSERT INTO events (workspace_id, name, event_type) VALUES ($1, $2, 'OTHER') RETURNING id`,
      [workspaceId, unique("Notification Event")],
    );
    return row!.id;
  }

  async function insertOutboxEvent(
    columns: Record<string, unknown> = {},
  ): Promise<OutboxEventRow> {
    const base: Record<string, unknown> = {
      name: unique("task.assigned"),
      version: 1,
      occurred_at: new Date().toISOString(),
      actor_kind: "SYSTEM",
      resource_type: "task",
      ...columns,
    };
    const keys = Object.keys(base);
    const values = Object.values(base);
    const placeholders = keys.map((_, index) => `$${index + 1}`).join(", ");
    const [row] = await db.query<OutboxEventRow & Record<string, unknown>>(
      `INSERT INTO outbox_events (${keys.join(", ")})
       VALUES (${placeholders})
       RETURNING *`,
      values,
    );
    return row!;
  }

  async function insertOutboxDelivery(
    columns: Record<string, unknown> = {},
  ): Promise<OutboxDeliveryRow> {
    const base: Record<string, unknown> = {
      event_id: (await insertOutboxEvent()).id,
      consumer_name: "notifications",
      consumer_version: 1,
      ...columns,
    };
    const keys = Object.keys(base);
    const values = Object.values(base);
    const placeholders = keys.map((_, index) => `$${index + 1}`).join(", ");
    const [row] = await db.query<OutboxDeliveryRow & Record<string, unknown>>(
      `INSERT INTO outbox_deliveries (${keys.join(", ")})
       VALUES (${placeholders})
       RETURNING *`,
      values,
    );
    return row!;
  }

  async function insertNotification(
    columns: Record<string, unknown> = {},
  ): Promise<NotificationRow> {
    const base: Record<string, unknown> = {
      recipient_user_id: await insertUser(),
      type: "TASK_ASSIGNED",
      source_event_id: (await insertOutboxEvent()).id,
      occurrence_key: unique("occurrence"),
      title: "A task was assigned to you",
      body: "Open the task to see details.",
      ...columns,
    };
    const keys = Object.keys(base);
    const values = Object.values(base);
    const placeholders = keys.map((_, index) => `$${index + 1}`).join(", ");
    const [row] = await db.query<NotificationRow & Record<string, unknown>>(
      `INSERT INTO notifications (${keys.join(", ")})
       VALUES (${placeholders})
       RETURNING *`,
      values,
    );
    return row!;
  }

  describe("outbox events", () => {
    it("creates an event with server defaults", async () => {
      const event = await insertOutboxEvent();
      expect(event.payload).toEqual({});
      expect(event.created_at).toBeInstanceOf(Date);
    });

    it("accepts a system actor with no actor user", async () => {
      const event = await insertOutboxEvent({ actor_kind: "SYSTEM" });
      expect(event.actor_user_id).toBeNull();
    });

    it("accepts a user actor", async () => {
      const userId = await insertUser();
      const event = await insertOutboxEvent({
        actor_kind: "USER",
        actor_user_id: userId,
      });
      expect(event.actor_user_id).toBe(userId);
    });

    it("does not foreign-key actor_user_id: a removed actor stays inspectable", async () => {
      // Mirrors AuditRecord - the envelope must survive account lifecycle.
      await expect(
        insertOutboxEvent({ actor_kind: "USER", actor_user_id: MISSING }),
      ).resolves.toBeTruthy();
    });

    it("rejects a version below 1", async () => {
      await expect(insertOutboxEvent({ version: 0 })).rejects.toMatchObject({
        code: PG_ERROR.checkViolation,
      });
    });

    it("rejects an unknown actor kind", async () => {
      await expect(
        insertOutboxEvent({ actor_kind: "ANONYMOUS" }),
      ).rejects.toMatchObject({ code: PG_ERROR.invalidTextRepresentation });
    });
  });

  describe("outbox deliveries", () => {
    it("creates a delivery pending by default", async () => {
      const delivery = await insertOutboxDelivery();
      expect(delivery.status).toBe("PENDING");
      expect(delivery.attempts).toBe(0);
      expect(delivery.succeeded_at).toBeNull();
    });

    it("enforces the (event, consumer, version) idempotency tuple", async () => {
      const event = await insertOutboxEvent();
      await insertOutboxDelivery({
        event_id: event.id,
        consumer_name: "notifications",
        consumer_version: 1,
      });
      await expect(
        insertOutboxDelivery({
          event_id: event.id,
          consumer_name: "notifications",
          consumer_version: 1,
        }),
      ).rejects.toMatchObject({ code: PG_ERROR.uniqueViolation });
    });

    it("allows the same event to have distinct consumers or versions", async () => {
      const event = await insertOutboxEvent();
      await insertOutboxDelivery({
        event_id: event.id,
        consumer_name: "notifications",
        consumer_version: 1,
      });
      await expect(
        insertOutboxDelivery({
          event_id: event.id,
          consumer_name: "activity_feed",
          consumer_version: 1,
        }),
      ).resolves.toBeTruthy();
      await expect(
        insertOutboxDelivery({
          event_id: event.id,
          consumer_name: "notifications",
          consumer_version: 2,
        }),
      ).resolves.toBeTruthy();
    });

    it("requires a real event", async () => {
      await expect(
        insertOutboxDelivery({ event_id: MISSING }),
      ).rejects.toMatchObject({ code: PG_ERROR.foreignKeyViolation });
    });

    it("cascades delete when the event is removed", async () => {
      const delivery = await insertOutboxDelivery();
      await db.query(`DELETE FROM outbox_events WHERE id = $1`, [
        delivery.event_id,
      ]);
      expect(
        await db.query(`SELECT 1 FROM outbox_deliveries WHERE id = $1`, [
          delivery.id,
        ]),
      ).toEqual([]);
    });

    it("rejects a consumer version below 1", async () => {
      await expect(
        insertOutboxDelivery({ consumer_version: 0 }),
      ).rejects.toMatchObject({ code: PG_ERROR.checkViolation });
    });

    it("rejects negative attempts", async () => {
      await expect(
        insertOutboxDelivery({ attempts: -1 }),
      ).rejects.toMatchObject({ code: PG_ERROR.checkViolation });
    });

    it("keeps succeeded_at exactly in step with status", async () => {
      await expect(
        insertOutboxDelivery({
          status: "SUCCEEDED",
          succeeded_at: null,
        }),
      ).rejects.toMatchObject({ code: PG_ERROR.checkViolation });
      await expect(
        insertOutboxDelivery({
          status: "PENDING",
          succeeded_at: new Date().toISOString(),
        }),
      ).rejects.toMatchObject({ code: PG_ERROR.checkViolation });
      await expect(
        insertOutboxDelivery({
          status: "SUCCEEDED",
          succeeded_at: new Date().toISOString(),
        }),
      ).resolves.toBeTruthy();
    });

    it("rejects an unknown status", async () => {
      await expect(
        insertOutboxDelivery({ status: "RUNNING" }),
      ).rejects.toMatchObject({ code: PG_ERROR.invalidTextRepresentation });
    });
  });

  describe("notifications", () => {
    it("creates a notification with no target and no read state", async () => {
      const notification = await insertNotification();
      expect(notification).toMatchObject({
        task_id: null,
        message_id: null,
        event_id: null,
        read_at: null,
      });
      expect(notification.created_at).toBeInstanceOf(Date);
    });

    it("accepts a task, a message, or an event as the sole target", async () => {
      const taskId = await insertTask();
      const messageId = await insertMessage();
      const eventId = await insertEvent();

      const taskNotification = await insertNotification({ task_id: taskId });
      const messageNotification = await insertNotification({
        type: "NEW_MESSAGE",
        message_id: messageId,
      });
      const eventNotification = await insertNotification({
        type: "EVENT_REMINDER",
        event_id: eventId,
      });

      expect(taskNotification.task_id).toBe(taskId);
      expect(messageNotification.message_id).toBe(messageId);
      expect(eventNotification.event_id).toBe(eventId);
    });

    it("rejects more than one target set at once", async () => {
      const taskId = await insertTask();
      const messageId = await insertMessage();
      await expect(
        insertNotification({ task_id: taskId, message_id: messageId }),
      ).rejects.toMatchObject({ code: PG_ERROR.checkViolation });
    });

    it("enforces the (recipient, type, occurrence key) deduplication tuple", async () => {
      const recipientUserId = await insertUser();
      const sourceEventId = (await insertOutboxEvent()).id;
      const occurrenceKey = unique("dedup-occurrence");
      await insertNotification({
        recipient_user_id: recipientUserId,
        source_event_id: sourceEventId,
        occurrence_key: occurrenceKey,
      });
      await expect(
        insertNotification({
          recipient_user_id: recipientUserId,
          source_event_id: sourceEventId,
          occurrence_key: occurrenceKey,
        }),
      ).rejects.toMatchObject({ code: PG_ERROR.uniqueViolation });
    });

    it("allows the same occurrence key for a different recipient", async () => {
      const sourceEventId = (await insertOutboxEvent()).id;
      const occurrenceKey = unique("shared-occurrence");
      await insertNotification({
        source_event_id: sourceEventId,
        occurrence_key: occurrenceKey,
      });
      await expect(
        insertNotification({
          source_event_id: sourceEventId,
          occurrence_key: occurrenceKey,
        }),
      ).resolves.toBeTruthy();
    });

    it("rejects a read time before the created time", async () => {
      const inThePast = new Date(Date.now() - 60_000).toISOString();
      await expect(
        insertNotification({ read_at: inThePast }),
      ).rejects.toMatchObject({ code: PG_ERROR.checkViolation });
    });

    it("accepts a read time at or after creation", async () => {
      const notification = await insertNotification();
      const readAt = new Date().toISOString();
      await db.query(`UPDATE notifications SET read_at = $1 WHERE id = $2`, [
        readAt,
        notification.id,
      ]);
      const [reread] = await db.query<{ read_at: Date }>(
        `SELECT read_at FROM notifications WHERE id = $1`,
        [notification.id],
      );
      expect(reread!.read_at).not.toBeNull();
    });

    it("requires a real recipient, source event, and target", async () => {
      await expect(
        insertNotification({ recipient_user_id: MISSING }),
      ).rejects.toMatchObject({ code: PG_ERROR.foreignKeyViolation });
      await expect(
        insertNotification({ source_event_id: MISSING }),
      ).rejects.toMatchObject({ code: PG_ERROR.foreignKeyViolation });
      await expect(
        insertNotification({ task_id: MISSING }),
      ).rejects.toMatchObject({ code: PG_ERROR.foreignKeyViolation });
      await expect(
        insertNotification({ type: "NEW_MESSAGE", message_id: MISSING }),
      ).rejects.toMatchObject({ code: PG_ERROR.foreignKeyViolation });
      await expect(
        insertNotification({ type: "EVENT_REMINDER", event_id: MISSING }),
      ).rejects.toMatchObject({ code: PG_ERROR.foreignKeyViolation });
    });

    it("cascades delete when the recipient is removed", async () => {
      const notification = await insertNotification();
      await db.query(`DELETE FROM users WHERE id = $1`, [
        notification.recipient_user_id,
      ]);
      expect(
        await db.query(`SELECT 1 FROM notifications WHERE id = $1`, [
          notification.id,
        ]),
      ).toEqual([]);
    });

    it("cascades delete when the target task, message, or event is removed", async () => {
      const taskId = await insertTask();
      const taskNotification = await insertNotification({ task_id: taskId });
      await db.query(`DELETE FROM tasks WHERE id = $1`, [taskId]);
      expect(
        await db.query(`SELECT 1 FROM notifications WHERE id = $1`, [
          taskNotification.id,
        ]),
      ).toEqual([]);

      const messageId = await insertMessage();
      const messageNotification = await insertNotification({
        type: "NEW_MESSAGE",
        message_id: messageId,
      });
      await db.query(`DELETE FROM messages WHERE id = $1`, [messageId]);
      expect(
        await db.query(`SELECT 1 FROM notifications WHERE id = $1`, [
          messageNotification.id,
        ]),
      ).toEqual([]);
    });

    it("restricts removing a source outbox event that still has notifications", async () => {
      const sourceEvent = await insertOutboxEvent();
      await insertNotification({ source_event_id: sourceEvent.id });
      await expect(
        db.query(`DELETE FROM outbox_events WHERE id = $1`, [sourceEvent.id]),
      ).rejects.toMatchObject({ code: PG_ERROR.restrictViolation });
    });

    it("rejects an unknown notification type", async () => {
      await expect(
        insertNotification({ type: "TASK_CREATED" }),
      ).rejects.toMatchObject({ code: PG_ERROR.invalidTextRepresentation });
    });
  });

  describe("notification preferences", () => {
    async function insertPreference(
      columns: Record<string, unknown> = {},
    ): Promise<{ user_id: string; type: string }> {
      const base: Record<string, unknown> = {
        user_id: await insertUser(),
        type: "TASK_DUE",
        ...columns,
      };
      const keys = Object.keys(base);
      const values = Object.values(base);
      const placeholders = keys.map((_, index) => `$${index + 1}`).join(", ");
      const [row] = await db.query<{ user_id: string; type: string }>(
        `INSERT INTO notification_preferences (${keys.join(", ")})
         VALUES (${placeholders})
         RETURNING *`,
        values,
      );
      return row!;
    }

    it("mutes a mutable type", async () => {
      const preference = await insertPreference({ type: "EVENT_REMINDER" });
      expect(preference.type).toBe("EVENT_REMINDER");
    });

    it.each([
      "TASK_ASSIGNED",
      "TASK_APPROVED",
      "TASK_REJECTED",
      "MESSAGE_MENTION",
      "MEETING_INVITATION",
    ])("rejects muting the non-mutable type %s", async (type) => {
      await expect(insertPreference({ type })).rejects.toMatchObject({
        code: PG_ERROR.checkViolation,
      });
    });

    it("cannot mute the same type twice for the same user", async () => {
      const userId = await insertUser();
      await insertPreference({ user_id: userId, type: "TASK_DUE" });
      await expect(
        insertPreference({ user_id: userId, type: "TASK_DUE" }),
      ).rejects.toMatchObject({ code: PG_ERROR.uniqueViolation });
    });

    it("requires a real user", async () => {
      await expect(
        insertPreference({ user_id: MISSING }),
      ).rejects.toMatchObject({ code: PG_ERROR.foreignKeyViolation });
    });

    it("cascades delete when the user is removed", async () => {
      const preference = await insertPreference();
      await db.query(`DELETE FROM users WHERE id = $1`, [preference.user_id]);
      expect(
        await db.query(
          `SELECT 1 FROM notification_preferences WHERE user_id = $1`,
          [preference.user_id],
        ),
      ).toEqual([]);
    });
  });
});
