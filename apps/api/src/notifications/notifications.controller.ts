import {
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Put,
  Query,
  Req,
  UseGuards,
} from "@nestjs/common";
import {
  ApiBadRequestResponse,
  ApiCookieAuth,
  ApiForbiddenResponse,
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
import { ListNotificationsQueryDto } from "./dto/list-notifications-query.dto.js";
import {
  NotificationFeedResponse,
  NotificationPreferencesResponse,
  NotificationResponse,
  UnreadCountResponse,
} from "./notifications.contracts.js";
import { NotificationsService } from "./notifications.service.js";

function actingUserId(request: RequestWithContext): string {
  const userId = request.user?.userId;
  if (!userId) throw unauthenticated();
  return userId;
}

@ApiTags("Notifications")
@ApiCookieAuth("access_token")
@ApiUnauthorizedResponse({
  type: ProblemDetails,
  description: "Not authenticated",
})
@ApiForbiddenResponse({
  type: ProblemDetails,
  description: "Missing permission or invalid CSRF token",
})
@UseGuards(AccessTokenGuard, PermissionsGuard)
@RequirePermissions("notification.read")
@Controller("notifications")
export class NotificationsController {
  constructor(private readonly notifications: NotificationsService) {}

  @Get()
  @ApiOperation({
    summary: "List the caller's own notifications, newest first",
  })
  @ApiOkResponse({ type: NotificationFeedResponse })
  async list(
    @Req() request: RequestWithContext,
    @Query() query: ListNotificationsQueryDto,
  ): Promise<NotificationFeedResponse> {
    return this.notifications.listFeed(actingUserId(request), query);
  }

  @Get("unread-count")
  @ApiOperation({ summary: "Count the caller's unread notifications" })
  @ApiOkResponse({ type: UnreadCountResponse })
  async unreadCount(
    @Req() request: RequestWithContext,
  ): Promise<UnreadCountResponse> {
    return this.notifications.unreadCount(actingUserId(request));
  }

  @Put(":id/read")
  @HttpCode(HttpStatus.OK)
  @UseGuards(CsrfGuard)
  @ApiSecurity("csrf-token")
  @ApiOperation({ summary: "Mark one of the caller's notifications as read" })
  @ApiOkResponse({ type: NotificationResponse })
  @ApiNotFoundResponse({
    type: ProblemDetails,
    description: "No notification exists with that id for the caller",
  })
  async markRead(
    @Req() request: RequestWithContext,
    @Param("id") id: string,
  ): Promise<NotificationResponse> {
    return this.notifications.markRead(actingUserId(request), id);
  }

  @Get("preferences")
  @ApiOperation({
    summary: "List the caller's mutable notification types and mute state",
  })
  @ApiOkResponse({ type: NotificationPreferencesResponse })
  async listPreferences(
    @Req() request: RequestWithContext,
  ): Promise<NotificationPreferencesResponse> {
    return this.notifications.listPreferences(actingUserId(request));
  }

  @Put("preferences/:type")
  @HttpCode(HttpStatus.OK)
  @UseGuards(CsrfGuard)
  @ApiSecurity("csrf-token")
  @ApiOperation({ summary: "Mute a mutable notification type for the caller" })
  @ApiOkResponse({ description: "Preference updated" })
  @ApiBadRequestResponse({
    type: ProblemDetails,
    description: "Unknown or non-mutable notification type",
  })
  async mute(
    @Req() request: RequestWithContext,
    @Param("type") type: string,
  ): Promise<void> {
    await this.notifications.setPreference(actingUserId(request), type, true);
  }

  @Delete("preferences/:type")
  @HttpCode(HttpStatus.OK)
  @UseGuards(CsrfGuard)
  @ApiSecurity("csrf-token")
  @ApiOperation({
    summary: "Unmute a mutable notification type for the caller",
  })
  @ApiOkResponse({ description: "Preference updated" })
  @ApiBadRequestResponse({
    type: ProblemDetails,
    description: "Unknown or non-mutable notification type",
  })
  async unmute(
    @Req() request: RequestWithContext,
    @Param("type") type: string,
  ): Promise<void> {
    await this.notifications.setPreference(actingUserId(request), type, false);
  }
}
