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
import { CreateLeaveTypeDto } from "./dto/create-leave-type.dto.js";
import { UpdateLeaveTypeDto } from "./dto/update-leave-type.dto.js";
import { LeaveTypeResponse } from "./leave-types.contracts.js";
import { LeaveTypesService } from "./leave-types.service.js";

function actingUserId(request: RequestWithContext): string {
  if (!request.user?.userId) throw unauthenticated();
  return request.user.userId;
}

/**
 * Leave type configuration. Listing active types is open to any
 * authenticated employee (needed to populate a leave request form);
 * creating, updating, and listing inactive types is Super Admin only.
 */
@ApiTags("Leave: Types")
@ApiCookieAuth("access_token")
@ApiUnauthorizedResponse({ type: ProblemDetails })
@ApiForbiddenResponse({ type: ProblemDetails })
@UseGuards(AccessTokenGuard, PermissionsGuard)
@Controller("leave/types")
export class LeaveTypesController {
  constructor(private readonly leaveTypes: LeaveTypesService) {}

  @Get()
  @ApiQuery({ name: "includeInactive", required: false, type: Boolean })
  @ApiOperation({ summary: "List leave types" })
  @ApiOkResponse({ type: [LeaveTypeResponse] })
  list(
    @Req() req: RequestWithContext,
    @Query("includeInactive") includeInactive?: string,
  ): Promise<LeaveTypeResponse[]> {
    return this.leaveTypes.list(actingUserId(req), includeInactive === "true");
  }

  @Post()
  @UseGuards(CsrfGuard)
  @ApiSecurity("csrf-token")
  @RequirePermissions("leave.type.manage")
  @ApiOperation({ summary: "Create a leave type" })
  @ApiCreatedResponse({ type: LeaveTypeResponse })
  create(
    @Req() req: RequestWithContext,
    @Body() body: CreateLeaveTypeDto,
  ): Promise<LeaveTypeResponse> {
    return this.leaveTypes.create(actingUserId(req), body, req.id);
  }

  @Patch(":id")
  @UseGuards(CsrfGuard)
  @ApiSecurity("csrf-token")
  @RequirePermissions("leave.type.manage")
  @ApiOperation({ summary: "Update a leave type" })
  @ApiOkResponse({ type: LeaveTypeResponse })
  @ApiNotFoundResponse({ type: ProblemDetails })
  update(
    @Req() req: RequestWithContext,
    @Param("id") id: string,
    @Body() body: UpdateLeaveTypeDto,
  ): Promise<LeaveTypeResponse> {
    return this.leaveTypes.update(actingUserId(req), id, body, req.id);
  }
}
