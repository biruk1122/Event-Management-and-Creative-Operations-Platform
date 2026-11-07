import {
  Body,
  Controller,
  Get,
  Param,
  Post,
  Query,
  Req,
  UseGuards,
} from "@nestjs/common";
import {
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
import {
  PaginatedSmsMessagesResponse,
  SmsConnectionTestResponse,
  SmsMessageResponse,
  SmsServiceStatusResponse,
} from "./sms.contracts.js";
import { ListSmsMessagesQueryDto, ResolveSmsMessageDto } from "./sms.dto.js";
import { SmsService } from "./sms.service.js";
import { maskPhone } from "./phone.js";
import type { SmsMessageRow } from "./sms.repository.js";

function actingUserId(request: RequestWithContext): string {
  if (!request.user?.userId) throw unauthenticated();
  return request.user.userId;
}

function toResponse(row: SmsMessageRow): SmsMessageResponse {
  return {
    id: row.id,
    category: row.category,
    status: row.status,
    recipientUserId: row.recipientUserId,
    recipientName: row.recipientName,
    recipientPhoneMasked: maskPhone(row.recipientPhone),
    templateKey: row.templateKey,
    body: row.body,
    skipReason: row.skipReason,
    providerMessageId: row.providerMessageId,
    providerStatus: row.providerStatus,
    providerStatusCheckedAt: row.providerStatusCheckedAt?.toISOString() ?? null,
    callbackStatus: row.callbackStatus,
    attempts: row.attempts,
    lastError: row.lastError,
    acceptedAt: row.acceptedAt?.toISOString() ?? null,
    createdAt: row.createdAt.toISOString(),
  };
}

/**
 * Administrator view of SMS: configuration status, the message history, the
 * connection test, and resolution of uncertain sends. Reads need
 * `settings.read`; changes need `settings.update`.
 */
@ApiTags("SMS")
@ApiCookieAuth("access_token")
@ApiUnauthorizedResponse({ type: ProblemDetails })
@ApiForbiddenResponse({ type: ProblemDetails })
@UseGuards(AccessTokenGuard, PermissionsGuard)
@Controller("sms")
export class SmsAdminController {
  constructor(private readonly sms: SmsService) {}

  @Get("status")
  @RequirePermissions("settings.read")
  @ApiOperation({
    summary:
      "SMS service status. Reports whether settings are present, never their values",
  })
  @ApiOkResponse({ type: SmsServiceStatusResponse })
  status(): SmsServiceStatusResponse {
    return this.sms.status();
  }

  @Get("messages")
  @RequirePermissions("settings.read")
  @ApiOperation({
    summary: "SMS history, newest first. Phone numbers are masked",
  })
  @ApiOkResponse({ type: PaginatedSmsMessagesResponse })
  async list(
    @Query() query: ListSmsMessagesQueryDto,
  ): Promise<PaginatedSmsMessagesResponse> {
    const { items, total } = await this.sms.list({
      ...(query.status ? { status: query.status } : {}),
      ...(query.category ? { category: query.category } : {}),
      page: query.page,
      pageSize: query.pageSize,
    });
    return {
      items: items.map(toResponse),
      total,
      page: query.page,
      pageSize: query.pageSize,
    };
  }

  @Post("test-connection")
  @RequirePermissions("settings.update")
  @UseGuards(CsrfGuard)
  @ApiSecurity("csrf-token")
  @ApiOperation({
    summary: "Check provider credentials by reading the balance. Sends no SMS",
  })
  @ApiOkResponse({ type: SmsConnectionTestResponse })
  testConnection(
    @Req() request: RequestWithContext,
  ): Promise<SmsConnectionTestResponse> {
    return this.sms.testConnection({
      actingUserId: actingUserId(request),
      requestId: request.id,
    });
  }

  @Post("messages/:id/resolve")
  @RequirePermissions("settings.update")
  @UseGuards(CsrfGuard)
  @ApiSecurity("csrf-token")
  @ApiOperation({
    summary:
      "Resolve an uncertain SMS: cancel it, or requeue it on purpose. Never automatic",
  })
  @ApiOkResponse({ description: "Resolved" })
  @ApiNotFoundResponse({ type: ProblemDetails })
  async resolve(
    @Req() request: RequestWithContext,
    @Param("id") id: string,
    @Body() body: ResolveSmsMessageDto,
  ): Promise<void> {
    await this.sms.resolve({
      actingUserId: actingUserId(request),
      id,
      decision: body.decision,
      requestId: request.id,
    });
  }
}
