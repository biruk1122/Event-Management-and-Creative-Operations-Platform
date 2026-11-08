import {
  Body,
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Patch,
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
  SmsMessageDetailResponse,
  SmsMessageResponse,
  SmsRecipientListResponse,
  SmsServiceStatusResponse,
  SmsSettingsResponse,
} from "./sms.contracts.js";
import {
  ListSmsMessagesQueryDto,
  ResolveSmsMessageDto,
  SearchSmsRecipientsQueryDto,
  UpdateSmsSettingsDto,
} from "./sms.dto.js";
import { SmsService, type SmsSettingsView } from "./sms.service.js";
import { safeProviderResponse, safeText } from "./sms-redaction.js";
import { smsPersonName } from "./sms-format.js";
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
    providerStatus: safeText(row.providerStatus),
    providerStatusCheckedAt: row.providerStatusCheckedAt?.toISOString() ?? null,
    callbackStatus: row.callbackStatus,
    attempts: row.attempts,
    lastError: safeText(row.lastError),
    acceptedAt: row.acceptedAt?.toISOString() ?? null,
    createdAt: row.createdAt.toISOString(),
  };
}

function toSettingsResponse(view: SmsSettingsView): SmsSettingsResponse {
  return {
    environmentEnabled: view.environmentEnabled,
    globalEnabled: view.globalEnabled,
    effectiveEnabled: view.effectiveEnabled,
    categories: view.categories,
    updatedAt: view.updatedAt?.toISOString() ?? null,
    provider: view.provider,
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
      ...(query.recipientUserId
        ? { recipientUserId: query.recipientUserId }
        : {}),
      ...(query.createdFrom
        ? { createdFrom: new Date(query.createdFrom) }
        : {}),
      ...(query.createdTo ? { createdTo: new Date(query.createdTo) } : {}),
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

  @Get("messages/:id")
  @RequirePermissions("settings.read")
  @ApiOperation({
    summary:
      "One SMS with its delivery attempts. Phone numbers are masked and provider text is reduced",
  })
  @ApiOkResponse({ type: SmsMessageDetailResponse })
  @ApiNotFoundResponse({ type: ProblemDetails })
  async detail(
    @Param("id", new ParseUUIDPipe()) id: string,
  ): Promise<SmsMessageDetailResponse> {
    const row = await this.sms.detail(id);
    return {
      ...toResponse(row),
      callbackReceivedAt: row.callbackReceivedAt?.toISOString() ?? null,
      sourceDueAt: row.sourceDueAt?.toISOString() ?? null,
      deliveryAttempts: row.attemptLog.map((attempt) => ({
        attemptNumber: attempt.attemptNumber,
        outcome: attempt.outcome,
        providerHttpStatus: attempt.providerHttpStatus,
        providerResponse: safeProviderResponse(attempt.providerResponse),
        error: safeText(attempt.error),
        startedAt: attempt.startedAt.toISOString(),
        finishedAt: attempt.finishedAt?.toISOString() ?? null,
      })),
    };
  }

  @Get("recipients")
  @RequirePermissions("settings.read")
  @ApiOperation({
    summary:
      "Find users to filter the SMS history by. Returns names and user ids only, never contact details",
  })
  @ApiOkResponse({ type: SmsRecipientListResponse })
  async recipients(
    @Query() query: SearchSmsRecipientsQueryDto,
  ): Promise<SmsRecipientListResponse> {
    const rows = await this.sms.searchRecipients(query.q);
    return {
      items: rows.map((row) => ({
        id: row.id,
        name: smsPersonName(row, "Unnamed user"),
      })),
    };
  }

  @Get("settings")
  @RequirePermissions("settings.read")
  @ApiOperation({
    summary:
      "Runtime SMS settings and provider configuration status. Never returns secret values",
  })
  @ApiOkResponse({ type: SmsSettingsResponse })
  async settings(): Promise<SmsSettingsResponse> {
    return toSettingsResponse(await this.sms.settings());
  }

  @Patch("settings")
  @RequirePermissions("settings.update")
  @UseGuards(CsrfGuard)
  @ApiSecurity("csrf-token")
  @ApiOperation({
    summary:
      "Change runtime SMS switches. The environment switch still overrides them. Changes are audited",
  })
  @ApiOkResponse({ type: SmsSettingsResponse })
  async updateSettings(
    @Req() request: RequestWithContext,
    @Body() body: UpdateSmsSettingsDto,
  ): Promise<SmsSettingsResponse> {
    const view = await this.sms.updateSettings({
      actingUserId: actingUserId(request),
      requestId: request.id,
      ...(body.globalEnabled !== undefined
        ? { globalEnabled: body.globalEnabled }
        : {}),
      ...(body.categories ? { categories: body.categories } : {}),
    });
    return toSettingsResponse(view);
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
