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
import { LetterCategory } from "../generated/prisma/client.js";
import { CreateLetterDto } from "./dto/create-letter.dto.js";
import { CreateLetterRemarkDto } from "./dto/create-letter-remark.dto.js";
import { ListLettersQueryDto } from "./dto/list-letters-query.dto.js";
import { UpdateLetterDto } from "./dto/update-letter.dto.js";
import {
  LetterOptionsResponse,
  LetterReferencePreviewResponse,
  LetterRemarkResponse,
  LetterResponse,
  PaginatedLettersResponse,
} from "./letters.contracts.js";
import { LettersService } from "./letters.service.js";

function actingUserId(request: RequestWithContext): string {
  if (!request.user?.userId) throw unauthenticated();
  return request.user.userId;
}

/**
 * Every route is gated by `letter.*` at the transport boundary (any scope),
 * then by `LettersService.requireLetterAccess` as the precise boundary:
 * only Super Admin, or the HR & Executive Officer department's own manager,
 * ever passes (EMP-02).
 */
@ApiTags("Administration: Letters")
@ApiCookieAuth("access_token")
@ApiUnauthorizedResponse({ type: ProblemDetails })
@ApiForbiddenResponse({ type: ProblemDetails })
@UseGuards(AccessTokenGuard, PermissionsGuard)
@Controller("letters")
export class LettersController {
  constructor(private readonly letters: LettersService) {}

  @Get()
  @RequirePermissions("letter.read")
  @ApiOperation({ summary: "List letters visible to the caller" })
  @ApiOkResponse({ type: PaginatedLettersResponse })
  list(
    @Req() req: RequestWithContext,
    @Query() query: ListLettersQueryDto,
  ): Promise<PaginatedLettersResponse> {
    return this.letters.list(actingUserId(req), query);
  }

  @Get("options")
  @RequirePermissions("letter.read")
  @ApiOperation({ summary: "Form options: projects, categories, directions" })
  @ApiOkResponse({ type: LetterOptionsResponse })
  options(@Req() req: RequestWithContext): Promise<LetterOptionsResponse> {
    return this.letters.options(actingUserId(req));
  }

  @Get("reference-preview")
  @RequirePermissions("letter.create")
  @ApiOperation({
    summary: "Non-reserving preview of the next reference number",
  })
  @ApiOkResponse({ type: LetterReferencePreviewResponse })
  referencePreview(
    @Req() req: RequestWithContext,
    @Query("category") category: LetterCategory,
  ): Promise<LetterReferencePreviewResponse> {
    return this.letters.referencePreview(actingUserId(req), category);
  }

  @Get(":id")
  @RequirePermissions("letter.read")
  @ApiOperation({ summary: "Get one letter" })
  @ApiOkResponse({ type: LetterResponse })
  @ApiNotFoundResponse({ type: ProblemDetails })
  get(
    @Req() req: RequestWithContext,
    @Param("id") id: string,
  ): Promise<LetterResponse> {
    return this.letters.get(actingUserId(req), id);
  }

  @Post()
  @UseGuards(CsrfGuard)
  @ApiSecurity("csrf-token")
  @RequirePermissions("letter.create")
  @ApiOperation({ summary: "Register a letter" })
  @ApiCreatedResponse({ type: LetterResponse })
  create(
    @Req() req: RequestWithContext,
    @Body() body: CreateLetterDto,
  ): Promise<LetterResponse> {
    return this.letters.create(actingUserId(req), body, req.id);
  }

  @Patch(":id")
  @UseGuards(CsrfGuard)
  @ApiSecurity("csrf-token")
  @RequirePermissions("letter.update")
  @ApiOperation({ summary: "Edit a letter's permitted fields" })
  @ApiOkResponse({ type: LetterResponse })
  @ApiNotFoundResponse({ type: ProblemDetails })
  update(
    @Req() req: RequestWithContext,
    @Param("id") id: string,
    @Body() body: UpdateLetterDto,
  ): Promise<LetterResponse> {
    return this.letters.update(actingUserId(req), id, body, req.id);
  }

  @Delete(":id")
  @UseGuards(CsrfGuard)
  @ApiSecurity("csrf-token")
  @RequirePermissions("letter.delete")
  @HttpCode(204)
  @ApiOperation({ summary: "Remove a letter (Super Admin only)" })
  @ApiNoContentResponse()
  @ApiNotFoundResponse({ type: ProblemDetails })
  async remove(
    @Req() req: RequestWithContext,
    @Param("id") id: string,
  ): Promise<void> {
    await this.letters.remove(actingUserId(req), id, req.id);
  }

  @Get(":id/remarks")
  @RequirePermissions("letter.read")
  @ApiOperation({ summary: "List a letter's remarks, oldest first" })
  @ApiOkResponse({ type: [LetterRemarkResponse] })
  @ApiNotFoundResponse({ type: ProblemDetails })
  listRemarks(
    @Req() req: RequestWithContext,
    @Param("id") id: string,
  ): Promise<LetterRemarkResponse[]> {
    return this.letters.listRemarks(actingUserId(req), id);
  }

  @Post(":id/remarks")
  @UseGuards(CsrfGuard)
  @ApiSecurity("csrf-token")
  @RequirePermissions("letter.update")
  @ApiOperation({ summary: "Add a remark to a letter" })
  @ApiCreatedResponse({ type: LetterRemarkResponse })
  @ApiNotFoundResponse({ type: ProblemDetails })
  addRemark(
    @Req() req: RequestWithContext,
    @Param("id") id: string,
    @Body() body: CreateLetterRemarkDto,
  ): Promise<LetterRemarkResponse> {
    return this.letters.addRemark(actingUserId(req), id, body);
  }
}
