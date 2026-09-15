import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Post,
  Query,
  Req,
  Res,
  UseGuards,
} from "@nestjs/common";
import {
  ApiBadRequestResponse,
  ApiConflictResponse,
  ApiCookieAuth,
  ApiCreatedResponse,
  ApiForbiddenResponse,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiOperation,
  ApiSecurity,
  ApiServiceUnavailableResponse,
  ApiTags,
  ApiUnauthorizedResponse,
} from "@nestjs/swagger";
import type { Response } from "express";

import { unauthenticated } from "../auth/auth.errors.js";
import { AccessTokenGuard } from "../auth/guards/access-token.guard.js";
import { CsrfGuard } from "../auth/guards/csrf.guard.js";
import { ProblemDetails } from "../common/http/problem-details.js";
import type { RequestWithContext } from "../common/http/request-with-context.js";
import { RequirePermissions } from "../common/security/permissions.decorator.js";
import { PermissionsGuard } from "../common/security/permissions.guard.js";
import {
  DownloadGrantResponse,
  ManagedFileResponse,
  PaginatedManagedFilesResponse,
  UploadIntentResponse,
} from "./file-management.contracts.js";
import { FileManagementService } from "./file-management.service.js";
import { CreateUploadIntentDto } from "./dto/create-upload-intent.dto.js";
import { ListManagedFilesQueryDto } from "./dto/list-managed-files-query.dto.js";

function actingUserId(request: RequestWithContext): string {
  const userId = request.user?.userId;
  if (!userId) throw unauthenticated();
  return userId;
}

@ApiTags("Discuss")
@ApiCookieAuth("access_token")
@ApiUnauthorizedResponse({
  type: ProblemDetails,
  description: "Not authenticated",
})
@ApiForbiddenResponse({
  type: ProblemDetails,
  description:
    "Missing permission, outside conversation scope, or invalid CSRF token",
})
@UseGuards(AccessTokenGuard, PermissionsGuard)
@Controller("conversations/:conversationId")
export class MessageFileManagementController {
  constructor(private readonly files: FileManagementService) {}

  @Post("files/upload-intents")
  @UseGuards(CsrfGuard)
  @ApiSecurity("csrf-token")
  @RequirePermissions("message.send")
  @ApiOperation({
    summary:
      "Create a direct-upload grant for a message attachment, before the message exists",
  })
  @ApiCreatedResponse({ type: UploadIntentResponse })
  @ApiBadRequestResponse({
    type: ProblemDetails,
    description: "Invalid upload declaration",
  })
  @ApiNotFoundResponse({
    type: ProblemDetails,
    description: "Conversation not found",
  })
  async createUploadIntent(
    @Req() request: RequestWithContext,
    @Param("conversationId") conversationId: string,
    @Body() body: CreateUploadIntentDto,
  ): Promise<UploadIntentResponse> {
    return this.files.createConversationUploadIntent(
      actingUserId(request),
      conversationId,
      body,
    );
  }

  @Post("messages/:messageId/files/:fileId/finalize")
  @HttpCode(HttpStatus.OK)
  @UseGuards(CsrfGuard)
  @ApiSecurity("csrf-token")
  @RequirePermissions("message.send")
  @ApiOperation({
    summary: "Verify, scan, and attach a completed upload to a message",
  })
  @ApiOkResponse({ type: ManagedFileResponse })
  @ApiConflictResponse({
    type: ProblemDetails,
    description: "Intent expired, upload missing, unsafe, or already finalized",
  })
  @ApiNotFoundResponse({
    type: ProblemDetails,
    description: "Conversation, message, or intent not found",
  })
  @ApiServiceUnavailableResponse({
    type: ProblemDetails,
    description: "File scanner unavailable",
  })
  async finalize(
    @Req() request: RequestWithContext,
    @Param("conversationId") conversationId: string,
    @Param("messageId") messageId: string,
    @Param("fileId") fileId: string,
  ): Promise<ManagedFileResponse> {
    return this.files.finalizeMessageUpload(
      actingUserId(request),
      conversationId,
      messageId,
      fileId,
    );
  }

  @Get("messages/:messageId/files")
  @RequirePermissions("conversation.read")
  @ApiOperation({ summary: "List available files attached to a message" })
  @ApiOkResponse({ type: PaginatedManagedFilesResponse })
  @ApiBadRequestResponse({
    type: ProblemDetails,
    description: "Invalid pagination query",
  })
  @ApiConflictResponse({
    type: ProblemDetails,
    description: "The caller is not a member of this conversation",
  })
  async list(
    @Req() request: RequestWithContext,
    @Param("conversationId") conversationId: string,
    @Param("messageId") messageId: string,
    @Query() query: ListManagedFilesQueryDto,
  ): Promise<PaginatedManagedFilesResponse> {
    return this.files.listMessageFiles(
      actingUserId(request),
      conversationId,
      messageId,
      query,
    );
  }

  @Get("messages/:messageId/files/:fileId/download")
  @RequirePermissions("conversation.read")
  @ApiOperation({
    summary: "Issue a private download grant for a message file",
  })
  @ApiOkResponse({ type: DownloadGrantResponse })
  @ApiNotFoundResponse({
    type: ProblemDetails,
    description: "Message file not found",
  })
  async download(
    @Req() request: RequestWithContext,
    @Res({ passthrough: true }) response: Response,
    @Param("conversationId") conversationId: string,
    @Param("messageId") messageId: string,
    @Param("fileId") fileId: string,
  ): Promise<DownloadGrantResponse> {
    response.setHeader("Cache-Control", "private, no-store");
    return this.files.downloadMessageFile(
      actingUserId(request),
      conversationId,
      messageId,
      fileId,
      request.id,
    );
  }
}
