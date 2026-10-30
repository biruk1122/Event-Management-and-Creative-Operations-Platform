import { beforeEach, describe, expect, it, vi } from "vitest";

import { OutboxActorKind } from "../src/generated/prisma/client.js";
import { PartnersSchedulerService } from "../src/partners/partners-scheduler.service.js";

const FOLLOW_UP_AT = new Date("2030-01-01T09:45:00.000Z");

describe("PartnersSchedulerService", () => {
  let db: { $transaction: ReturnType<typeof vi.fn> };
  let repository: Record<string, ReturnType<typeof vi.fn>>;
  let outbox: { append: ReturnType<typeof vi.fn> };
  let service: PartnersSchedulerService;

  beforeEach(() => {
    db = {
      $transaction: vi.fn((fn: (tx: unknown) => Promise<unknown>) => fn({})),
    };
    repository = {
      findReminderCandidates: vi.fn().mockResolvedValue([]),
      tryClaim: vi.fn().mockResolvedValue(true),
    };
    outbox = { append: vi.fn().mockResolvedValue(undefined) };
    service = new PartnersSchedulerService(
      db as never,
      repository as never,
      outbox as never,
    );
  });

  async function tick(): Promise<void> {
    await (service as unknown as { tick(): Promise<void> }).tick();
  }

  it("claims and emits a deterministic partner follow-up occurrence", async () => {
    repository.findReminderCandidates!.mockResolvedValue([
      { id: "partner-1", followUpAt: FOLLOW_UP_AT },
    ]);
    await tick();

    expect(repository.tryClaim).toHaveBeenCalledWith(
      {},
      { id: "partner-1", followUpAt: FOLLOW_UP_AT },
    );
    expect(outbox.append).toHaveBeenCalledWith(
      {},
      expect.objectContaining({
        name: "partner.follow_up_due",
        version: 1,
        actorKind: OutboxActorKind.SYSTEM,
        resourceType: "partner",
        resourceId: "partner-1",
        payload: {
          occurrenceKey: `partner-1:${FOLLOW_UP_AT.toISOString()}:partner.follow_up_due:v1`,
        },
        consumers: [{ consumerName: "notifications", consumerVersion: 1 }],
      }),
    );
  });

  it("does not emit a duplicate occurrence when the database claim is already held", async () => {
    repository.findReminderCandidates!.mockResolvedValue([
      { id: "partner-1", followUpAt: FOLLOW_UP_AT },
    ]);
    repository.tryClaim!.mockResolvedValue(false);
    await tick();
    expect(outbox.append).not.toHaveBeenCalled();
  });

  it("does not overlap scanner ticks", async () => {
    let resolveFind!: () => void;
    repository.findReminderCandidates!.mockReturnValue(
      new Promise((resolve) => {
        resolveFind = () => resolve([]);
      }),
    );
    const first = tick();
    const second = tick();
    resolveFind();
    await Promise.all([first, second]);
    expect(repository.findReminderCandidates).toHaveBeenCalledTimes(1);
  });
});
