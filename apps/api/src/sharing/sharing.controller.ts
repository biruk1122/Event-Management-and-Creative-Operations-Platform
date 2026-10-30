import { Controller, Get, Query, Req, UseGuards } from "@nestjs/common";
import {
  ApiCookieAuth,
  ApiForbiddenResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
  ApiUnauthorizedResponse,
} from "@nestjs/swagger";

import { unauthenticated } from "../auth/auth.errors.js";
import { AccessTokenGuard } from "../auth/guards/access-token.guard.js";
import { ProblemDetails } from "../common/http/problem-details.js";
import type { RequestWithContext } from "../common/http/request-with-context.js";
import { PermissionsGuard } from "../common/security/permissions.guard.js";
import { ListRecipientsQueryDto } from "./dto/list-recipients-query.dto.js";
import { ShareRecipientOption } from "./sharing.contracts.js";
import { SharingService } from "./sharing.service.js";

function actingUserId(request: RequestWithContext): string {
  if (!request.user?.userId) throw unauthenticated();
  return request.user.userId;
}

/**
 * Finds employees to share a letter/document with (EMP-02).
 * `SharingService.searchRecipients` requires the caller hold at least one
 * of `letter.share`/`document.share` - the same two actors who can share
 * anything at all, never a general employee directory.
 */
@ApiTags("Administration: Letters")
@ApiCookieAuth("access_token")
@ApiUnauthorizedResponse({ type: ProblemDetails })
@ApiForbiddenResponse({ type: ProblemDetails })
@UseGuards(AccessTokenGuard, PermissionsGuard)
@Controller("sharing")
export class SharingController {
  constructor(private readonly sharing: SharingService) {}

  @Get("recipients")
  @ApiOperation({ summary: "Search active employees to share a record with" })
  @ApiOkResponse({ type: [ShareRecipientOption] })
  recipients(
    @Req() req: RequestWithContext,
    @Query() query: ListRecipientsQueryDto,
  ): Promise<ShareRecipientOption[]> {
    return this.sharing.searchRecipients(actingUserId(req), query);
  }
}
