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

import { LivenessResponse, ReadinessResponse } from "./health.contracts.js";
import { HealthService } from "./health.service.js";

@ApiTags("Health")
@Controller({ path: "health", version: VERSION_NEUTRAL })
export class HealthController {
  constructor(private readonly healthService: HealthService) {}

  @Get("live")
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: "Verify that the API process is running" })
  @ApiOkResponse({ type: LivenessResponse })
  getLiveness(): LivenessResponse {
    return { status: "ok", timestamp: new Date().toISOString() };
  }

  @Get("ready")
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: "Verify that PostgreSQL is ready" })
  @ApiOkResponse({ type: ReadinessResponse })
  @ApiServiceUnavailableResponse({
    description: "PostgreSQL is unavailable",
  })
  getReadiness(): Promise<ReadinessResponse> {
    return this.healthService.getReadiness();
  }
}
