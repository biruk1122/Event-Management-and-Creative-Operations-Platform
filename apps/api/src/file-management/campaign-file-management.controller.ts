import {
  Body,
  Controller,
  Delete,
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
  ApiNoContentResponse,
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
 * Files attached to a promotion or marketing campaign (EVE-231). The static
 * permission is the broadest key the route needs; `FileManagementService`
 * re-checks the campaign's own department before every change, so an
 * overseeing manager can list and download but never upload, finalize or
 * remove.
 */
@ApiTags("Managed files")
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
@Controller("campaigns/:campaignId/files")
export class CampaignFileManagementController {
  constructor(private readonly files: FileManagementService) {}

  @Post("upload-intents")
  @UseGuards(CsrfGuard)
  @ApiSecurity("csrf-token")
  @RequirePermissions("campaign.update")
  @ApiOperation({
    summary: "Create a 10-minute direct-upload grant for a campaign file",
  })
  @ApiCreatedResponse({ type: UploadIntentResponse })
  @ApiBadRequestResponse({
    type: ProblemDetails,
    description: "Invalid filename or upload declaration",
  })
  @ApiNotFoundResponse({
    type: ProblemDetails,
    description: "Campaign not found",
  })
  async createUploadIntent(
    @Req() request: RequestWithContext,
    @Param("campaignId") campaignId: string,
    @Body() body: CreateUploadIntentDto,
  ): Promise<UploadIntentResponse> {
    return this.files.createCampaignUploadIntent(
      actingUserId(request),
      campaignId,
      body,
    );
  }

  @Post(":fileId/finalize")
  @HttpCode(HttpStatus.OK)
  @UseGuards(CsrfGuard)
  @ApiSecurity("csrf-token")
  @RequirePermissions("campaign.update")
  @ApiOperation({
    summary: "Verify, scan, and attach a completed direct upload to a campaign",
  })
  @ApiOkResponse({ type: ManagedFileResponse })
  @ApiConflictResponse({
    type: ProblemDetails,
    description: "Intent expired, upload missing, unsafe, or already finalized",
  })
  @ApiNotFoundResponse({
    type: ProblemDetails,
    description: "Campaign or upload intent not found",
  })
  @ApiServiceUnavailableResponse({
    type: ProblemDetails,
    description: "File scanner unavailable",
  })
  async finalize(
    @Req() request: RequestWithContext,
    @Param("campaignId") campaignId: string,
    @Param("fileId") fileId: string,
  ): Promise<ManagedFileResponse> {
    return this.files.finalizeCampaignUpload(
      actingUserId(request),
      campaignId,
      fileId,
    );
  }

  @Get()
  @RequirePermissions("campaign.read")
  @ApiOperation({ summary: "List available files attached to a campaign" })
  @ApiOkResponse({ type: PaginatedManagedFilesResponse })
  @ApiNotFoundResponse({
    type: ProblemDetails,
    description: "Campaign not found",
  })
  async list(
    @Req() request: RequestWithContext,
    @Param("campaignId") campaignId: string,
    @Query() query: ListManagedFilesQueryDto,
  ): Promise<PaginatedManagedFilesResponse> {
    return this.files.listCampaignFiles(
      actingUserId(request),
      campaignId,
      query,
    );
  }

  @Get(":fileId/download")
  @RequirePermissions("campaign.read")
  @ApiOperation({
    summary: "Issue a five-minute private download grant for a campaign file",
  })
  @ApiOkResponse({ type: DownloadGrantResponse })
  @ApiNotFoundResponse({
    type: ProblemDetails,
    description: "No available file exists for this campaign",
  })
  async download(
    @Req() request: RequestWithContext,
    @Res({ passthrough: true }) response: Response,
    @Param("campaignId") campaignId: string,
    @Param("fileId") fileId: string,
  ): Promise<DownloadGrantResponse> {
    response.setHeader("Cache-Control", "private, no-store");
    return this.files.downloadCampaignFile(
      actingUserId(request),
      campaignId,
      fileId,
    );
  }

  @Delete(":fileId")
  @HttpCode(HttpStatus.NO_CONTENT)
  @UseGuards(CsrfGuard)
  @ApiSecurity("csrf-token")
  @RequirePermissions("campaign.update")
  @ApiOperation({
    summary: "Detach a campaign file and begin its 30-day retention window",
  })
  @ApiNoContentResponse({ description: "File detached" })
  @ApiNotFoundResponse({
    type: ProblemDetails,
    description: "No available file exists for this campaign",
  })
  async remove(
    @Req() request: RequestWithContext,
    @Param("campaignId") campaignId: string,
    @Param("fileId") fileId: string,
  ): Promise<void> {
    await this.files.removeCampaignFile(
      actingUserId(request),
      campaignId,
      fileId,
    );
  }
}
