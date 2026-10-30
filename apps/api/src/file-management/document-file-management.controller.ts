import {
  Body,
  Controller,
  HttpCode,
  HttpStatus,
  Param,
  Post,
  Get,
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
  UploadIntentResponse,
} from "./file-management.contracts.js";
import { FileManagementService } from "./file-management.service.js";
import { CreateUploadIntentDto } from "./dto/create-upload-intent.dto.js";

function actingUserId(request: RequestWithContext): string {
  const userId = request.user?.userId;
  if (!userId) throw unauthenticated();
  return userId;
}

/**
 * A document's own single file (EMP-02). `DocumentsService.authorize` is
 * the real boundary beneath the transport-level `document.*` guard below -
 * only Super Admin, or the HR & Executive Officer department's own
 * manager, ever passes. Unlike letters, a document takes exactly one file
 * (a direct nullable FK, not a join table) - finalizing against an
 * already-attached document is rejected as a conflict.
 */
@ApiTags("Administration: Documents")
@ApiCookieAuth("access_token")
@ApiUnauthorizedResponse({
  type: ProblemDetails,
  description: "Not authenticated",
})
@ApiForbiddenResponse({
  type: ProblemDetails,
  description:
    "Missing permission, outside document-management scope, or invalid CSRF token",
})
@UseGuards(AccessTokenGuard, PermissionsGuard)
@Controller("documents/:documentId/files")
export class DocumentFileManagementController {
  constructor(private readonly files: FileManagementService) {}

  @Post("upload-intents")
  @UseGuards(CsrfGuard)
  @ApiSecurity("csrf-token")
  @RequirePermissions("document.update")
  @ApiOperation({
    summary: "Create a direct-upload grant for a document's file",
  })
  @ApiCreatedResponse({ type: UploadIntentResponse })
  @ApiBadRequestResponse({
    type: ProblemDetails,
    description: "Invalid upload declaration",
  })
  @ApiNotFoundResponse({
    type: ProblemDetails,
    description: "Document not found",
  })
  async createUploadIntent(
    @Req() request: RequestWithContext,
    @Param("documentId") documentId: string,
    @Body() body: CreateUploadIntentDto,
  ): Promise<UploadIntentResponse> {
    return this.files.createDocumentAttachmentUploadIntent(
      actingUserId(request),
      documentId,
      body,
    );
  }

  @Post(":fileId/finalize")
  @HttpCode(HttpStatus.OK)
  @UseGuards(CsrfGuard)
  @ApiSecurity("csrf-token")
  @RequirePermissions("document.update")
  @ApiOperation({ summary: "Verify, scan, and attach a document's file" })
  @ApiOkResponse({ type: ManagedFileResponse })
  @ApiConflictResponse({
    type: ProblemDetails,
    description:
      "Intent expired, upload missing, unsafe, or the document already has a file",
  })
  @ApiNotFoundResponse({
    type: ProblemDetails,
    description: "Document or intent not found",
  })
  @ApiServiceUnavailableResponse({
    type: ProblemDetails,
    description: "File scanner unavailable",
  })
  async finalize(
    @Req() request: RequestWithContext,
    @Param("documentId") documentId: string,
    @Param("fileId") fileId: string,
  ): Promise<ManagedFileResponse> {
    return this.files.finalizeDocumentUpload(
      actingUserId(request),
      documentId,
      fileId,
    );
  }

  @Get(":fileId/download")
  @RequirePermissions("document.read")
  @ApiOperation({
    summary: "Issue a private download grant for a document's file",
  })
  @ApiOkResponse({ type: DownloadGrantResponse })
  @ApiNotFoundResponse({
    type: ProblemDetails,
    description: "Document file not found",
  })
  async download(
    @Req() request: RequestWithContext,
    @Res({ passthrough: true }) response: Response,
    @Param("documentId") documentId: string,
    @Param("fileId") fileId: string,
  ): Promise<DownloadGrantResponse> {
    response.setHeader("Cache-Control", "private, no-store");
    return this.files.downloadDocumentFile(
      actingUserId(request),
      documentId,
      fileId,
      request.id,
    );
  }
}
