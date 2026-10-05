import { Controller, Get, Header, Query, Req, UseGuards } from "@nestjs/common";
import {
  ApiBadRequestResponse,
  ApiCookieAuth,
  ApiForbiddenResponse,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiOperation,
  ApiServiceUnavailableResponse,
  ApiTags,
  ApiUnauthorizedResponse,
} from "@nestjs/swagger";
import { unauthenticated } from "../auth/auth.errors.js";
import { AccessTokenGuard } from "../auth/guards/access-token.guard.js";
import { ProblemDetails } from "../common/http/problem-details.js";
import type { RequestWithContext } from "../common/http/request-with-context.js";
import { RequirePermissions } from "../common/security/permissions.decorator.js";
import { PermissionsGuard } from "../common/security/permissions.guard.js";
import {
  AnalyticsPeriodDto,
  CampaignAnalyticsDto,
  DepartmentAnalyticsDto,
  EmployeeAnalyticsDto,
  EventAnalyticsDto,
  PromotionAnalyticsDto,
} from "./analytics.dto.js";
import {
  MonthlyAnalyticsResponse,
  ProgressAnalyticsPageResponse,
  PromotionAnalyticsResponse,
  TaskAnalyticsResponse,
  WorkAnalyticsPageResponse,
} from "./analytics.contracts.js";
import { AnalyticsService } from "./analytics.service.js";

function userId(req: RequestWithContext) {
  if (!req.user?.userId) throw unauthenticated();
  return req.user.userId;
}
@ApiTags("Analytics")
@ApiCookieAuth("access_token")
@ApiUnauthorizedResponse({ type: ProblemDetails })
@ApiForbiddenResponse({ type: ProblemDetails })
@ApiBadRequestResponse({ type: ProblemDetails })
@ApiServiceUnavailableResponse({ type: ProblemDetails })
@UseGuards(AccessTokenGuard, PermissionsGuard)
@Controller("analytics")
export class AnalyticsController {
  constructor(private readonly analytics: AnalyticsService) {}
  @Get("task-completion")
  @Header("Cache-Control", "no-store")
  @RequirePermissions("analytics.management.read")
  @ApiOperation({
    summary:
      "Current task counts and completion rate for a UTC creation cohort",
  })
  @ApiOkResponse({ type: TaskAnalyticsResponse })
  tasks(@Req() req: RequestWithContext, @Query() query: AnalyticsPeriodDto) {
    return this.analytics.taskCompletion(userId(req), query);
  }
  @Get("departments")
  @Header("Cache-Control", "no-store")
  @RequirePermissions("analytics.department_performance.read")
  @ApiOperation({
    summary: "Paginated task performance for permitted departments",
  })
  @ApiOkResponse({ type: WorkAnalyticsPageResponse })
  departments(
    @Req() req: RequestWithContext,
    @Query() query: DepartmentAnalyticsDto,
  ) {
    return this.analytics.departmentPerformance(userId(req), query);
  }
  @Get("employees")
  @Header("Cache-Control", "no-store")
  @RequirePermissions("analytics.employee_performance.read")
  @ApiOperation({
    summary:
      "Paginated employee assignment counts, not additive employee scores",
  })
  @ApiOkResponse({ type: WorkAnalyticsPageResponse })
  employees(
    @Req() req: RequestWithContext,
    @Query() query: EmployeeAnalyticsDto,
  ) {
    return this.analytics.employeePerformance(userId(req), query);
  }
  @Get("events")
  @Header("Cache-Control", "no-store")
  @RequirePermissions("analytics.management.read")
  @ApiOperation({ summary: "Paginated current event-workspace task progress" })
  @ApiOkResponse({ type: ProgressAnalyticsPageResponse })
  events(@Req() req: RequestWithContext, @Query() query: EventAnalyticsDto) {
    return this.analytics.eventProgress(userId(req), query);
  }
  @Get("campaigns")
  @Header("Cache-Control", "no-store")
  @RequirePermissions("analytics.management.read")
  @ApiOperation({
    summary:
      "Paginated current campaign activity progress; marketing by default",
  })
  @ApiOkResponse({ type: ProgressAnalyticsPageResponse })
  campaigns(
    @Req() req: RequestWithContext,
    @Query() query: CampaignAnalyticsDto,
  ) {
    return this.analytics.campaignProgress(userId(req), query);
  }
  @Get("promotion")
  @Header("Cache-Control", "no-store")
  @RequirePermissions("analytics.management.read")
  @ApiOperation({
    summary: "Current delivery progress by channel for one promotion campaign",
  })
  @ApiOkResponse({ type: PromotionAnalyticsResponse })
  @ApiNotFoundResponse({ type: ProblemDetails })
  promotion(
    @Req() req: RequestWithContext,
    @Query() query: PromotionAnalyticsDto,
  ) {
    return this.analytics.promotionPerformance(userId(req), query);
  }
  @Get("monthly-activity")
  @Header("Cache-Control", "no-store")
  @RequirePermissions("analytics.management.read")
  @ApiOperation({
    summary:
      "Up to twelve UTC monthly creation buckets and task-completion throughput",
  })
  @ApiOkResponse({ type: MonthlyAnalyticsResponse })
  monthly(@Req() req: RequestWithContext, @Query() query: AnalyticsPeriodDto) {
    return this.analytics.monthlyActivity(userId(req), query);
  }
}
