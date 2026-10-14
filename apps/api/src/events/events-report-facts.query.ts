import { Injectable } from "@nestjs/common";

import { DatabaseService } from "../database/database.service.js";
import { TaskStatus } from "../generated/prisma/client.js";

/** Read-only reporting projection for one event's workspace (EOM-01
 * post-event reports). Event rows and their task counts remain owned by
 * Events/Tasks; nothing here is copied into the report row itself. */
@Injectable()
export class EventsReportFactsQuery {
  constructor(private readonly db: DatabaseService) {}

  async forWorkspace(workspaceId: string) {
    const exists =
      (await this.db.event.count({ where: { workspaceId } })) === 1;
    if (!exists) return null;
    const [totalTasksNow, completedTasksNow] = await Promise.all([
      this.db.task.count({ where: { workspaceId } }),
      this.db.task.count({
        where: { workspaceId, status: TaskStatus.COMPLETED },
      }),
    ]);
    return {
      totalTasksNow,
      completedTasksNow,
      incompleteTasksNow: totalTasksNow - completedTasksNow,
    };
  }
}
