import { Injectable } from "@nestjs/common";

import { DatabaseService } from "../../database/database.service.js";
import type { Prisma } from "../../generated/prisma/client.js";

export interface TodoReminderCandidate {
  id: string;
  todoId: string;
  reminderAt: Date;
}

@Injectable()
export class TodoSchedulerRepository {
  constructor(private readonly db: DatabaseService) {}

  async findReminderCandidates(asOf: Date): Promise<TodoReminderCandidate[]> {
    return this.db.todoReminder.findMany({
      where: { sent: false, reminderAt: { lte: asOf } },
      select: { id: true, todoId: true, reminderAt: true },
    });
  }

  /**
   * Claims one reminder row by flipping `sent` atomically - the single
   * `UPDATE ... WHERE id = ? AND sent = false` is itself the race-safety
   * mechanism (same as `ScheduledOccurrenceClaim`'s unique index gives
   * Meetings/Tasks their safety), so no separate claim table is needed here:
   * `TodoReminder.sent` already exists for exactly this purpose.
   */
  async tryClaim(
    tx: Prisma.TransactionClient,
    candidate: TodoReminderCandidate,
  ): Promise<boolean> {
    const result = await tx.todoReminder.updateMany({
      where: { id: candidate.id, sent: false },
      data: { sent: true },
    });
    return result.count === 1;
  }
}
