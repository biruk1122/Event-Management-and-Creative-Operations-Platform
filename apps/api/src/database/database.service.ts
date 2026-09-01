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
    super({
      adapter: new PrismaPg({ connectionString: environment.DATABASE_URL }),
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
