import { Injectable } from "@nestjs/common";
import { DatabaseService } from "../database/database.service.js";
import { Prisma } from "../generated/prisma/client.js";
import {
  sourceScope,
  type ReadContext,
} from "../common/queries/operational-read.js";
@Injectable()
export class TalentDashboardQuery {
  constructor(private readonly db: DatabaseService) {}
  async count(ctx: ReadContext) {
    const scope = sourceScope(ctx, "talent.read", ["organization"]);
    const [data] = await this.db.readModel<{ count: number }>(
      Prisma.sql`SELECT count(*)::int AS count FROM talents WHERE availability <> 'INACTIVE'`,
    );
    return { scope, data: data! };
  }
}
