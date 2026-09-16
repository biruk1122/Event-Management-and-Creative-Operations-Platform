import { beforeEach, describe, expect, it, vi } from "vitest";

import { OutboxActorKind } from "../src/generated/prisma/client.js";
import type { ClaimedOutboxDelivery } from "../src/outbox/outbox.types.js";
import { NotificationsRelayService } from "../src/notifications/notifications-relay.service.js";

function makeDelivery(): ClaimedOutboxDelivery {
  return {
    deliveryId: "delivery-1",
    attempts: 1,
    event: {
      id: "event-1",
      name: "task.assigned",
      version: 1,
      occurredAt: new Date("2026-01-01T00:00:00.000Z"),
      actorKind: OutboxActorKind.USER,
      actorUserId: "actor-1",
      correlationId: null,
      resourceType: "task",
      resourceId: "task-1",
      workspaceContext: null,
      payload: { assigneeUserId: "recipient-1" },
    },
  };
}

describe("NotificationsRelayService", () => {
  let outbox: Record<string, ReturnType<typeof vi.fn>>;
  let notifications: { processEvent: ReturnType<typeof vi.fn> };
  let relay: NotificationsRelayService;

  beforeEach(() => {
    outbox = {
      claimBatch: vi.fn().mockResolvedValue([makeDelivery()]),
      markSucceeded: vi.fn().mockResolvedValue(undefined),
      markFailed: vi.fn().mockResolvedValue(undefined),
    };
    notifications = { processEvent: vi.fn().mockResolvedValue(undefined) };
    relay = new NotificationsRelayService(
      outbox as never,
      notifications as never,
    );
  });

  it("acknowledges a delivery only after the notification processor succeeds", async () => {
    await (relay as unknown as { poll(): Promise<void> }).poll();

    expect(notifications.processEvent).toHaveBeenCalledWith(
      makeDelivery().event,
    );
    expect(outbox.markSucceeded).toHaveBeenCalledWith("delivery-1");
    expect(outbox.markFailed).not.toHaveBeenCalled();
  });

  it("records a processing failure for retry and does not acknowledge the delivery", async () => {
    notifications.processEvent.mockRejectedValue(
      new Error("database unavailable"),
    );

    await (relay as unknown as { poll(): Promise<void> }).poll();

    expect(outbox.markSucceeded).not.toHaveBeenCalled();
    expect(outbox.markFailed).toHaveBeenCalledWith(
      "delivery-1",
      1,
      "database unavailable",
    );
  });
});
