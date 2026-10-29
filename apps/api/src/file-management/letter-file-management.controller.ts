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

/**
 * Letter attachments (EMP-02). `LettersService.authorize` is the real
 * boundary beneath the transport-level `letter.*` guard below - only Super
 * Admin, or the HR & Executive Officer department's own manager, ever
 * passes. Every finalized attachment also surfaces as a `Document` record
 * (see `FileManagementService.finalizeLetterAttachment`).
 */
@ApiTags("Administration: Letters")
@ApiCookieAuth("access_token")
@ApiUnauthorizedResponse({
  type: ProblemDetails,
  description: "Not authenticated",
})
@ApiForbiddenResponse({
  type: ProblemDetails,
  description:
    "Missing permission, outside letter-management scope, or invalid CSRF token",
})
@UseGuards(AccessTokenGuard, PermissionsGuard)
@Controller("letters/:letterId/files")
export class LetterFileManagementController {
  constructor(private readonly files: FileManagementService) {}

  @Post("upload-intents")
  @UseGuards(CsrfGuard)
  @ApiSecurity("csrf-token")
  @RequirePermissions("letter.update")
  @ApiOperation({
    summary: "Create a direct-upload grant for a letter attachment",
  })
  @ApiCreatedResponse({ type: UploadIntentResponse })
  @ApiBadRequestResponse({
    type: ProblemDetails,
    description: "Invalid upload declaration",
  })
  @ApiNotFoundResponse({
    type: ProblemDetails,
    description: "Letter not found",
  })
  async createUploadIntent(
    @Req() request: RequestWithContext,
    @Param("letterId") letterId: string,
    @Body() body: CreateUploadIntentDto,
  ): Promise<UploadIntentResponse> {
    return this.files.createLetterAttachmentUploadIntent(
      actingUserId(request),
      letterId,
      body,
    );
  }

  @Post(":fileId/finalize")
  @HttpCode(HttpStatus.OK)
  @UseGuards(CsrfGuard)
  @ApiSecurity("csrf-token")
  @RequirePermissions("letter.update")
  @ApiOperation({
    summary:
      "Verify, scan, attach a completed letter upload, and create its linked Document",
  })
  @ApiOkResponse({ type: ManagedFileResponse })
  @ApiConflictResponse({
    type: ProblemDetails,
    description: "Intent expired, upload missing, unsafe, or already finalized",
  })
  @ApiNotFoundResponse({
    type: ProblemDetails,
    description: "Letter or intent not found",
  })
  @ApiServiceUnavailableResponse({
    type: ProblemDetails,
    description: "File scanner unavailable",
  })
  async finalize(
    @Req() request: RequestWithContext,
    @Param("letterId") letterId: string,
    @Param("fileId") fileId: string,
  ): Promise<ManagedFileResponse> {
    return this.files.finalizeLetterAttachment(
      actingUserId(request),
      letterId,
      fileId,
    );
  }

  @Get()
  @RequirePermissions("letter.read")
  @ApiOperation({ summary: "List available files attached to a letter" })
  @ApiOkResponse({ type: PaginatedManagedFilesResponse })
  @ApiBadRequestResponse({
    type: ProblemDetails,
    description: "Invalid pagination query",
  })
  @ApiNotFoundResponse({
    type: ProblemDetails,
    description: "Letter not found",
  })
  async list(
    @Req() request: RequestWithContext,
    @Param("letterId") letterId: string,
    @Query() query: ListManagedFilesQueryDto,
  ): Promise<PaginatedManagedFilesResponse> {
    return this.files.listLetterFiles(actingUserId(request), letterId, query);
  }

  @Get(":fileId/download")
  @RequirePermissions("letter.read")
  @ApiOperation({
    summary: "Issue a private download grant for a letter attachment",
  })
  @ApiOkResponse({ type: DownloadGrantResponse })
  @ApiNotFoundResponse({
    type: ProblemDetails,
    description: "Letter file not found",
  })
  async download(
    @Req() request: RequestWithContext,
    @Res({ passthrough: true }) response: Response,
    @Param("letterId") letterId: string,
    @Param("fileId") fileId: string,
  ): Promise<DownloadGrantResponse> {
    response.setHeader("Cache-Control", "private, no-store");
    return this.files.downloadLetterFile(
      actingUserId(request),
      letterId,
      fileId,
      request.id,
    );
  }
}
