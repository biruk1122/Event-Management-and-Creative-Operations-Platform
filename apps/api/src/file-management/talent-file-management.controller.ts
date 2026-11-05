import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Post,
  Req,
  Res,
  StreamableFile,
  UseGuards,
} from "@nestjs/common";
import type { Response } from "express";
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

import { unauthenticated } from "../auth/auth.errors.js";
import { AccessTokenGuard } from "../auth/guards/access-token.guard.js";
import { CsrfGuard } from "../auth/guards/csrf.guard.js";
import { ProblemDetails } from "../common/http/problem-details.js";
import type { RequestWithContext } from "../common/http/request-with-context.js";
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
 * Profile photos for talent. The service decides access: changing a photo needs
 * the organization talent.update grant, and viewing follows the talent directory
 * rule. No route-level permission key is used, because a Production Manager
 * holds none of the talent keys organization-wide.
 */
@ApiTags("Talent management")
@ApiCookieAuth("access_token")
@ApiUnauthorizedResponse({
  type: ProblemDetails,
  description: "Not authenticated",
})
@ApiForbiddenResponse({
  type: ProblemDetails,
  description: "Not allowed to change this profile photo",
})
@UseGuards(AccessTokenGuard)
@Controller("talents/:talentId/profile-image")
export class TalentFileManagementController {
  constructor(private readonly files: FileManagementService) {}

  @Post("upload-intents")
  @UseGuards(CsrfGuard)
  @ApiSecurity("csrf-token")
  @ApiOperation({
    summary:
      "Create a direct-upload grant for a talent profile photo (JPEG, PNG, or WEBP)",
  })
  @ApiCreatedResponse({ type: UploadIntentResponse })
  @ApiBadRequestResponse({
    type: ProblemDetails,
    description: "Invalid declaration or unsupported image type",
  })
  @ApiNotFoundResponse({
    type: ProblemDetails,
    description: "Talent not found",
  })
  createUploadIntent(
    @Req() request: RequestWithContext,
    @Param("talentId") talentId: string,
    @Body() body: CreateUploadIntentDto,
  ): Promise<UploadIntentResponse> {
    return this.files.createTalentImageUploadIntent(
      actingUserId(request),
      talentId,
      body,
    );
  }

  @Post(":fileId/finalize")
  @HttpCode(HttpStatus.OK)
  @UseGuards(CsrfGuard)
  @ApiSecurity("csrf-token")
  @ApiOperation({
    summary:
      "Verify, scan, and set a completed upload as the talent's profile photo",
  })
  @ApiOkResponse({ type: ManagedFileResponse })
  @ApiConflictResponse({
    type: ProblemDetails,
    description: "Intent expired, upload missing, unsafe, or already finalized",
  })
  @ApiServiceUnavailableResponse({
    type: ProblemDetails,
    description: "File scanner unavailable",
  })
  finalize(
    @Req() request: RequestWithContext,
    @Param("talentId") talentId: string,
    @Param("fileId") fileId: string,
  ): Promise<ManagedFileResponse> {
    return this.files.finalizeTalentImage(
      actingUserId(request),
      talentId,
      fileId,
      request.id,
    );
  }

  /**
   * The photo bytes, served through the API so that every request is authorized.
   * The URL carries the stored file's id, which never changes its content, so the
   * response may be cached privately.
   */
  @Get("content")
  @ApiOperation({
    summary:
      "Stream the talent's profile photo to an authorized directory reader",
  })
  @ApiOkResponse({ description: "The profile photo" })
  @ApiNotFoundResponse({
    type: ProblemDetails,
    description: "Talent or photo not found",
  })
  async content(
    @Req() request: RequestWithContext,
    @Res({ passthrough: true }) response: Response,
    @Param("talentId") talentId: string,
  ): Promise<StreamableFile> {
    const image = await this.files.talentImageContent(
      actingUserId(request),
      talentId,
    );
    response.setHeader("Cache-Control", "private, max-age=300");
    response.setHeader("X-Content-Type-Options", "nosniff");
    // The web app embeds this from another origin, which Helmet's default
    // `same-origin` blocks. `same-site` is not enough either: Chromium refuses
    // it between ports of an IP host. The route stays authenticated, and the
    // session cookie is not sent on cross-site image loads.
    response.setHeader("Cross-Origin-Resource-Policy", "cross-origin");
    return new StreamableFile(Buffer.from(image.bytes), {
      type: image.mediaType,
    });
  }

  @Get()
  @ApiOperation({
    summary: "Issue a short-lived view grant for the talent's profile photo",
  })
  @ApiOkResponse({ type: DownloadGrantResponse })
  @ApiNotFoundResponse({
    type: ProblemDetails,
    description: "Talent or photo not found",
  })
  download(
    @Req() request: RequestWithContext,
    @Param("talentId") talentId: string,
  ): Promise<DownloadGrantResponse> {
    return this.files.talentImageDownloadGrant(actingUserId(request), talentId);
  }
}
