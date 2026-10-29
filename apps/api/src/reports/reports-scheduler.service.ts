import {
  Injectable,
  Logger,
  type OnModuleDestroy,
  type OnModuleInit,
} from "@nestjs/common";

import { OutboxActorKind } from "../generated/prisma/client.js";
import { DatabaseService } from "../database/database.service.js";
import { OutboxWriterService } from "../outbox/outbox-writer.service.js";
import type { ReportReminderEventPayload } from "../outbox/outbox.types.js";
import { ReportsSchedulerRepository } from "./infrastructure/reports-scheduler.repository.js";

const SCAN_INTERVAL_MS = 60_000;

@Injectable()
export class ReportsSchedulerService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(ReportsSchedulerService.name);
  private timer: NodeJS.Timeout | null = null;
  private ticking = false;

  constructor(
    private readonly db: DatabaseService,
    private readonly repository: ReportsSchedulerRepository,
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
      const reports = await this.repository.findReminderCandidates(new Date());
      for (const report of reports) {
        await this.db.$transaction(async (tx) => {
          if (!(await this.repository.tryClaim(tx, report))) return;
          const occurrenceKey = `${report.id}:${report.periodEnd.toISOString()}:report.reminder:v1`;
          await this.outbox.append(tx, {
            name: "report.reminder",
            version: 1,
            actorKind: OutboxActorKind.SYSTEM,
            resourceType: "report",
            resourceId: report.id,
            payload: { occurrenceKey } satisfies ReportReminderEventPayload,
            consumers: [{ consumerName: "notifications", consumerVersion: 1 }],
          });
        });
      }
    } catch (error) {
      this.logger.error(
        `report scheduler tick failed: ${error instanceof Error ? error.message : String(error)}`,
      );
    } finally {
      this.ticking = false;
    }
  }
}
