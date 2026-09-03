import {
  Injectable,
  Logger,
  ServiceUnavailableException,
} from "@nestjs/common";

import { DatabaseService } from "../database/database.service.js";
import { ReadinessResponse } from "./health.contracts.js";

@Injectable()
export class HealthService {
  private readonly logger = new Logger(HealthService.name);

  constructor(private readonly database: DatabaseService) {}

  async getReadiness(): Promise<ReadinessResponse> {
    try {
      await this.database.ping();
    } catch {
      this.logger.warn("PostgreSQL readiness check failed");
      throw new ServiceUnavailableException({
        code: "DATABASE_UNAVAILABLE",
        detail: "The database is not ready to accept requests.",
        error: "Service Unavailable",
      });
    }

    return {
      checks: { database: "up" },
      status: "ready",
      timestamp: new Date().toISOString(),
    };
  }
}
