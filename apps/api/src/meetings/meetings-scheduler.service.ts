import {
  Injectable,
  Logger,
  type OnModuleDestroy,
  type OnModuleInit,
} from "@nestjs/common";

import { OutboxActorKind } from "../generated/prisma/client.js";
import { DatabaseService } from "../database/database.service.js";
import { OutboxWriterService } from "../outbox/outbox-writer.service.js";
import type { MeetingReminderEventPayload } from "../outbox/outbox.types.js";
import { MeetingsSchedulerRepository } from "./infrastructure/meetings-scheduler.repository.js";

const SCAN_INTERVAL_MS = 60_000;

@Injectable()
export class MeetingsSchedulerService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(MeetingsSchedulerService.name);
  private timer: NodeJS.Timeout | null = null;
  private ticking = false;

  constructor(
    private readonly db: DatabaseService,
    private readonly repository: MeetingsSchedulerRepository,
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
      const meetings = await this.repository.findReminderCandidates(new Date());
      for (const meeting of meetings) {
        await this.db.$transaction(async (tx) => {
          if (!(await this.repository.tryClaim(tx, meeting))) return;
          const occurrenceKey = `${meeting.id}:${meeting.reminderAt.toISOString()}:meeting.reminder:v1`;
          await this.outbox.append(tx, {
            name: "meeting.reminder",
            version: 1,
            actorKind: OutboxActorKind.SYSTEM,
            resourceType: "meeting",
            resourceId: meeting.id,
            payload: { occurrenceKey } satisfies MeetingReminderEventPayload,
            consumers: [{ consumerName: "notifications", consumerVersion: 1 }],
          });
        });
      }
    } catch (error) {
      this.logger.error(
        `meeting scheduler tick failed: ${error instanceof Error ? error.message : String(error)}`,
      );
    } finally {
      this.ticking = false;
    }
  }
}
