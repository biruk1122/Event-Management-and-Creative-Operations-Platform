import {
  Body,
  Controller,
  Get,
  Param,
  Post,
  Req,
  UseGuards,
} from "@nestjs/common";
import {
  ApiCookieAuth,
  ApiCreatedResponse,
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
import { CreateShareDto } from "./dto/create-share.dto.js";
import { ShareResponse } from "./sharing.contracts.js";
import { SharingService } from "./sharing.service.js";

function actingUserId(request: RequestWithContext): string {
  if (!request.user?.userId) throw unauthenticated();
  return request.user.userId;
}

/**
 * Sharing a document (EMP-02). `SharingService` delegates the real
 * boundary to `DocumentsService.authorize(..., "document.share")` - only
 * Super Admin, or the HR & Executive Officer department's own manager,
 * ever passes.
 */
@ApiTags("Administration: Documents")
@ApiCookieAuth("access_token")
@ApiUnauthorizedResponse({ type: ProblemDetails })
@ApiForbiddenResponse({ type: ProblemDetails })
@UseGuards(AccessTokenGuard, PermissionsGuard)
@Controller("documents/:documentId/shares")
export class DocumentSharesController {
  constructor(private readonly sharing: SharingService) {}

  @Get()
  @RequirePermissions("document.share")
  @ApiOperation({ summary: "List a document's active shares" })
  @ApiOkResponse({ type: [ShareResponse] })
  @ApiNotFoundResponse({ type: ProblemDetails })
  list(
    @Req() req: RequestWithContext,
    @Param("documentId") documentId: string,
  ): Promise<ShareResponse[]> {
    return this.sharing.listDocumentShares(actingUserId(req), documentId);
  }

  @Post()
  @UseGuards(CsrfGuard)
  @ApiSecurity("csrf-token")
  @RequirePermissions("document.share")
  @ApiOperation({
    summary: "Share a document with one employee or with all employees",
  })
  @ApiCreatedResponse({ type: ShareResponse })
  @ApiNotFoundResponse({ type: ProblemDetails })
  create(
    @Req() req: RequestWithContext,
    @Param("documentId") documentId: string,
    @Body() body: CreateShareDto,
  ): Promise<ShareResponse> {
    return this.sharing.shareDocument(
      actingUserId(req),
      documentId,
      body,
      req.id,
    );
  }
}
