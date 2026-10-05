import { Injectable } from "@nestjs/common";
import { DatabaseService } from "../database/database.service.js";
import {
  creationCounts,
  idPage,
  type Identity,
  type ReadPage,
  type ReadPeriod,
} from "../database/read-models.js";
import { Prisma } from "../generated/prisma/client.js";

@Injectable()
export class EventsAnalyticsQuery {
  constructor(private readonly db: DatabaseService) {}
  page(page: ReadPage, id?: string) {
    return idPage<Identity & { workspaceId: string }>(
      this.db,
      Prisma.sql`events`,
      Prisma.sql`id, workspace_id AS "workspaceId"`,
      id ? Prisma.sql`id = ${id}::uuid` : Prisma.sql`true`,
      page,
    );
  }
  creation(period: ReadPeriod) {
    return creationCounts(this.db, Prisma.sql`events`, period);
  }
}
