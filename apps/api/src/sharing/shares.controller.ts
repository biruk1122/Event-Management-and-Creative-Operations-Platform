import {
  Controller,
  Delete,
  HttpCode,
  Param,
  Req,
  UseGuards,
} from "@nestjs/common";
import {
  ApiCookieAuth,
  ApiConflictResponse,
  ApiForbiddenResponse,
  ApiNoContentResponse,
  ApiNotFoundResponse,
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
import { PermissionsGuard } from "../common/security/permissions.guard.js";
import { SharingService } from "./sharing.service.js";

function actingUserId(request: RequestWithContext): string {
  if (!request.user?.userId) throw unauthenticated();
  return request.user.userId;
}

/**
 * Revoking a share by its own id (EMP-02). No transport-level
 * `@RequirePermissions` here - a share's parent can be either a letter or a
 * document, so `SharingService.revoke` resolves which one and delegates to
 * that parent's own `letter.share`/`document.share` boundary.
 */
@ApiTags("Administration: Letters")
@ApiCookieAuth("access_token")
@ApiUnauthorizedResponse({ type: ProblemDetails })
@ApiForbiddenResponse({ type: ProblemDetails })
@UseGuards(AccessTokenGuard, PermissionsGuard)
@Controller("shares")
export class SharesController {
  constructor(private readonly sharing: SharingService) {}

  @Delete(":id")
  @UseGuards(CsrfGuard)
  @ApiSecurity("csrf-token")
  @HttpCode(204)
  @ApiOperation({ summary: "Revoke a share" })
  @ApiNoContentResponse()
  @ApiNotFoundResponse({ type: ProblemDetails })
  @ApiConflictResponse({
    type: ProblemDetails,
    description: "Already revoked",
  })
  async revoke(
    @Req() req: RequestWithContext,
    @Param("id") id: string,
  ): Promise<void> {
    await this.sharing.revoke(actingUserId(req), id, req.id);
  }
}
