import {
  Injectable,
  Logger,
  type OnModuleDestroy,
  type OnModuleInit,
} from "@nestjs/common";

import { OutboxActorKind } from "../generated/prisma/client.js";
import { DatabaseService } from "../database/database.service.js";
import { OutboxWriterService } from "../outbox/outbox-writer.service.js";
import type { EventReminderEventPayload } from "../outbox/outbox.types.js";
import { EventsSchedulerRepository } from "./infrastructure/events-scheduler.repository.js";

const SCAN_INTERVAL_MS = 60_000;

@Injectable()
export class EventsSchedulerService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(EventsSchedulerService.name);
  private timer: NodeJS.Timeout | null = null;
  private ticking = false;

  constructor(
    private readonly db: DatabaseService,
    private readonly repository: EventsSchedulerRepository,
    private readonly outbox: OutboxWriterService,
  ) {}

  onModuleInit(): void {
    this.timer = setInterval(() => void this.tick(), SCAN_INTERVAL_MS);
  }

  onModuleDestroy(): void {
    if (this.timer) clearInterval(this.timer);
  }

  private async tick(): Promise<void> {
    if (this.ticking) return;
    this.ticking = true;
    try {
      const events = await this.repository.findReminderCandidates(new Date());
      for (const event of events) {
        await this.db.$transaction(async (tx) => {
          if (!(await this.repository.tryClaim(tx, event))) return;
          const occurrenceKey = `${event.id}:${event.reminderAt.toISOString()}:event.reminder:v1`;
          await this.outbox.append(tx, {
            name: "event.reminder",
            version: 1,
            actorKind: OutboxActorKind.SYSTEM,
            resourceType: "event",
            resourceId: event.id,
            payload: { occurrenceKey } satisfies EventReminderEventPayload,
            consumers: [{ consumerName: "notifications", consumerVersion: 1 }],
          });
        });
      }
    } catch (error) {
      this.logger.error(
        `event scheduler tick failed: ${error instanceof Error ? error.message : String(error)}`,
      );
    } finally {
      this.ticking = false;
    }
  }
}
