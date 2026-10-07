import { AsyncLocalStorage } from "node:async_hooks";
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
  private readonly readBudget = new AsyncLocalStorage<{
    active: number;
    limit: number;
    waiting: Array<() => void>;
  }>();

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
    const budget = this.readBudget.getStore();
    if (budget) {
      if (budget.active >= budget.limit)
        await new Promise<void>((resolve) => budget.waiting.push(resolve));
      else budget.active++;
    }
    try {
      return await this.$transaction(
        async (tx) => {
          const quotedSchema = `"${this.readSchema.replaceAll('"', '""')}"`;
          await tx.$queryRaw`SELECT set_config('statement_timeout', '500ms', true),
        set_config('search_path', ${quotedSchema}, true)`;
          return tx.$queryRaw<T[]>(query);
        },
        { maxWait: 1000, timeout: 2000 },
      );
    } finally {
      if (budget) {
        budget.active--;
        const next = budget.waiting.shift();
        if (next) {
          budget.active++;
          next();
        }
      }
    }
  }

  /** Request-local bound also covers nested owner reads (e.g. monthly analytics). */
  withReadConcurrency<T>(limit: number, read: () => Promise<T>): Promise<T> {
    return this.readBudget.run({ active: 0, limit, waiting: [] }, read);
  }

  async ping(): Promise<void> {
    await this.$queryRaw`SELECT 1`;
  }

  async onApplicationShutdown(): Promise<void> {
    await this.$disconnect();
    this.logger.log("PostgreSQL connection pool closed");
  }
}
