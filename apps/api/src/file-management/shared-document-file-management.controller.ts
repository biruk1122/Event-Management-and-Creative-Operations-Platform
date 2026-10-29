import { Controller, Get, Param, Req, Res, UseGuards } from "@nestjs/common";
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
import { DownloadGrantResponse } from "./file-management.contracts.js";
import { FileManagementService } from "./file-management.service.js";

function actingUserId(request: RequestWithContext): string {
  const userId = request.user?.userId;
  if (!userId) throw unauthenticated();
  return userId;
}

/**
 * A shared document's single file, from the shared-with-me path only
 * (EMP-02) - gated on the baseline `share.read` grant, never
 * `document.*`. No `fileId` param: a Document never has more than one
 * file. 404s a `VIEW`-only share exactly like a missing file.
 */
@ApiTags("Shared with Me")
@ApiCookieAuth("access_token")
@ApiUnauthorizedResponse({ type: ProblemDetails })
@ApiForbiddenResponse({ type: ProblemDetails })
@UseGuards(AccessTokenGuard, PermissionsGuard)
@Controller("shared-with-me/documents/:documentId")
export class SharedDocumentFileManagementController {
  constructor(private readonly files: FileManagementService) {}

  @Get("download")
  @RequirePermissions("share.read")
  @ApiOperation({
    summary: "Issue a download grant for a shared document's file",
  })
  @ApiOkResponse({ type: DownloadGrantResponse })
  @ApiNotFoundResponse({
    type: ProblemDetails,
    description: "Not found, or the share does not permit downloading",
  })
  async download(
    @Req() request: RequestWithContext,
    @Res({ passthrough: true }) response: Response,
    @Param("documentId") documentId: string,
  ): Promise<DownloadGrantResponse> {
    response.setHeader("Cache-Control", "private, no-store");
    return this.files.downloadSharedDocumentFile(
      actingUserId(request),
      documentId,
      request.id,
    );
  }
}
