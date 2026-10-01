import {
  Body,
  Controller,
  Get,
  Header,
  HttpCode,
  HttpStatus,
  Param,
  Patch,
  Post,
  Query,
  Req,
  UseGuards,
} from "@nestjs/common";
import {
  ApiBadRequestResponse,
  ApiConflictResponse,
  ApiCookieAuth,
  ApiCreatedResponse,
  ApiForbiddenResponse,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiOperation,
  ApiProduces,
  ApiSecurity,
  ApiTags,
  ApiUnauthorizedResponse,
} from "@nestjs/swagger";

import { unauthenticated } from "../auth/auth.errors.js";
import { AccessTokenGuard } from "../auth/guards/access-token.guard.js";
import { CsrfGuard } from "../auth/guards/csrf.guard.js";
import { ProblemDetails } from "../common/http/problem-details.js";
import type { RequestWithContext } from "../common/http/request-with-context.js";
import { RequirePermissions } from "../common/security/permissions.decorator.js";
import { PermissionsGuard } from "../common/security/permissions.guard.js";
import { ListReportsQueryDto } from "./dto/list-reports-query.dto.js";
import {
  CreateReportDto,
  ReviewReportDto,
  UpdateReportDto,
} from "./dto/report-input.dto.js";
import {
  PaginatedReportsResponse,
  ReportDetailResponse,
  ReportResponse,
} from "./reports.contracts.js";
import { ReportsService } from "./reports.service.js";

function actingUserId(request: RequestWithContext): string {
  if (!request.user?.userId) throw unauthenticated();
  return request.user.userId;
}

@ApiTags("Reports")
@ApiCookieAuth("access_token")
@ApiUnauthorizedResponse({ type: ProblemDetails })
@ApiForbiddenResponse({ type: ProblemDetails })
@UseGuards(AccessTokenGuard, PermissionsGuard)
@Controller("reports")
export class ReportsController {
  constructor(private readonly reports: ReportsService) {}

  @Get()
  @RequirePermissions("report.read")
  @ApiOperation({
    summary: "List reports visible to the caller, with bounded filters",
  })
  @ApiOkResponse({ type: PaginatedReportsResponse })
  @ApiBadRequestResponse({ type: ProblemDetails })
  list(
    @Req() req: RequestWithContext,
    @Query() query: ListReportsQueryDto,
  ): Promise<PaginatedReportsResponse> {
    return this.reports.list(actingUserId(req), query);
  }

  @Get(":id")
  @RequirePermissions("report.read")
  @ApiOperation({ summary: "Get a report and its review history" })
  @ApiOkResponse({ type: ReportDetailResponse })
  @ApiNotFoundResponse({ type: ProblemDetails })
  get(
    @Req() req: RequestWithContext,
    @Param("id") id: string,
  ): Promise<ReportDetailResponse> {
    return this.reports.get(actingUserId(req), id);
  }

  @Get(":id/export")
  @RequirePermissions("report.read")
  @Header("Content-Type", "application/json; charset=utf-8")
  @Header("Content-Disposition", 'attachment; filename="report.json"')
  @ApiProduces("application/json")
  @ApiOperation({ summary: "Export an authorized report snapshot as JSON" })
  @ApiOkResponse({
    type: ReportDetailResponse,
    description: "JSON report snapshot",
  })
  @ApiNotFoundResponse({ type: ProblemDetails })
  export(
    @Req() req: RequestWithContext,
    @Param("id") id: string,
  ): Promise<string> {
    return this.reports.export(actingUserId(req), id, req.id);
  }

  @Post()
  @UseGuards(CsrfGuard)
  @ApiSecurity("csrf-token")
  @RequirePermissions("report.create")
  @ApiOperation({ summary: "Create a report draft for the acting author" })
  @ApiCreatedResponse({ type: ReportResponse })
  @ApiBadRequestResponse({ type: ProblemDetails })
  @ApiConflictResponse({ type: ProblemDetails })
  create(
    @Req() req: RequestWithContext,
    @Body() body: CreateReportDto,
  ): Promise<ReportResponse> {
    return this.reports.create(actingUserId(req), body);
  }

  @Patch(":id")
  @UseGuards(CsrfGuard)
  @ApiSecurity("csrf-token")
  @RequirePermissions("report.create")
  @ApiOperation({
    summary: "Edit the author's draft or changes-requested report",
  })
  @ApiOkResponse({ type: ReportResponse })
  @ApiBadRequestResponse({ type: ProblemDetails })
  @ApiConflictResponse({ type: ProblemDetails })
  update(
    @Req() req: RequestWithContext,
    @Param("id") id: string,
    @Body() body: UpdateReportDto,
  ): Promise<ReportResponse> {
    return this.reports.update(actingUserId(req), id, body);
  }

  @Post(":id/submit")
  @HttpCode(HttpStatus.OK)
  @UseGuards(CsrfGuard)
  @ApiSecurity("csrf-token")
  @RequirePermissions("report.submit")
  @ApiOperation({ summary: "Submit the author's complete report for review" })
  @ApiOkResponse({ type: ReportResponse })
  @ApiBadRequestResponse({ type: ProblemDetails })
  @ApiConflictResponse({ type: ProblemDetails })
  submit(
    @Req() req: RequestWithContext,
    @Param("id") id: string,
  ): Promise<ReportResponse> {
    return this.reports.submit(actingUserId(req), id, req.id);
  }

  @Post(":id/reviews")
  @HttpCode(HttpStatus.OK)
  @UseGuards(CsrfGuard)
  @ApiSecurity("csrf-token")
  @RequirePermissions("report.review")
  @ApiOperation({ summary: "Review a submitted report or request changes" })
  @ApiOkResponse({ type: ReportResponse })
  @ApiConflictResponse({ type: ProblemDetails })
  review(
    @Req() req: RequestWithContext,
    @Param("id") id: string,
    @Body() body: ReviewReportDto,
  ): Promise<ReportResponse> {
    return this.reports.review(actingUserId(req), id, body, req.id);
  }
}
