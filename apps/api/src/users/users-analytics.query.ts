import { Injectable } from "@nestjs/common";
import { DatabaseService } from "../database/database.service.js";
import { idPage, type ReadPage } from "../database/read-models.js";
import { Prisma } from "../generated/prisma/client.js";

@Injectable()
export class UsersAnalyticsQuery {
  constructor(private readonly db: DatabaseService) {}
  async departmentOf(userId: string): Promise<string | null> {
    const [user] = await this.db.readModel<{ department_id: string | null }>(
      Prisma.sql`SELECT department_id FROM users WHERE id = ${userId}::uuid`,
    );
    return user?.department_id ?? null;
  }
  page(page: ReadPage, id?: string) {
    return idPage(
      this.db,
      Prisma.sql`users`,
      Prisma.sql`id`,
      id ? Prisma.sql`id = ${id}::uuid` : Prisma.sql`true`,
      page,
    );
  }
}
