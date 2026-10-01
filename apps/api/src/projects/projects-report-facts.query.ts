import { Injectable } from "@nestjs/common";

import { DatabaseService } from "../database/database.service.js";
import { ProjectStatus, type Prisma } from "../generated/prisma/client.js";

/** Read-only reporting projection over Projects' authoritative lifecycle. */
@Injectable()
export class ProjectsReportFactsQuery {
  constructor(private readonly db: DatabaseService) {}

  async forAuthor(authorId: string) {
    const owner: Prisma.ProjectWhereInput = {
      OR: [{ createdById: authorId }, { workspace: { managerId: authorId } }],
    };
    const [totalNow, completedNow, activeNow] = await Promise.all([
      this.db.project.count({
        where: { ...owner, status: { not: ProjectStatus.CANCELLED } },
      }),
      this.db.project.count({
        where: { ...owner, status: ProjectStatus.COMPLETED },
      }),
      this.db.project.count({
        where: { ...owner, status: ProjectStatus.ACTIVE },
      }),
    ]);
    return { totalNow, completedNow, activeNow };
  }
}
