import { randomUUID } from "node:crypto";

import { PrismaPg } from "@prisma/adapter-pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import {
  NotificationType,
  OutboxActorKind,
  OutboxDeliveryStatus,
  PrismaClient,
} from "../src/generated/prisma/client.js";
import { OutboxRepository } from "../src/outbox/infrastructure/outbox.repository.js";
import { NotificationsRepository } from "../src/notifications/infrastructure/notifications.repository.js";
import {
  createIsolatedDatabase,
  type IsolatedDatabase,
} from "./support/database.js";

/**
 * NTF-02 - verifies `OutboxRepository`'s claim/backoff/lease mechanics (ADR
 * 0001 §4; ADR 0004 §6) and `NotificationsRepository`'s idempotency, cursor
 * ordering, and cross-domain recipient/content reads (ADR 0003 §1, §3, §5)
 * against a real isolated PostgreSQL 18 schema.
 */
describe("notifications and outbox persistence", () => {
  let db: IsolatedDatabase;
  let prisma: PrismaClient;
  let outbox: OutboxRepository;
  let notifications: NotificationsRepository;

  let departmentId: string;

  beforeAll(async () => {
    db = await createIsolatedDatabase();
    prisma = new PrismaClient({
      adapter: new PrismaPg(
        { connectionString: db.url },
        { schema: db.schema },
      ),
    });
    outbox = new OutboxRepository(prisma as never);
    notifications = new NotificationsRepository(prisma as never);

    departmentId = (
      await prisma.department.create({ data: { name: "Notifications QA" } })
    ).id;
  });

  afterAll(async () => {
    await prisma?.$disconnect();
    await db?.drop();
  });

  let counter = 0;
  async function makeUser(): Promise<string> {
    counter += 1;
    const user = await prisma.user.create({
      data: { email: `person-${counter}@notifications.test`, departmentId },
    });
    return user.id;
  }

  async function makeTask(title = `Task ${(counter += 1)}`): Promise<string> {
    const task = await prisma.task.create({
      data: { title, departmentId },
    });
    return task.id;
  }

  async function makeConversationWithMessage(input: {
    memberIds: string[];
    authorId: string;
    mentionedUserIds?: string[];
    content?: string;
  }): Promise<{ conversationId: string; messageId: string }> {
    const conversation = await prisma.conversation.create({
      data: {
        type: "GROUP",
        createdById: input.authorId,
        members: { create: input.memberIds.map((userId) => ({ userId })) },
      },
    });
    const message = await prisma.message.create({
      data: {
        conversationId: conversation.id,
        authorId: input.authorId,
        content: input.content ?? "hello",
        mentions: {
          create: (input.mentionedUserIds ?? []).map((userId) => ({ userId })),
        },
      },
    });
    return { conversationId: conversation.id, messageId: message.id };
  }

  async function appendOutboxEvent(
    overrides: Partial<{
      name: string;
      resourceId: string;
      consumerName: string;
      consumerVersion: number;
    }> = {},
  ): Promise<string> {
    const eventId = randomUUID();
    await prisma.$transaction((tx) =>
      outbox.append(tx as never, {
        eventId,
        name: (overrides.name ?? "task.assigned") as never,
        version: 1,
        actorKind: OutboxActorKind.USER,
        resourceType: "task",
        resourceId: overrides.resourceId ?? randomUUID(),
        consumers: [
          {
            consumerName: overrides.consumerName ?? "notifications",
            consumerVersion: overrides.consumerVersion ?? 1,
          },
        ],
      }),
    );
    return eventId;
  }

  describe("OutboxRepository", () => {
    it("writes one delivery per consumer, pending and immediately due", async () => {
      const eventId = randomUUID();
      await prisma.$transaction((tx) =>
        outbox.append(tx as never, {
          eventId,
          name: "task.assigned",
          version: 1,
          actorKind: OutboxActorKind.USER,
          resourceType: "task",
          resourceId: randomUUID(),
          consumers: [
            { consumerName: "notifications", consumerVersion: 1 },
            { consumerName: "audit-export", consumerVersion: 1 },
          ],
        }),
      );
      const deliveries = await prisma.outboxDelivery.findMany({
        where: { eventId },
        orderBy: { consumerName: "asc" },
      });
      expect(deliveries).toHaveLength(2);
      for (const delivery of deliveries) {
        expect(delivery.status).toBe(OutboxDeliveryStatus.PENDING);
        expect(delivery.attempts).toBe(0);
        expect(delivery.nextAttemptAt.getTime()).toBeLessThanOrEqual(
          Date.now(),
        );
      }
    });

    it("claims only due, pending rows for the matching consumer and version, in (createdAt, id) order", async () => {
      const forOtherConsumer = await appendOutboxEvent({
        consumerName: "claim-order-other-consumer",
      });
      const notYetDue = randomUUID();
      await prisma.$transaction((tx) =>
        outbox.append(tx as never, {
          eventId: notYetDue,
          name: "task.assigned",
          version: 1,
          occurredAt: new Date(),
          actorKind: OutboxActorKind.USER,
          resourceType: "task",
          resourceId: randomUUID(),
          consumers: [{ consumerName: "claim-order-test", consumerVersion: 1 }],
        }),
      );
      await prisma.outboxDelivery.updateMany({
        where: { eventId: notYetDue },
        data: { nextAttemptAt: new Date(Date.now() + 60_000) },
      });
      const first = await appendOutboxEvent({
        consumerName: "claim-order-test",
      });
      const second = await appendOutboxEvent({
        consumerName: "claim-order-test",
      });

      const claimed = await outbox.claimBatch("claim-order-test", 1, 50);
      // Exact equality (not just "contains"): a leaked row for another
      // consumer, or the not-yet-due row, would break this order too.
      expect(claimed.map((delivery) => delivery.event.id)).toEqual([
        first,
        second,
      ]);
      expect(claimed.every((delivery) => delivery.attempts === 1)).toBe(true);

      const otherConsumerClaim = await outbox.claimBatch(
        "claim-order-other-consumer",
        1,
        50,
      );
      expect(otherConsumerClaim.map((delivery) => delivery.event.id)).toEqual([
        forOtherConsumer,
      ]);
    });

    it("leases a claimed row so an immediate second claim does not reprocess it", async () => {
      const eventId = await appendOutboxEvent({ consumerName: "lease-test" });
      const firstClaim = await outbox.claimBatch("lease-test", 1, 50);
      expect(firstClaim.map((d) => d.event.id)).toContain(eventId);

      const secondClaim = await outbox.claimBatch("lease-test", 1, 50);
      expect(secondClaim.map((d) => d.event.id)).not.toContain(eventId);
    });

    it("respects the batch limit", async () => {
      for (let i = 0; i < 3; i += 1) {
        await appendOutboxEvent({ consumerName: "limit-test" });
      }
      const claimed = await outbox.claimBatch("limit-test", 1, 2);
      expect(claimed).toHaveLength(2);
    });

    it("marks a delivery succeeded", async () => {
      await appendOutboxEvent({ consumerName: "succeed-test" });
      const [claimed] = await outbox.claimBatch("succeed-test", 1, 50);
      await outbox.markSucceeded(claimed!.deliveryId);
      const row = await prisma.outboxDelivery.findUniqueOrThrow({
        where: { id: claimed!.deliveryId },
      });
      expect(row.status).toBe(OutboxDeliveryStatus.SUCCEEDED);
      expect(row.succeededAt).not.toBeNull();
    });

    it("schedules the fixed 30s/2m/10m backoff for the first three failures, then durably fails", async () => {
      await appendOutboxEvent({ consumerName: "backoff-test" });
      const [claimed] = await outbox.claimBatch("backoff-test", 1, 50);
      const deliveryId = claimed!.deliveryId;

      const expectedOffsetsSeconds = [30, 120, 600];
      for (const [index, expectedSeconds] of expectedOffsetsSeconds.entries()) {
        const attempts = index + 1;
        const before = Date.now();
        await outbox.markFailed(
          deliveryId,
          attempts,
          `attempt ${attempts} failed`,
        );
        const row = await prisma.outboxDelivery.findUniqueOrThrow({
          where: { id: deliveryId },
        });
        expect(row.status).toBe(OutboxDeliveryStatus.PENDING);
        const offsetSeconds = (row.nextAttemptAt.getTime() - before) / 1000;
        expect(offsetSeconds).toBeGreaterThan(expectedSeconds - 5);
        expect(offsetSeconds).toBeLessThan(expectedSeconds + 5);
      }

      await outbox.markFailed(deliveryId, 4, "attempt 4 failed");
      const failed = await prisma.outboxDelivery.findUniqueOrThrow({
        where: { id: deliveryId },
      });
      expect(failed.status).toBe(OutboxDeliveryStatus.FAILED);
      expect(failed.lastError).toBe("attempt 4 failed");
    });
  });

  describe("NotificationsRepository", () => {
    it("treats a repeat (recipientUserId, type, occurrenceKey) as an idempotent duplicate, not an error", async () => {
      const recipientUserId = await makeUser();
      const taskId = await makeTask();
      const sourceEventId = await appendOutboxEvent({ resourceId: taskId });

      const input = {
        recipientUserId,
        type: NotificationType.TASK_ASSIGNED,
        sourceEventId,
        occurrenceKey: sourceEventId,
        title: "You were assigned a task",
        body: "Task",
        taskId,
      };
      const created = await notifications.createIfAbsent(input);
      expect(created).not.toBe("duplicate");

      const duplicate = await notifications.createIfAbsent(input);
      expect(duplicate).toBe("duplicate");

      expect(
        await prisma.notification.count({ where: { recipientUserId } }),
      ).toBe(1);
    });

    it("paginates the feed newest-first with a stable (createdAt, id) cursor", async () => {
      const recipientUserId = await makeUser();
      const taskId = await makeTask();
      const base = new Date("2026-01-01T00:00:00.000Z");
      const ids: string[] = [];
      for (let i = 0; i < 5; i += 1) {
        const sourceEventId = await appendOutboxEvent({ resourceId: taskId });
        const created = await prisma.notification.create({
          data: {
            recipientUserId,
            type: NotificationType.TASK_ASSIGNED,
            sourceEventId,
            occurrenceKey: sourceEventId,
            title: "You were assigned a task",
            body: `Task ${i}`,
            taskId,
            createdAt: new Date(base.getTime() + i * 1000),
          },
        });
        ids.push(created.id);
      }
      // Newest (highest createdAt, index 4) first.
      const expectedOrder = [...ids].reverse();

      const firstPage = await notifications.listFeed(
        recipientUserId,
        undefined,
        2,
      );
      expect(firstPage.items.map((item) => item.id)).toEqual(
        expectedOrder.slice(0, 2),
      );
      expect(firstPage.nextCursor).not.toBeNull();

      const secondPage = await notifications.listFeed(
        recipientUserId,
        firstPage.nextCursor!,
        2,
      );
      expect(secondPage.items.map((item) => item.id)).toEqual(
        expectedOrder.slice(2, 4),
      );

      const thirdPage = await notifications.listFeed(
        recipientUserId,
        secondPage.nextCursor!,
        2,
      );
      expect(thirdPage.items.map((item) => item.id)).toEqual(
        expectedOrder.slice(4, 5),
      );
      expect(thirdPage.nextCursor).toBeNull();
    });

    it("counts only unread notifications and marks read idempotently", async () => {
      const recipientUserId = await makeUser();
      const taskId = await makeTask();
      const sourceEventId = await appendOutboxEvent({ resourceId: taskId });
      const created = await prisma.notification.create({
        data: {
          recipientUserId,
          type: NotificationType.TASK_ASSIGNED,
          sourceEventId,
          occurrenceKey: sourceEventId,
          title: "You were assigned a task",
          body: "Task",
          taskId,
        },
      });

      expect(await notifications.unreadCount(recipientUserId)).toBe(1);

      const marked = await notifications.markRead(recipientUserId, created.id);
      expect(marked).not.toBe("not_found");
      expect(await notifications.unreadCount(recipientUserId)).toBe(0);

      // Marking an already-read notification again is a stable no-op.
      const markedAgain = await notifications.markRead(
        recipientUserId,
        created.id,
      );
      expect(markedAgain).not.toBe("not_found");

      const otherUser = await makeUser();
      expect(await notifications.markRead(otherUser, created.id)).toBe(
        "not_found",
      );
      expect(await notifications.markRead(recipientUserId, randomUUID())).toBe(
        "not_found",
      );
    });

    it("round-trips mute preferences", async () => {
      const userId = await makeUser();
      expect(await notifications.listMutedTypes(userId)).toEqual([]);

      await notifications.setMuted(userId, NotificationType.NEW_MESSAGE, true);
      expect(
        await notifications.isMuted(userId, NotificationType.NEW_MESSAGE),
      ).toBe(true);
      // Muting twice is idempotent (upsert), not a conflict.
      await notifications.setMuted(userId, NotificationType.NEW_MESSAGE, true);
      expect(await notifications.listMutedTypes(userId)).toEqual([
        NotificationType.NEW_MESSAGE,
      ]);

      await notifications.setMuted(userId, NotificationType.NEW_MESSAGE, false);
      expect(
        await notifications.isMuted(userId, NotificationType.NEW_MESSAGE),
      ).toBe(false);
      expect(await notifications.listMutedTypes(userId)).toEqual([]);
    });

    it("resolves task and assignee reads through the owning module's own tables", async () => {
      const taskId = await makeTask("Confirm venue permits");
      const assigneeOne = await makeUser();
      const assigneeTwo = await makeUser();
      await prisma.taskAssignment.createMany({
        data: [
          { taskId, userId: assigneeOne },
          { taskId, userId: assigneeTwo },
        ],
      });

      expect(await notifications.getTask(taskId)).toMatchObject({
        title: "Confirm venue permits",
      });
      expect(await notifications.getTask(randomUUID())).toBeNull();

      const assignees = await notifications.getTaskAssigneeIds(taskId);
      expect(assignees.sort()).toEqual([assigneeOne, assigneeTwo].sort());

      const excludingReviewer = await notifications.getTaskAssigneeIds(
        taskId,
        assigneeOne,
      );
      expect(excludingReviewer).toEqual([assigneeTwo]);
    });

    it("resolves message, conversation membership, and mentions through Discuss's own tables", async () => {
      const author = await makeUser();
      const memberOne = await makeUser();
      const memberTwo = await makeUser();
      const { conversationId, messageId } = await makeConversationWithMessage({
        authorId: author,
        memberIds: [author, memberOne, memberTwo],
        mentionedUserIds: [memberTwo],
        content: "Standup notes for the team",
      });

      const message = await notifications.getMessage(messageId);
      expect(message).toMatchObject({
        conversationId,
        authorId: author,
        content: "Standup notes for the team",
      });
      expect(await notifications.getMessage(randomUUID())).toBeNull();

      const members = await notifications.getConversationMemberIds(
        conversationId,
        author,
      );
      expect(members.sort()).toEqual([memberOne, memberTwo].sort());

      const mentions = await notifications.getMessageMentionUserIds(messageId);
      expect(mentions).toEqual([memberTwo]);
    });
  });
});
