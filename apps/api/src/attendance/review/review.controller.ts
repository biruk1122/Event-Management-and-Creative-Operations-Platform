import {
  Body,
  Controller,
  Delete,
  Get,
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
  ApiCookieAuth,
  ApiConflictResponse,
  ApiCreatedResponse,
  ApiForbiddenResponse,
  ApiNoContentResponse,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiOperation,
  ApiSecurity,
  ApiTags,
  ApiUnauthorizedResponse,
} from "@nestjs/swagger";

import { unauthenticated } from "../../auth/auth.errors.js";
import { AccessTokenGuard } from "../../auth/guards/access-token.guard.js";
import { CsrfGuard } from "../../auth/guards/csrf.guard.js";
import { ProblemDetails } from "../../common/http/problem-details.js";
import type { RequestWithContext } from "../../common/http/request-with-context.js";
import { RequirePermissions } from "../../common/security/permissions.decorator.js";
import { PermissionsGuard } from "../../common/security/permissions.guard.js";
import { AttendanceSessionResponse } from "../attendance.contracts.js";
import { AttendanceSessionsQueryDto } from "./dto/attendance-sessions-query.dto.js";
import { AttendanceSummaryQueryDto } from "./dto/attendance-summary-query.dto.js";
import { CreateHolidayDto } from "./dto/create-holiday.dto.js";
import { CreateWeekdayScheduleDto } from "./dto/create-weekday-schedule.dto.js";
import { DecideExceptionDto } from "./dto/decide-exception.dto.js";
import { DecideOvertimeDto } from "./dto/decide-overtime.dto.js";
import { ListExceptionsQueryDto } from "./dto/list-exceptions-query.dto.js";
import { ListOvertimeQueryDto } from "./dto/list-overtime-query.dto.js";
import { UpdateHolidayDto } from "./dto/update-holiday.dto.js";
import {
  AttendanceExceptionResponse,
  AttendanceHolidayResponse,
  AttendanceSummaryResponse,
  AttendanceWeekdayScheduleResponse,
  OvertimeApprovalResponse,
} from "./review.contracts.js";
import { AttendanceReviewService } from "./review.service.js";

function actingUserId(request: RequestWithContext): string {
  if (!request.user?.userId) throw unauthenticated();
  return request.user.userId;
}

/**
 * Overtime and exception review. Self-approval is refused in the service
 * layer regardless of the caller's scope - never bypassable from here.
 */
@ApiTags("Attendance: Review")
@ApiCookieAuth("access_token")
@ApiUnauthorizedResponse({ type: ProblemDetails })
@ApiForbiddenResponse({ type: ProblemDetails })
@ApiNotFoundResponse({ type: ProblemDetails })
@UseGuards(AccessTokenGuard, PermissionsGuard)
@Controller("attendance")
export class AttendanceReviewController {
  constructor(private readonly review: AttendanceReviewService) {}

  @Get("overtime")
  @RequirePermissions("attendance.overtime.review")
  @ApiOperation({ summary: "List overtime approvals visible to the caller" })
  @ApiOkResponse({ type: [OvertimeApprovalResponse] })
  listOvertime(
    @Req() req: RequestWithContext,
    @Query() query: ListOvertimeQueryDto,
  ): Promise<OvertimeApprovalResponse[]> {
    return this.review.listOvertime(actingUserId(req), query.status);
  }

  @Patch("overtime/:id")
  @UseGuards(CsrfGuard)
  @ApiSecurity("csrf-token")
  @RequirePermissions("attendance.overtime.review")
  @ApiOperation({ summary: "Approve or reject a potential-overtime review" })
  @ApiOkResponse({ type: OvertimeApprovalResponse })
  decideOvertime(
    @Req() req: RequestWithContext,
    @Param("id") id: string,
    @Body() body: DecideOvertimeDto,
  ): Promise<OvertimeApprovalResponse> {
    return this.review.decideOvertime(actingUserId(req), id, body, req.id);
  }

  @Get("exceptions")
  @RequirePermissions("attendance.exception.review")
  @ApiOperation({ summary: "List attendance exceptions visible to the caller" })
  @ApiOkResponse({ type: [AttendanceExceptionResponse] })
  listExceptions(
    @Req() req: RequestWithContext,
    @Query() query: ListExceptionsQueryDto,
  ): Promise<AttendanceExceptionResponse[]> {
    return this.review.listExceptions(actingUserId(req), query.status);
  }

  @Patch("exceptions/:id")
  @UseGuards(CsrfGuard)
  @ApiSecurity("csrf-token")
  @RequirePermissions("attendance.exception.review")
  @ApiOperation({ summary: "Approve or reject a flagged attendance exception" })
  @ApiOkResponse({ type: AttendanceExceptionResponse })
  decideException(
    @Req() req: RequestWithContext,
    @Param("id") id: string,
    @Body() body: DecideExceptionDto,
  ): Promise<AttendanceExceptionResponse> {
    return this.review.decideException(actingUserId(req), id, body, req.id);
  }

  @Get("reports/summary")
  @RequirePermissions("attendance.reports.read")
  @ApiOperation({ summary: "Per-employee attendance totals over a date range" })
  @ApiOkResponse({ type: [AttendanceSummaryResponse] })
  summarize(
    @Req() req: RequestWithContext,
    @Query() query: AttendanceSummaryQueryDto,
  ): Promise<AttendanceSummaryResponse[]> {
    return this.review.summarize(
      actingUserId(req),
      new Date(query.startDate),
      new Date(query.endDate),
    );
  }

  @Get("reports/sessions")
  @RequirePermissions("attendance.reports.read")
  @ApiOperation({
    summary:
      "Every individual check-in/check-out over a date range - visible only to Super Admin and the HR & Executive Officer department's manager",
  })
  @ApiOkResponse({ type: [AttendanceSessionResponse] })
  listDetailedSessions(
    @Req() req: RequestWithContext,
    @Query() query: AttendanceSessionsQueryDto,
  ): Promise<AttendanceSessionResponse[]> {
    return this.review.listDetailedSessions(
      actingUserId(req),
      new Date(query.startDate),
      new Date(query.endDate),
      query.employeeId,
    );
  }

  @Get("calendar/weekdays")
  @RequirePermissions("attendance.calendar.manage")
  @ApiOperation({
    summary:
      "Each weekday's current effective type - Super Admin and the HR & Executive Officer department's manager only",
  })
  @ApiOkResponse({ type: [AttendanceWeekdayScheduleResponse] })
  listWeekdaySchedule(
    @Req() req: RequestWithContext,
  ): Promise<AttendanceWeekdayScheduleResponse[]> {
    return this.review.listWeekdaySchedule(actingUserId(req));
  }

  @Post("calendar/weekdays")
  @UseGuards(CsrfGuard)
  @ApiSecurity("csrf-token")
  @RequirePermissions("attendance.calendar.manage")
  @ApiOperation({
    summary:
      "Change a weekday's type from an effective date forward - inserts a new effective-dated row, never overwrites history",
  })
  @ApiCreatedResponse({ type: AttendanceWeekdayScheduleResponse })
  @ApiConflictResponse({
    type: ProblemDetails,
    description: "A change for this weekday is already effective from that date",
  })
  createWeekdaySchedule(
    @Req() req: RequestWithContext,
    @Body() body: CreateWeekdayScheduleDto,
  ): Promise<AttendanceWeekdayScheduleResponse> {
    return this.review.createWeekdaySchedule(actingUserId(req), body, req.id);
  }

  @Get("calendar/holidays")
  @RequirePermissions("attendance.calendar.manage")
  @ApiOperation({
    summary:
      "List one-off holiday dates - Super Admin and the HR & Executive Officer department's manager only",
  })
  @ApiOkResponse({ type: [AttendanceHolidayResponse] })
  listHolidays(
    @Req() req: RequestWithContext,
  ): Promise<AttendanceHolidayResponse[]> {
    return this.review.listHolidays(actingUserId(req));
  }

  @Post("calendar/holidays")
  @UseGuards(CsrfGuard)
  @ApiSecurity("csrf-token")
  @RequirePermissions("attendance.calendar.manage")
  @ApiOperation({ summary: "Add a one-off holiday date" })
  @ApiCreatedResponse({ type: AttendanceHolidayResponse })
  @ApiConflictResponse({
    type: ProblemDetails,
    description: "A holiday is already recorded for that date",
  })
  createHoliday(
    @Req() req: RequestWithContext,
    @Body() body: CreateHolidayDto,
  ): Promise<AttendanceHolidayResponse> {
    return this.review.createHoliday(actingUserId(req), body, req.id);
  }

  @Patch("calendar/holidays/:id")
  @UseGuards(CsrfGuard)
  @ApiSecurity("csrf-token")
  @RequirePermissions("attendance.calendar.manage")
  @ApiOperation({ summary: "Edit a holiday's date and/or name" })
  @ApiOkResponse({ type: AttendanceHolidayResponse })
  @ApiConflictResponse({
    type: ProblemDetails,
    description: "A holiday is already recorded for that date",
  })
  updateHoliday(
    @Req() req: RequestWithContext,
    @Param("id") id: string,
    @Body() body: UpdateHolidayDto,
  ): Promise<AttendanceHolidayResponse> {
    return this.review.updateHoliday(actingUserId(req), id, body, req.id);
  }

  @Delete("calendar/holidays/:id")
  @HttpCode(HttpStatus.NO_CONTENT)
  @UseGuards(CsrfGuard)
  @ApiSecurity("csrf-token")
  @RequirePermissions("attendance.calendar.manage")
  @ApiOperation({ summary: "Remove a holiday" })
  @ApiNoContentResponse({ description: "The holiday was removed" })
  removeHoliday(
    @Req() req: RequestWithContext,
    @Param("id") id: string,
  ): Promise<void> {
    return this.review.removeHoliday(actingUserId(req), id, req.id);
  }
}
