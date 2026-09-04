import {
  Inject,
  Injectable,
  Logger,
  type OnApplicationShutdown,
} from "@nestjs/common";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../generated/prisma/client.js";

import { ENVIRONMENT, type Environment } from "../config/environment.js";

@Injectable()
export class DatabaseService
  extends PrismaClient
  implements OnApplicationShutdown
{
  private readonly logger = new Logger(DatabaseService.name);

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
  }

  async ping(): Promise<void> {
    await this.$queryRaw`SELECT 1`;
  }

  async onApplicationShutdown(): Promise<void> {
    await this.$disconnect();
    this.logger.log("PostgreSQL connection pool closed");
  }
}
