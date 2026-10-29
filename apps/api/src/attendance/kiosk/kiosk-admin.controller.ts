import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  Post,
  Req,
  UseGuards,
} from "@nestjs/common";
import {
  ApiCookieAuth,
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
import { RegisterKioskDto } from "./dto/register-kiosk.dto.js";
import { KioskRegisteredResponse, KioskResponse } from "./kiosk.contracts.js";
import { KioskService } from "./kiosk.service.js";

function actingUserId(request: RequestWithContext): string {
  if (!request.user?.userId) throw unauthenticated();
  return request.user.userId;
}

/**
 * Office kiosk device registration (EMP-02-shaped boundary, Super Admin
 * only - see `KioskService`). This is the normal, session-authenticated
 * admin surface; the kiosk device's own session flow is a completely
 * separate controller gated by `KioskTokenGuard`, never this one.
 */
@ApiTags("Attendance: Kiosks")
@ApiCookieAuth("access_token")
@ApiUnauthorizedResponse({ type: ProblemDetails })
@ApiForbiddenResponse({ type: ProblemDetails })
@UseGuards(AccessTokenGuard, PermissionsGuard)
@Controller("attendance/kiosks")
export class KioskAdminController {
  constructor(private readonly kiosks: KioskService) {}

  @Get()
  @RequirePermissions("attendance.kiosk.manage")
  @ApiOperation({ summary: "List registered kiosks" })
  @ApiOkResponse({ type: [KioskResponse] })
  list(@Req() req: RequestWithContext): Promise<KioskResponse[]> {
    return this.kiosks.list(actingUserId(req));
  }

  @Post()
  @UseGuards(CsrfGuard)
  @ApiSecurity("csrf-token")
  @RequirePermissions("attendance.kiosk.manage")
  @ApiOperation({
    summary: "Register a new kiosk and issue its one-time bearer secret",
  })
  @ApiCreatedResponse({ type: KioskRegisteredResponse })
  register(
    @Req() req: RequestWithContext,
    @Body() body: RegisterKioskDto,
  ): Promise<KioskRegisteredResponse> {
    return this.kiosks.register(actingUserId(req), body);
  }

  @Delete(":id")
  @UseGuards(CsrfGuard)
  @ApiSecurity("csrf-token")
  @RequirePermissions("attendance.kiosk.manage")
  @HttpCode(204)
  @ApiOperation({ summary: "Revoke a kiosk" })
  @ApiNoContentResponse()
  @ApiNotFoundResponse({ type: ProblemDetails })
  async revoke(
    @Req() req: RequestWithContext,
    @Param("id") id: string,
  ): Promise<void> {
    await this.kiosks.revoke(actingUserId(req), id);
  }
}
