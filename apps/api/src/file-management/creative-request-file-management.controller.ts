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
  CreativeRequestFileResponse,
  PaginatedCreativeRequestFilesResponse,
} from "../creative-requests/creative-requests.contracts.js";
import {
  CreateCreativeRequestUploadIntentDto,
  FinalizeCreativeRequestUploadDto,
} from "../creative-requests/creative-requests.dto.js";
import {
  DownloadGrantResponse,
  UploadIntentResponse,
} from "./file-management.contracts.js";
import { FileManagementService } from "./file-management.service.js";
import { ListManagedFilesQueryDto } from "./dto/list-managed-files-query.dto.js";

function actingUserId(request: RequestWithContext): string {
  const userId = request.user?.userId;
  if (!userId) throw unauthenticated();
  return userId;
}

/**
 * Reference and deliverable files on a creative request (EVE-232). The
 * guard only requires read access; `CreativeRequestsService` decides which
 * side may add which kind of file, and when.
 */
@ApiTags("Creative requests")
@ApiCookieAuth("access_token")
@ApiUnauthorizedResponse({ type: ProblemDetails })
@ApiForbiddenResponse({ type: ProblemDetails })
@UseGuards(AccessTokenGuard, PermissionsGuard)
@Controller("creative-requests/:creativeRequestId/files")
export class CreativeRequestFileManagementController {
  constructor(private readonly files: FileManagementService) {}

  @Post("upload-intents")
  @UseGuards(CsrfGuard)
  @ApiSecurity("csrf-token")
  @RequirePermissions("creative_request.read")
  @ApiOperation({
    summary: "Create a direct-upload grant for a creative request file",
  })
  @ApiCreatedResponse({ type: UploadIntentResponse })
  @ApiBadRequestResponse({ type: ProblemDetails })
  @ApiNotFoundResponse({ type: ProblemDetails })
  @ApiConflictResponse({
    type: ProblemDetails,
    description: "This kind of file cannot be added in the current status",
  })
  createUploadIntent(
    @Req() request: RequestWithContext,
    @Param("creativeRequestId") creativeRequestId: string,
    @Body() body: CreateCreativeRequestUploadIntentDto,
  ): Promise<UploadIntentResponse> {
    return this.files.createCreativeRequestUploadIntent(
      actingUserId(request),
      creativeRequestId,
      body,
    );
  }

  @Post(":fileId/finalize")
  @HttpCode(HttpStatus.OK)
  @UseGuards(CsrfGuard)
  @ApiSecurity("csrf-token")
  @RequirePermissions("creative_request.read")
  @ApiOperation({
    summary: "Verify, scan, and attach a completed creative request upload",
  })
  @ApiOkResponse({ type: CreativeRequestFileResponse })
  @ApiConflictResponse({
    type: ProblemDetails,
    description: "Intent expired, upload missing, unsafe, or not allowed now",
  })
  @ApiNotFoundResponse({ type: ProblemDetails })
  @ApiServiceUnavailableResponse({
    type: ProblemDetails,
    description: "File scanner unavailable",
  })
  finalize(
    @Req() request: RequestWithContext,
    @Param("creativeRequestId") creativeRequestId: string,
    @Param("fileId") fileId: string,
    @Body() body: FinalizeCreativeRequestUploadDto,
  ): Promise<CreativeRequestFileResponse> {
    return this.files.finalizeCreativeRequestUpload(
      actingUserId(request),
      creativeRequestId,
      fileId,
      body.kind,
    );
  }

  @Get()
  @RequirePermissions("creative_request.read")
  @ApiOperation({ summary: "List a creative request's files" })
  @ApiOkResponse({ type: PaginatedCreativeRequestFilesResponse })
  @ApiNotFoundResponse({ type: ProblemDetails })
  list(
    @Req() request: RequestWithContext,
    @Param("creativeRequestId") creativeRequestId: string,
    @Query() query: ListManagedFilesQueryDto,
  ): Promise<PaginatedCreativeRequestFilesResponse> {
    return this.files.listCreativeRequestFiles(
      actingUserId(request),
      creativeRequestId,
      query,
    );
  }

  @Get(":fileId/download")
  @RequirePermissions("creative_request.read")
  @ApiOperation({
    summary: "Issue a private download grant for a creative request file",
  })
  @ApiOkResponse({ type: DownloadGrantResponse })
  @ApiNotFoundResponse({ type: ProblemDetails })
  download(
    @Req() request: RequestWithContext,
    @Res({ passthrough: true }) response: Response,
    @Param("creativeRequestId") creativeRequestId: string,
    @Param("fileId") fileId: string,
  ): Promise<DownloadGrantResponse> {
    response.setHeader("Cache-Control", "private, no-store");
    return this.files.downloadCreativeRequestFile(
      actingUserId(request),
      creativeRequestId,
      fileId,
      request.id,
    );
  }
}
