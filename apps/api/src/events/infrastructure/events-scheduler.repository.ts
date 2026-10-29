import { Injectable } from "@nestjs/common";

import { EventStatus, Prisma } from "../../generated/prisma/client.js";
import { DatabaseService } from "../../database/database.service.js";

export interface EventReminderCandidate {
  id: string;
  reminderAt: Date;
}

@Injectable()
export class EventsSchedulerRepository {
  constructor(private readonly db: DatabaseService) {}

  async findReminderCandidates(asOf: Date): Promise<EventReminderCandidate[]> {
    const rows = await this.db.event.findMany({
      where: {
        status: { notIn: [EventStatus.COMPLETED, EventStatus.CANCELLED] },
        reminderAt: { not: null, lte: asOf },
      },
      select: { id: true, reminderAt: true },
    });
    return rows.map((row) => ({ id: row.id, reminderAt: row.reminderAt! }));
  }

  async tryClaim(
    tx: Prisma.TransactionClient,
    event: EventReminderCandidate,
  ): Promise<boolean> {
    try {
      await tx.scheduledOccurrenceClaim.create({
        data: {
          ruleName: "event.reminder",
          ruleVersion: 1,
          resourceId: event.id,
          scheduledFor: event.reminderAt,
        },
        select: { id: true },
      });
      return true;
    } catch (error) {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === "P2002"
      )
        return false;
      throw error;
    }
  }
}
