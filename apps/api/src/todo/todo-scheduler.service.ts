import {
  Injectable,
  Logger,
  type OnModuleDestroy,
  type OnModuleInit,
} from "@nestjs/common";

import { OutboxActorKind } from "../generated/prisma/client.js";
import { DatabaseService } from "../database/database.service.js";
import { OutboxWriterService } from "../outbox/outbox-writer.service.js";
import type { TodoReminderEventPayload } from "../outbox/outbox.types.js";
import { TodoSchedulerRepository } from "./infrastructure/todo-scheduler.repository.js";

const SCAN_INTERVAL_MS = 60_000;

@Injectable()
export class TodoSchedulerService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(TodoSchedulerService.name);
  private timer: NodeJS.Timeout | null = null;
  private ticking = false;

  constructor(
    private readonly db: DatabaseService,
    private readonly repository: TodoSchedulerRepository,
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
      const reminders = await this.repository.findReminderCandidates(
        new Date(),
      );
      for (const reminder of reminders) {
        await this.db.$transaction(async (tx) => {
          if (!(await this.repository.tryClaim(tx, reminder))) return;
          const occurrenceKey = `${reminder.todoId}:${reminder.reminderAt.toISOString()}:todo.reminder:v1`;
          await this.outbox.append(tx, {
            name: "todo.reminder",
            version: 1,
            actorKind: OutboxActorKind.SYSTEM,
            resourceType: "todo",
            resourceId: reminder.todoId,
            payload: { occurrenceKey } satisfies TodoReminderEventPayload,
            consumers: [{ consumerName: "notifications", consumerVersion: 1 }],
          });
        });
      }
    } catch (error) {
      this.logger.error(
        `todo scheduler tick failed: ${error instanceof Error ? error.message : String(error)}`,
      );
    } finally {
      this.ticking = false;
    }
  }
}
