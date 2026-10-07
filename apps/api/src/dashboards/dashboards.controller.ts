import { Controller, Get, Header, Query, Req, UseGuards } from "@nestjs/common";
import {
  ApiTags,
  ApiCookieAuth,
  ApiExtraModels,
  ApiOkResponse,
  ApiOperation,
  ApiBadRequestResponse,
  ApiUnauthorizedResponse,
  ApiForbiddenResponse,
  ApiServiceUnavailableResponse,
} from "@nestjs/swagger";
import { AccessTokenGuard } from "../auth/guards/access-token.guard.js";
import { unauthenticated } from "../auth/auth.errors.js";
import { PermissionsGuard } from "../common/security/permissions.guard.js";
import { RequirePermissions } from "../common/security/permissions.decorator.js";
import type { RequestWithContext } from "../common/http/request-with-context.js";
import { ProblemDetails } from "../common/http/problem-details.js";
import {
  DashboardQueryDto,
  ManagementDashboardQueryDto,
} from "./dashboards.dto.js";
import { DashboardResponse, dashboardModels } from "./dashboards.contracts.js";
import { DashboardsService } from "./dashboards.service.js";
@ApiTags("Dashboards")
@ApiCookieAuth("access_token")
@ApiExtraModels(...dashboardModels)
@ApiBadRequestResponse({ type: ProblemDetails })
@ApiUnauthorizedResponse({ type: ProblemDetails })
@ApiForbiddenResponse({ type: ProblemDetails })
@ApiServiceUnavailableResponse({ type: ProblemDetails })
@UseGuards(AccessTokenGuard, PermissionsGuard)
@Controller("dashboards")
export class DashboardsController {
  constructor(private readonly dashboards: DashboardsService) {}
  @Get("management")
  @Header("Cache-Control", "no-store")
  @RequirePermissions("dashboard.management.read")
  @ApiOperation({
    summary:
      "Permission-safe management dashboard; card failures are isolated.",
  })
  @ApiOkResponse({ type: DashboardResponse })
  management(
    @Req() req: RequestWithContext,
    @Query() query: ManagementDashboardQueryDto,
  ) {
    if (!req.user?.userId) throw unauthenticated();
    return this.dashboards.read(req.user.userId, "management", query, req.id);
  }
  @Get("employee")
  @Header("Cache-Control", "no-store")
  @RequirePermissions("dashboard.read")
  @ApiOperation({
    summary:
      "Caller-only actionable dashboard; never reads another user's personal work.",
  })
  @ApiOkResponse({ type: DashboardResponse })
  employee(@Req() req: RequestWithContext, @Query() query: DashboardQueryDto) {
    if (!req.user?.userId) throw unauthenticated();
    return this.dashboards.read(req.user.userId, "employee", query, req.id);
  }
}
