import {
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  VERSION_NEUTRAL,
} from "@nestjs/common";
import {
  ApiOkResponse,
  ApiOperation,
  ApiServiceUnavailableResponse,
  ApiTags,
} from "@nestjs/swagger";

import { HealthService, type ReadinessResponse } from "./health.service.js";

interface LivenessResponse {
  status: "ok";
  timestamp: string;
}

@ApiTags("Health")
@Controller({ path: "health", version: VERSION_NEUTRAL })
export class HealthController {
  constructor(private readonly healthService: HealthService) {}

  @Get("live")
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: "Verify that the API process is running" })
  @ApiOkResponse({
    schema: {
      example: { status: "ok", timestamp: "2026-09-01T09:00:00.000Z" },
      properties: {
        status: { enum: ["ok"], type: "string" },
        timestamp: { format: "date-time", type: "string" },
      },
      required: ["status", "timestamp"],
      type: "object",
    },
  })
  getLiveness(): LivenessResponse {
    return { status: "ok", timestamp: new Date().toISOString() };
  }

  @Get("ready")
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: "Verify that PostgreSQL is ready" })
  @ApiOkResponse({
    schema: {
      example: {
        checks: { database: "up" },
        status: "ready",
        timestamp: "2026-09-01T09:00:00.000Z",
      },
      properties: {
        checks: {
          properties: { database: { enum: ["up"], type: "string" } },
          required: ["database"],
          type: "object",
        },
        status: { enum: ["ready"], type: "string" },
        timestamp: { format: "date-time", type: "string" },
      },
      required: ["checks", "status", "timestamp"],
      type: "object",
    },
  })
  @ApiServiceUnavailableResponse({
    description: "PostgreSQL is unavailable",
  })
  getReadiness(): Promise<ReadinessResponse> {
    return this.healthService.getReadiness();
  }
}
