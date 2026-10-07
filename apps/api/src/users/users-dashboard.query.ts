import { Injectable } from "@nestjs/common";
import { DatabaseService } from "../database/database.service.js";
import { Prisma } from "../generated/prisma/client.js";
import {
  sourceScope,
  type ReadContext,
} from "../common/queries/operational-read.js";
@Injectable()
export class UsersDashboardQuery {
  constructor(private readonly db: DatabaseService) {}
  async count(ctx: ReadContext) {
    const scope = sourceScope(ctx, "user.read", ["organization"]);
    const [data] = await this.db.readModel<{ count: number }>(
      Prisma.sql`SELECT count(*)::int AS count FROM users WHERE status='ACTIVE'`,
    );
    return { scope, data: data! };
  }
}
