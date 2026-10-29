import {
  Body,
  Controller,
  Get,
  Post,
  Query,
  Req,
  UseGuards,
} from "@nestjs/common";
import {
  ApiForbiddenResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
} from "@nestjs/swagger";

import { ProblemDetails } from "../../common/http/problem-details.js";
import { KioskPunchDto } from "./dto/kiosk-punch.dto.js";
import { KioskVerifyDto } from "./dto/kiosk-verify.dto.js";
import {
  KioskEmployeeOption,
  KioskPunchResponse,
  KioskVerifyResponse,
} from "./kiosk.contracts.js";
import { KioskSessionService } from "./kiosk-session.service.js";
import { KioskTokenGuard, type RequestWithKiosk } from "./kiosk-token.guard.js";

/**
 * The kiosk device's own session flow - identify, verify, punch. Gated
 * only by `KioskTokenGuard` (the device's own bearer secret), never by
 * `AccessTokenGuard`: no employee is logged in on this shared device.
 * Every response is deliberately minimal - no email, phone, or any other
 * employee detail a shared kiosk has no business displaying.
 */
@ApiTags("Attendance: Kiosks")
@ApiForbiddenResponse({ type: ProblemDetails })
@UseGuards(KioskTokenGuard)
@Controller("attendance/kiosk-session")
export class KioskSessionController {
  constructor(private readonly session: KioskSessionService) {}

  @Get("employees")
  @ApiOperation({ summary: "Search active employees by name or employee code" })
  @ApiOkResponse({ type: [KioskEmployeeOption] })
  searchEmployees(
    @Query("search") search?: string,
  ): Promise<KioskEmployeeOption[]> {
    return this.session.searchEmployees(search);
  }

  @Post("verify")
  @ApiOperation({
    summary: "Verify the selected employee's account password",
  })
  @ApiOkResponse({ type: KioskVerifyResponse })
  verify(
    @Req() request: RequestWithKiosk,
    @Body() body: KioskVerifyDto,
  ): Promise<KioskVerifyResponse> {
    return this.session.verify(request, request.kiosk.id, body);
  }

  @Post("punch")
  @ApiOperation({ summary: "Check in or out using a verified session token" })
  @ApiOkResponse({ type: KioskPunchResponse })
  punch(
    @Req() request: RequestWithKiosk,
    @Body() body: KioskPunchDto,
  ): Promise<KioskPunchResponse> {
    return this.session.punch(request.kiosk.id, body, request.id);
  }
}
