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

import { unauthenticated } from "../auth/auth.errors.js";
import { AccessTokenGuard } from "../auth/guards/access-token.guard.js";
import { CsrfGuard } from "../auth/guards/csrf.guard.js";
import { ProblemDetails } from "../common/http/problem-details.js";
import type { RequestWithContext } from "../common/http/request-with-context.js";
import { RequirePermissions } from "../common/security/permissions.decorator.js";
import { PermissionsGuard } from "../common/security/permissions.guard.js";
import {
  CalendarEntryResponse,
  CalendarFeedResponse,
} from "./calendar.contracts.js";
import { CalendarService } from "./calendar.service.js";
import { CreateCalendarEntryDto } from "./dto/create-calendar-entry.dto.js";
import { ListCalendarQueryDto } from "./dto/list-calendar-query.dto.js";
import { UpdateCalendarEntryDto } from "./dto/update-calendar-entry.dto.js";

function actingUserId(request: RequestWithContext): string {
  const userId = request.user?.userId;
  if (!userId) throw unauthenticated();
  return userId;
}

/**
 * Calendar views return the caller's persisted entries. Event, task, and
 * project projections are returned read-only; only PERSONAL and REMINDER
 * entries are calendar-owned mutation resources in this module.
 */
@ApiTags("Calendar and personal schedules")
@ApiCookieAuth("access_token")
@ApiUnauthorizedResponse({
  type: ProblemDetails,
  description: "Not authenticated",
})
@ApiForbiddenResponse({
  type: ProblemDetails,
  description: "Missing the required permission, or CSRF token invalid",
})
@UseGuards(AccessTokenGuard, PermissionsGuard)
@Controller("calendar")
export class CalendarController {
  constructor(private readonly calendar: CalendarService) {}

  @Get()
  @RequirePermissions("calendar.read")
  @ApiOperation({
    summary:
      "List the caller's calendar entries in an inclusive/exclusive range of at most 90 days",
  })
  @ApiOkResponse({ type: CalendarFeedResponse })
  async list(
    @Req() request: RequestWithContext,
    @Query() query: ListCalendarQueryDto,
  ): Promise<CalendarFeedResponse> {
    return this.calendar.list(actingUserId(request), query);
  }

  @Get(":id")
  @RequirePermissions("calendar.read")
  @ApiOperation({ summary: "Get one calendar entry owned by the caller" })
  @ApiOkResponse({ type: CalendarEntryResponse })
  @ApiNotFoundResponse({
    type: ProblemDetails,
    description: "Calendar entry not found",
  })
  async get(
    @Req() request: RequestWithContext,
    @Param("id") id: string,
  ): Promise<CalendarEntryResponse> {
    return this.calendar.get(actingUserId(request), id);
  }

  @Post()
  @UseGuards(CsrfGuard)
  @ApiSecurity("csrf-token")
  @RequirePermissions("calendar.create")
  @ApiOperation({ summary: "Create a personal schedule or reminder" })
  @ApiCreatedResponse({ type: CalendarEntryResponse })
  async create(
    @Req() request: RequestWithContext,
    @Body() body: CreateCalendarEntryDto,
  ): Promise<CalendarEntryResponse> {
    return this.calendar.create(actingUserId(request), body);
  }

  @Patch(":id")
  @UseGuards(CsrfGuard)
  @ApiSecurity("csrf-token")
  @RequirePermissions("calendar.update")
  @ApiOperation({
    summary: "Update a calendar-owned personal schedule or reminder",
  })
  @ApiOkResponse({ type: CalendarEntryResponse })
  @ApiNotFoundResponse({
    type: ProblemDetails,
    description: "Calendar entry not found or is a read-only projection",
  })
  async update(
    @Req() request: RequestWithContext,
    @Param("id") id: string,
    @Body() body: UpdateCalendarEntryDto,
  ): Promise<CalendarEntryResponse> {
    return this.calendar.update(actingUserId(request), id, body);
  }

  @Delete(":id")
  @HttpCode(HttpStatus.NO_CONTENT)
  @UseGuards(CsrfGuard)
  @ApiSecurity("csrf-token")
  @RequirePermissions("calendar.delete")
  @ApiOperation({
    summary: "Delete a calendar-owned personal schedule or reminder",
  })
  @ApiNoContentResponse({ description: "The calendar entry was removed" })
  @ApiNotFoundResponse({
    type: ProblemDetails,
    description: "Calendar entry not found or is a read-only projection",
  })
  async remove(
    @Req() request: RequestWithContext,
    @Param("id") id: string,
  ): Promise<void> {
    await this.calendar.remove(actingUserId(request), id);
  }
}
