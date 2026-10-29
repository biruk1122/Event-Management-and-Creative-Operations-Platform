import {
  Controller,
  Get,
  Param,
  Query,
  Req,
  Res,
  UseGuards,
} from "@nestjs/common";
import {
  ApiCookieAuth,
  ApiForbiddenResponse,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
  ApiUnauthorizedResponse,
} from "@nestjs/swagger";
import type { Response } from "express";

import { unauthenticated } from "../auth/auth.errors.js";
import { AccessTokenGuard } from "../auth/guards/access-token.guard.js";
import { ProblemDetails } from "../common/http/problem-details.js";
import type { RequestWithContext } from "../common/http/request-with-context.js";
import { RequirePermissions } from "../common/security/permissions.decorator.js";
import { PermissionsGuard } from "../common/security/permissions.guard.js";
import {
  DownloadGrantResponse,
  PaginatedManagedFilesResponse,
} from "./file-management.contracts.js";
import { FileManagementService } from "./file-management.service.js";
import { ListManagedFilesQueryDto } from "./dto/list-managed-files-query.dto.js";

function actingUserId(request: RequestWithContext): string {
  const userId = request.user?.userId;
  if (!userId) throw unauthenticated();
  return userId;
}

/**
 * A shared letter's attachments, from the shared-with-me path only (EMP-02)
 * - gated on the baseline `share.read` grant, never `letter.*`. Listing
 * works for any active share; the download route 404s a `VIEW`-only share
 * exactly like a missing file.
 */
@ApiTags("Shared with Me")
@ApiCookieAuth("access_token")
@ApiUnauthorizedResponse({ type: ProblemDetails })
@ApiForbiddenResponse({ type: ProblemDetails })
@UseGuards(AccessTokenGuard, PermissionsGuard)
@Controller("shared-with-me/letters/:letterId/files")
export class SharedLetterFileManagementController {
  constructor(private readonly files: FileManagementService) {}

  @Get()
  @RequirePermissions("share.read")
  @ApiOperation({
    summary: "List files attached to a letter shared with the caller",
  })
  @ApiOkResponse({ type: PaginatedManagedFilesResponse })
  @ApiNotFoundResponse({ type: ProblemDetails })
  async list(
    @Req() request: RequestWithContext,
    @Param("letterId") letterId: string,
    @Query() query: ListManagedFilesQueryDto,
  ): Promise<PaginatedManagedFilesResponse> {
    return this.files.listSharedLetterFiles(
      actingUserId(request),
      letterId,
      query,
    );
  }

  @Get(":fileId/download")
  @RequirePermissions("share.read")
  @ApiOperation({
    summary: "Issue a download grant for a shared letter's attachment",
  })
  @ApiOkResponse({ type: DownloadGrantResponse })
  @ApiNotFoundResponse({
    type: ProblemDetails,
    description: "Not found, or the share does not permit downloading",
  })
  async download(
    @Req() request: RequestWithContext,
    @Res({ passthrough: true }) response: Response,
    @Param("letterId") letterId: string,
    @Param("fileId") fileId: string,
  ): Promise<DownloadGrantResponse> {
    response.setHeader("Cache-Control", "private, no-store");
    return this.files.downloadSharedLetterFile(
      actingUserId(request),
      letterId,
      fileId,
      request.id,
    );
  }
}
