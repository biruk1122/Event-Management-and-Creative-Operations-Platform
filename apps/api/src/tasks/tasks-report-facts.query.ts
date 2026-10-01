import { Injectable } from "@nestjs/common";

import { DatabaseService } from "../database/database.service.js";
import {
  TaskActivityType,
  TaskStatus,
  type Prisma,
} from "../generated/prisma/client.js";

/** Read-only reporting projection. Task rows and status history remain owned by Tasks. */
@Injectable()
export class TasksReportFactsQuery {
  constructor(private readonly db: DatabaseService) {}

  async forAuthor(authorId: string, from: Date, toExclusive: Date, asOf: Date) {
    const owner: Prisma.TaskWhereInput = {
      OR: [
        { createdById: authorId },
        { assignments: { some: { userId: authorId } } },
      ],
    };
    const [completedInPeriod, inProgressNow, pendingNow, overdueNow] =
      await Promise.all([
        this.db.task.count({
          where: {
            ...owner,
            activities: {
              some: {
                type: TaskActivityType.STATUS_CHANGED,
                occurredAt: { gte: from, lt: toExclusive },
                details: { path: ["to"], equals: TaskStatus.COMPLETED },
              },
            },
          },
        }),
        this.db.task.count({
          where: { ...owner, status: TaskStatus.IN_PROGRESS },
        }),
        this.db.task.count({
          where: {
            ...owner,
            status: {
              in: [
                TaskStatus.TODO,
                TaskStatus.IN_PROGRESS,
                TaskStatus.UNDER_REVIEW,
                TaskStatus.BLOCKED,
              ],
            },
          },
        }),
        this.db.task.count({
          where: {
            ...owner,
            dueAt: { lt: asOf },
            status: {
              in: [
                TaskStatus.TODO,
                TaskStatus.IN_PROGRESS,
                TaskStatus.UNDER_REVIEW,
                TaskStatus.BLOCKED,
              ],
            },
          },
        }),
      ]);
    return { completedInPeriod, inProgressNow, pendingNow, overdueNow };
  }
}
