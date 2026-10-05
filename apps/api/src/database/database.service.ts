import {
  Inject,
  Injectable,
  Logger,
  type OnApplicationShutdown,
} from "@nestjs/common";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient, type Prisma } from "../generated/prisma/client.js";

import { ENVIRONMENT, type Environment } from "../config/environment.js";

@Injectable()
export class DatabaseService
  extends PrismaClient
  implements OnApplicationShutdown
{
  private readonly logger = new Logger(DatabaseService.name);
  private readonly readSchema: string;

  constructor(@Inject(ENVIRONMENT) environment: Environment) {
    // The pg driver adapter ignores the `?schema=` connection parameter, so the
    // schema is passed explicitly.
    const schema =
      new URL(environment.DATABASE_URL).searchParams.get("schema") ?? undefined;
    super({
      adapter: new PrismaPg(
        { connectionString: environment.DATABASE_URL },
        schema ? { schema } : undefined,
      ),
    });
    this.readSchema = schema ?? "public";
  }

  /** A source-owned aggregate read, with transaction-local schema and timeout. */
  async readModel<T>(query: Prisma.Sql): Promise<T[]> {
    return this.$transaction(
      async (tx) => {
        const quotedSchema = `"${this.readSchema.replaceAll('"', '""')}"`;
        await tx.$queryRaw`SELECT set_config('statement_timeout', '500ms', true),
        set_config('search_path', ${quotedSchema}, true)`;
        return tx.$queryRaw<T[]>(query);
      },
      { maxWait: 1000, timeout: 2000 },
    );
  }

  async ping(): Promise<void> {
    await this.$queryRaw`SELECT 1`;
  }

  async onApplicationShutdown(): Promise<void> {
    await this.$disconnect();
    this.logger.log("PostgreSQL connection pool closed");
  }
}
