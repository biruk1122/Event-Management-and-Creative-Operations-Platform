import { Injectable } from "@nestjs/common";
import { DatabaseService } from "../database/database.service.js";
import { creationCounts, type ReadPeriod } from "../database/read-models.js";
import { Prisma } from "../generated/prisma/client.js";

@Injectable()
export class ProjectsAnalyticsQuery {
  constructor(private readonly db: DatabaseService) {}
  creation(period: ReadPeriod) {
    return creationCounts(this.db, Prisma.sql`projects`, period);
  }
}
