import { Body, Controller, Get, Post, Req, UseGuards } from "@nestjs/common";
import {
  ApiCookieAuth,
  ApiForbiddenResponse,
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
import { MobilePunchDto } from "./dto/mobile-punch.dto.js";
import {
  MobilePunchResponse,
  MyShiftResponse,
} from "./mobile-attendance.contracts.js";
import { MobileAttendanceService } from "./mobile-attendance.service.js";

function actingUserId(request: RequestWithContext): string {
  if (!request.user?.userId) throw unauthenticated();
  return request.user.userId;
}

/**
 * Mobile/off-site event attendance - a normally-authenticated employee
 * punching against their own assigned event shift. Every call acts on the
 * caller's own `userId`; no `employeeId` is ever accepted from the request
 * body, so there is no id-substitution surface here to guard against.
 */
@ApiTags("Attendance: Mobile")
@ApiCookieAuth("access_token")
@ApiUnauthorizedResponse({ type: ProblemDetails })
@ApiForbiddenResponse({ type: ProblemDetails })
@UseGuards(AccessTokenGuard, PermissionsGuard)
@Controller("attendance/mobile")
export class MobileAttendanceController {
  constructor(private readonly mobile: MobileAttendanceService) {}

  @Get("sessions")
  @RequirePermissions("attendance.read")
  @ApiOperation({
    summary: "The caller's own recent attendance sessions, most recent first",
  })
  @ApiOkResponse({ type: [AttendanceSessionResponse] })
  mySessions(
    @Req() req: RequestWithContext,
  ): Promise<AttendanceSessionResponse[]> {
    return this.mobile.mySessions(actingUserId(req));
  }

  @Get("shifts")
  @RequirePermissions("attendance.read")
  @ApiOperation({
    summary: "List the caller's currently assigned, punchable event shifts",
  })
  @ApiOkResponse({ type: [MyShiftResponse] })
  myShifts(@Req() req: RequestWithContext): Promise<MyShiftResponse[]> {
    return this.mobile.myShifts(actingUserId(req));
  }

  @Post("punch")
  @UseGuards(CsrfGuard)
  @ApiSecurity("csrf-token")
  @RequirePermissions("attendance.punch")
  @ApiOperation({ summary: "Check in or out of an assigned event shift" })
  @ApiOkResponse({ type: MobilePunchResponse })
  punch(
    @Req() req: RequestWithContext,
    @Body() body: MobilePunchDto,
  ): Promise<MobilePunchResponse> {
    return this.mobile.punch(actingUserId(req), body, req.id);
  }
}
