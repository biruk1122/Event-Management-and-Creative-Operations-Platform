import { Injectable } from "@nestjs/common";

import { MeetingStatus, Prisma } from "../../generated/prisma/client.js";
import { DatabaseService } from "../../database/database.service.js";

export interface MeetingReminderCandidate {
  id: string;
  reminderAt: Date;
}

@Injectable()
export class MeetingsSchedulerRepository {
  constructor(private readonly db: DatabaseService) {}

  async findReminderCandidates(
    asOf: Date,
  ): Promise<MeetingReminderCandidate[]> {
    const rows = await this.db.meeting.findMany({
      where: {
        status: MeetingStatus.SCHEDULED,
        reminderAt: { not: null, lte: asOf },
      },
      select: { id: true, reminderAt: true },
    });
    return rows.map((row) => ({ id: row.id, reminderAt: row.reminderAt! }));
  }

  async tryClaim(
    tx: Prisma.TransactionClient,
    meeting: MeetingReminderCandidate,
  ): Promise<boolean> {
    try {
      await tx.scheduledOccurrenceClaim.create({
        data: {
          ruleName: "meeting.reminder",
          ruleVersion: 1,
          resourceId: meeting.id,
          scheduledFor: meeting.reminderAt,
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
