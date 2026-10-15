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

@ApiTags("Report management")
@ApiCookieAuth("access_token")
@ApiUnauthorizedResponse({
  type: ProblemDetails,
  description: "Not authenticated",
})
@ApiForbiddenResponse({
  type: ProblemDetails,
  description:
    "Missing permission, outside report scope, or invalid CSRF token",
})
@UseGuards(AccessTokenGuard, PermissionsGuard)
@Controller("reports/:reportId/files")
export class ReportFileManagementController {
  constructor(private readonly files: FileManagementService) {}

  @Post("upload-intents")
  @UseGuards(CsrfGuard)
  @ApiSecurity("csrf-token")
  @RequirePermissions("report.attachment.create")
  @ApiOperation({
    summary: "Create a direct-upload grant for a report attachment",
  })
  @ApiCreatedResponse({ type: UploadIntentResponse })
  @ApiBadRequestResponse({
    type: ProblemDetails,
    description: "Invalid upload declaration",
  })
  @ApiNotFoundResponse({
    type: ProblemDetails,
    description: "Report not found",
  })
  async createUploadIntent(
    @Req() request: RequestWithContext,
    @Param("reportId") reportId: string,
    @Body() body: CreateUploadIntentDto,
  ): Promise<UploadIntentResponse> {
    return this.files.createReportUploadIntent(
      actingUserId(request),
      reportId,
      body,
    );
  }

  @Post(":fileId/finalize")
  @HttpCode(HttpStatus.OK)
  @UseGuards(CsrfGuard)
  @ApiSecurity("csrf-token")
  @RequirePermissions("report.attachment.create")
  @ApiOperation({
    summary: "Verify, scan, and attach a completed report upload",
  })
  @ApiOkResponse({ type: ManagedFileResponse })
  @ApiConflictResponse({
    type: ProblemDetails,
    description: "Intent expired, upload missing, unsafe, or already finalized",
  })
  @ApiNotFoundResponse({
    type: ProblemDetails,
    description: "Report or intent not found",
  })
  @ApiServiceUnavailableResponse({
    type: ProblemDetails,
    description: "File scanner unavailable",
  })
  async finalize(
    @Req() request: RequestWithContext,
    @Param("reportId") reportId: string,
    @Param("fileId") fileId: string,
  ): Promise<ManagedFileResponse> {
    return this.files.finalizeReportUpload(
      actingUserId(request),
      reportId,
      fileId,
    );
  }

  @Get()
  @RequirePermissions("report.read")
  @ApiOperation({ summary: "List available files attached to a report" })
  @ApiOkResponse({ type: PaginatedManagedFilesResponse })
  @ApiBadRequestResponse({
    type: ProblemDetails,
    description: "Invalid pagination query",
  })
  @ApiNotFoundResponse({
    type: ProblemDetails,
    description: "Report not found",
  })
  async list(
    @Req() request: RequestWithContext,
    @Param("reportId") reportId: string,
    @Query() query: ListManagedFilesQueryDto,
  ): Promise<PaginatedManagedFilesResponse> {
    return this.files.listReportFiles(actingUserId(request), reportId, query);
  }

  @Get(":fileId/download")
  @RequirePermissions("report.read")
  @ApiOperation({
    summary: "Issue a private download grant for a report file",
  })
  @ApiOkResponse({ type: DownloadGrantResponse })
  @ApiNotFoundResponse({
    type: ProblemDetails,
    description: "Report file not found",
  })
  async download(
    @Req() request: RequestWithContext,
    @Res({ passthrough: true }) response: Response,
    @Param("reportId") reportId: string,
    @Param("fileId") fileId: string,
  ): Promise<DownloadGrantResponse> {
    response.setHeader("Cache-Control", "private, no-store");
    return this.files.downloadReportFile(
      actingUserId(request),
      reportId,
      fileId,
      request.id,
    );
  }
}
