import { Controller, Get, Param, Query, Req, UseGuards } from "@nestjs/common";
import {
  ApiCookieAuth,
  ApiForbiddenResponse,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
  ApiUnauthorizedResponse,
} from "@nestjs/swagger";

import { unauthenticated } from "../auth/auth.errors.js";
import { AccessTokenGuard } from "../auth/guards/access-token.guard.js";
import { ProblemDetails } from "../common/http/problem-details.js";
import type { RequestWithContext } from "../common/http/request-with-context.js";
import { RequirePermissions } from "../common/security/permissions.decorator.js";
import { PermissionsGuard } from "../common/security/permissions.guard.js";
import { ListDocumentsQueryDto } from "../documents/dto/list-documents-query.dto.js";
import { ListLettersQueryDto } from "../letters/dto/list-letters-query.dto.js";
import {
  PaginatedSharedDocumentsResponse,
  PaginatedSharedLettersResponse,
  SharedDocumentResponse,
  SharedLetterResponse,
} from "./shared-records.contracts.js";
import { SharedRecordsService } from "./shared-records.service.js";

function actingUserId(request: RequestWithContext): string {
  if (!request.user?.userId) throw unauthenticated();
  return request.user.userId;
}

/**
 * Records explicitly shared with the caller (EMP-02) - independent of
 * `letter.*`/`document.*` management permissions. Gated only on the
 * baseline `share.read` grant every authenticated active user already
 * holds at SELF scope.
 */
@ApiTags("Shared with Me")
@ApiCookieAuth("access_token")
@ApiUnauthorizedResponse({ type: ProblemDetails })
@ApiForbiddenResponse({ type: ProblemDetails })
@UseGuards(AccessTokenGuard, PermissionsGuard)
@Controller("shared-with-me")
export class SharedRecordsController {
  constructor(private readonly sharedRecords: SharedRecordsService) {}

  @Get("letters")
  @RequirePermissions("share.read")
  @ApiOperation({ summary: "List letters shared with the caller" })
  @ApiOkResponse({ type: PaginatedSharedLettersResponse })
  listLetters(
    @Req() req: RequestWithContext,
    @Query() query: ListLettersQueryDto,
  ): Promise<PaginatedSharedLettersResponse> {
    return this.sharedRecords.listLetters(actingUserId(req), query);
  }

  @Get("letters/:id")
  @RequirePermissions("share.read")
  @ApiOperation({ summary: "Get one letter shared with the caller" })
  @ApiOkResponse({ type: SharedLetterResponse })
  @ApiNotFoundResponse({ type: ProblemDetails })
  getLetter(
    @Req() req: RequestWithContext,
    @Param("id") id: string,
  ): Promise<SharedLetterResponse> {
    return this.sharedRecords.getLetter(actingUserId(req), id);
  }

  @Get("documents")
  @RequirePermissions("share.read")
  @ApiOperation({ summary: "List documents shared with the caller" })
  @ApiOkResponse({ type: PaginatedSharedDocumentsResponse })
  listDocuments(
    @Req() req: RequestWithContext,
    @Query() query: ListDocumentsQueryDto,
  ): Promise<PaginatedSharedDocumentsResponse> {
    return this.sharedRecords.listDocuments(actingUserId(req), query);
  }

  @Get("documents/:id")
  @RequirePermissions("share.read")
  @ApiOperation({ summary: "Get one document shared with the caller" })
  @ApiOkResponse({ type: SharedDocumentResponse })
  @ApiNotFoundResponse({ type: ProblemDetails })
  getDocument(
    @Req() req: RequestWithContext,
    @Param("id") id: string,
  ): Promise<SharedDocumentResponse> {
    return this.sharedRecords.getDocument(actingUserId(req), id);
  }
}
