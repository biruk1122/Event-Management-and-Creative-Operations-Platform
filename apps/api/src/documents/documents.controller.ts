import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  Patch,
  Post,
  Query,
  Req,
  UseGuards,
} from "@nestjs/common";
import {
  ApiCookieAuth,
  ApiCreatedResponse,
  ApiForbiddenResponse,
  ApiNoContentResponse,
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
import { CreateDocumentDto } from "./dto/create-document.dto.js";
import { ListDocumentsQueryDto } from "./dto/list-documents-query.dto.js";
import { UpdateDocumentDto } from "./dto/update-document.dto.js";
import {
  DocumentOptionsResponse,
  DocumentResponse,
  PaginatedDocumentsResponse,
} from "./documents.contracts.js";
import { DocumentsService } from "./documents.service.js";

function actingUserId(request: RequestWithContext): string {
  if (!request.user?.userId) throw unauthenticated();
  return request.user.userId;
}

/**
 * Every route is gated by `document.*` at the transport boundary (any
 * scope), then by `DocumentsService.requireDocumentAccess` as the precise
 * boundary: only Super Admin, or the HR & Executive Officer department's
 * own manager, ever passes (EMP-02).
 */
@ApiTags("Administration: Documents")
@ApiCookieAuth("access_token")
@ApiUnauthorizedResponse({ type: ProblemDetails })
@ApiForbiddenResponse({ type: ProblemDetails })
@UseGuards(AccessTokenGuard, PermissionsGuard)
@Controller("documents")
export class DocumentsController {
  constructor(private readonly documents: DocumentsService) {}

  @Get()
  @RequirePermissions("document.read")
  @ApiOperation({ summary: "List documents visible to the caller" })
  @ApiOkResponse({ type: PaginatedDocumentsResponse })
  list(
    @Req() req: RequestWithContext,
    @Query() query: ListDocumentsQueryDto,
  ): Promise<PaginatedDocumentsResponse> {
    return this.documents.list(actingUserId(req), query);
  }

  @Get("options")
  @RequirePermissions("document.read")
  @ApiOperation({ summary: "Form options: projects, document types" })
  @ApiOkResponse({ type: DocumentOptionsResponse })
  options(@Req() req: RequestWithContext): Promise<DocumentOptionsResponse> {
    return this.documents.options(actingUserId(req));
  }

  @Get(":id")
  @RequirePermissions("document.read")
  @ApiOperation({ summary: "Get one document" })
  @ApiOkResponse({ type: DocumentResponse })
  @ApiNotFoundResponse({ type: ProblemDetails })
  get(
    @Req() req: RequestWithContext,
    @Param("id") id: string,
  ): Promise<DocumentResponse> {
    return this.documents.get(actingUserId(req), id);
  }

  @Post()
  @UseGuards(CsrfGuard)
  @ApiSecurity("csrf-token")
  @RequirePermissions("document.create")
  @ApiOperation({
    summary: "Create a document shell (attach its file afterward)",
  })
  @ApiCreatedResponse({ type: DocumentResponse })
  create(
    @Req() req: RequestWithContext,
    @Body() body: CreateDocumentDto,
  ): Promise<DocumentResponse> {
    return this.documents.create(actingUserId(req), body, req.id);
  }

  @Patch(":id")
  @UseGuards(CsrfGuard)
  @ApiSecurity("csrf-token")
  @RequirePermissions("document.update")
  @ApiOperation({ summary: "Edit a document's permitted fields" })
  @ApiOkResponse({ type: DocumentResponse })
  @ApiNotFoundResponse({ type: ProblemDetails })
  update(
    @Req() req: RequestWithContext,
    @Param("id") id: string,
    @Body() body: UpdateDocumentDto,
  ): Promise<DocumentResponse> {
    return this.documents.update(actingUserId(req), id, body, req.id);
  }

  @Delete(":id")
  @UseGuards(CsrfGuard)
  @ApiSecurity("csrf-token")
  @RequirePermissions("document.delete")
  @HttpCode(204)
  @ApiOperation({ summary: "Remove a document (Super Admin only)" })
  @ApiNoContentResponse()
  @ApiNotFoundResponse({ type: ProblemDetails })
  async remove(
    @Req() req: RequestWithContext,
    @Param("id") id: string,
  ): Promise<void> {
    await this.documents.remove(actingUserId(req), id, req.id);
  }
}
