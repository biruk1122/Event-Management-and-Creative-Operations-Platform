import {
  Injectable,
  Logger,
  type OnModuleDestroy,
  type OnModuleInit,
} from "@nestjs/common";

import { OutboxActorKind } from "../generated/prisma/client.js";
import { DatabaseService } from "../database/database.service.js";
import { OutboxWriterService } from "../outbox/outbox-writer.service.js";
import {
  TasksSchedulerRepository,
  type DueTaskCandidate,
} from "./infrastructure/tasks-scheduler.repository.js";

const TASK_DUE_RULE = { name: "task.due", version: 1 } as const;
const TASK_OVERDUE_RULE = { name: "task.overdue", version: 1 } as const;
/**
 * Due/overdue reminders are not latency-sensitive the way chat or live
 * updates are, so this scans far less often than the outbox relay's ADR
 * 0004 §6-fixed 2s cadence - that number is fixed by that ADR for delivery
 * of already-claimed events; this is a different, unconstrained cadence for
 * discovering new scheduled occurrences.
 */
const SCAN_INTERVAL_MS = 60_000;

function occurrenceKey(
  rule: { name: string; version: number },
  taskId: string,
  dueAt: Date,
): string {
  return `${taskId}:${dueAt.toISOString()}:${rule.name}:v${rule.version}`;
}

/**
 * The TASK_DUE/TASK_OVERDUE scheduled producer (ADR 0003 §2, §3): a
 * lightweight in-process scanner, mirroring the outbox relay's own
 * in-process-poller precedent rather than a new job-queue dependency.
 * Correctness comes from `TasksSchedulerRepository.tryClaim`'s
 * database-backed unique constraint, not from only one process running this
 * timer - a second replica ticking concurrently is safe.
 */
@Injectable()
export class TasksSchedulerService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(TasksSchedulerService.name);
  private timer: NodeJS.Timeout | null = null;
  private ticking = false;

  constructor(
    private readonly db: DatabaseService,
    private readonly repository: TasksSchedulerRepository,
    private readonly outbox: OutboxWriterService,
  ) {}

  onModuleInit(): void {
    this.timer = setInterval(() => {
      void this.tick();
    }, SCAN_INTERVAL_MS);
  }

  onModuleDestroy(): void {
    if (this.timer) clearInterval(this.timer);
  }

  private async tick(): Promise<void> {
    if (this.ticking) return; // A slow scan must finish before the next tick starts another.
    this.ticking = true;
    try {
      const asOf = new Date();
      // Query overdue candidates BEFORE the due loop below writes any new
      // claims. Reading the overdue query first means it can only ever see
      // a task.due claim written on a strictly earlier tick - never one
      // this same tick is about to write - so a task crossing its deadline
      // right now always waits at least one full scan interval before
      // TASK_OVERDUE can fire, and never fires in the same tick as
      // TASK_DUE (including the catch-up case after downtime, which now
      // splits across two ticks the same way instead of firing together).
      const overdueCandidates = await this.repository.findOverdueCandidates(
        asOf,
        TASK_DUE_RULE.name,
        TASK_DUE_RULE.version,
      );
      for (const task of overdueCandidates) {
        await this.claimAndFire(TASK_OVERDUE_RULE, "task.overdue", task);
      }
      const dueCandidates = await this.repository.findDueCandidates(asOf);
      for (const task of dueCandidates) {
        await this.claimAndFire(TASK_DUE_RULE, "task.due", task);
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      this.logger.error(`task scheduler tick failed: ${message}`);
    } finally {
      this.ticking = false;
    }
  }

  private async claimAndFire(
    rule: { name: string; version: number },
    eventName: "task.due" | "task.overdue",
    task: DueTaskCandidate,
  ): Promise<void> {
    await this.db.$transaction(async (tx) => {
      const claimed = await this.repository.tryClaim(tx, {
        ruleName: rule.name,
        ruleVersion: rule.version,
        resourceId: task.id,
        scheduledFor: task.dueAt,
      });
      if (!claimed) return;
      await this.outbox.append(tx, {
        name: eventName,
        version: 1,
        actorKind: OutboxActorKind.SYSTEM,
        resourceType: "task",
        resourceId: task.id,
        payload: { occurrenceKey: occurrenceKey(rule, task.id, task.dueAt) },
        consumers: [{ consumerName: "notifications", consumerVersion: 1 }],
      });
    });
  }
}
