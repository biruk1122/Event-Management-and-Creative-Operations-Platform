import { Injectable } from "@nestjs/common";
import { DatabaseService } from "../database/database.service.js";
import { idPage, type ReadPage } from "../database/read-models.js";
import { Prisma } from "../generated/prisma/client.js";

@Injectable()
export class DepartmentsAnalyticsQuery {
  constructor(private readonly db: DatabaseService) {}
  page(page: ReadPage, filterId?: string, ownDepartment?: string | null) {
    return idPage(
      this.db,
      Prisma.sql`departments`,
      Prisma.sql`id`,
      Prisma.sql`
      ${filterId ? Prisma.sql`id = ${filterId}::uuid` : Prisma.sql`true`} AND
      ${ownDepartment === undefined ? Prisma.sql`true` : ownDepartment === null ? Prisma.sql`false` : Prisma.sql`id = ${ownDepartment}::uuid`}`,
      page,
    );
  }
}
