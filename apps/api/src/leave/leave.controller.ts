import {
  Body,
  Controller,
  Get,
  Param,
  Patch,
  Post,
  Query,
  Req,
  UseGuards,
} from "@nestjs/common";
import {
  ApiCookieAuth,
  ApiCreatedResponse,
  ApiForbiddenResponse,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiOperation,
  ApiQuery,
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
import { CreateLeaveGrantDto } from "./dto/create-leave-grant.dto.js";
import { CreateLeaveRequestDto } from "./dto/create-leave-request.dto.js";
import { DecideLeaveRequestDto } from "./dto/decide-leave-request.dto.js";
import { LeaveCalendarQueryDto } from "./dto/leave-calendar-query.dto.js";
import { ListLeaveRequestsQueryDto } from "./dto/list-leave-requests-query.dto.js";
import {
  LeaveBalanceResponse,
  LeaveGrantResponse,
  LeaveRequestResponse,
} from "./leave.contracts.js";
import { LeaveService } from "./leave.service.js";

function actingUserId(request: RequestWithContext): string {
  if (!request.user?.userId) throw unauthenticated();
  return request.user.userId;
}

@ApiTags("Leave")
@ApiCookieAuth("access_token")
@ApiUnauthorizedResponse({ type: ProblemDetails })
@ApiForbiddenResponse({ type: ProblemDetails })
@UseGuards(AccessTokenGuard, PermissionsGuard)
@Controller("leave")
export class LeaveController {
  constructor(private readonly leave: LeaveService) {}

  @Post("grants")
  @UseGuards(CsrfGuard)
  @ApiSecurity("csrf-token")
  @RequirePermissions("leave.grant.manage")
  @ApiOperation({ summary: "Grant leave balance to an employee (HR bookkeeping, manual)" })
  @ApiCreatedResponse({ type: LeaveGrantResponse })
  grant(
    @Req() req: RequestWithContext,
    @Body() body: CreateLeaveGrantDto,
  ): Promise<LeaveGrantResponse> {
    return this.leave.grant(actingUserId(req), body, req.id);
  }

  @Get("grants")
  @RequirePermissions("leave.read")
  @ApiQuery({ name: "employeeId", required: true, type: String })
  @ApiQuery({ name: "leaveTypeId", required: false, type: String })
  @ApiOperation({ summary: "List an employee's leave grants" })
  @ApiOkResponse({ type: [LeaveGrantResponse] })
  listGrants(
    @Req() req: RequestWithContext,
    @Query("employeeId") employeeId: string,
    @Query("leaveTypeId") leaveTypeId?: string,
  ): Promise<LeaveGrantResponse[]> {
    return this.leave.listGrants(actingUserId(req), employeeId, leaveTypeId);
  }

  @Get("balance")
  @RequirePermissions("leave.read")
  @ApiQuery({ name: "employeeId", required: true, type: String })
  @ApiQuery({ name: "leaveTypeId", required: true, type: String })
  @ApiOperation({ summary: "Current remaining, non-expired balance for one leave type" })
  @ApiOkResponse({ type: LeaveBalanceResponse })
  balance(
    @Req() req: RequestWithContext,
    @Query("employeeId") employeeId: string,
    @Query("leaveTypeId") leaveTypeId: string,
  ): Promise<LeaveBalanceResponse> {
    return this.leave.balance(actingUserId(req), employeeId, leaveTypeId);
  }

  @Post("requests")
  @UseGuards(CsrfGuard)
  @ApiSecurity("csrf-token")
  @RequirePermissions("leave.request.create")
  @ApiOperation({ summary: "Submit a full-day leave request" })
  @ApiCreatedResponse({ type: LeaveRequestResponse })
  createRequest(
    @Req() req: RequestWithContext,
    @Body() body: CreateLeaveRequestDto,
  ): Promise<LeaveRequestResponse> {
    return this.leave.createRequest(actingUserId(req), body, req.id);
  }

  @Get("requests")
  @RequirePermissions("leave.read")
  @ApiOperation({ summary: "List leave requests visible to the caller" })
  @ApiOkResponse({ type: [LeaveRequestResponse] })
  listRequests(
    @Req() req: RequestWithContext,
    @Query() query: ListLeaveRequestsQueryDto,
  ): Promise<LeaveRequestResponse[]> {
    return this.leave.listRequests(actingUserId(req), query);
  }

  @Post("requests/:id/withdraw")
  @UseGuards(CsrfGuard)
  @ApiSecurity("csrf-token")
  @RequirePermissions("leave.request.create")
  @ApiOperation({ summary: "Withdraw your own still-pending leave request" })
  @ApiOkResponse({ type: LeaveRequestResponse })
  @ApiNotFoundResponse({ type: ProblemDetails })
  withdrawRequest(
    @Req() req: RequestWithContext,
    @Param("id") id: string,
  ): Promise<LeaveRequestResponse> {
    return this.leave.withdrawRequest(actingUserId(req), id, req.id);
  }

  @Patch("requests/:id/decision")
  @UseGuards(CsrfGuard)
  @ApiSecurity("csrf-token")
  @RequirePermissions("leave.review")
  @ApiOperation({ summary: "Approve, reject, or return a pending leave request" })
  @ApiOkResponse({ type: LeaveRequestResponse })
  @ApiNotFoundResponse({ type: ProblemDetails })
  decideRequest(
    @Req() req: RequestWithContext,
    @Param("id") id: string,
    @Body() body: DecideLeaveRequestDto,
  ): Promise<LeaveRequestResponse> {
    return this.leave.decideRequest(actingUserId(req), id, body, req.id);
  }

  @Get("calendar")
  @RequirePermissions("leave.read")
  @ApiOperation({ summary: "Approved leave within a date range, scoped to the caller's visibility" })
  @ApiOkResponse({ type: [LeaveRequestResponse] })
  calendar(
    @Req() req: RequestWithContext,
    @Query() query: LeaveCalendarQueryDto,
  ): Promise<LeaveRequestResponse[]> {
    return this.leave.calendar(
      actingUserId(req),
      new Date(query.startDate),
      new Date(query.endDate),
    );
  }
}
