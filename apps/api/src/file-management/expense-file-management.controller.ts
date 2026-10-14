import {
  Body,
  Controller,
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

@ApiTags("Expense management")
@ApiCookieAuth("access_token")
@ApiUnauthorizedResponse({
  type: ProblemDetails,
  description: "Not authenticated",
})
@ApiForbiddenResponse({
  type: ProblemDetails,
  description:
    "Missing permission, outside expense scope, or invalid CSRF token",
})
@UseGuards(AccessTokenGuard, PermissionsGuard)
@Controller("expenses/:expenseId/files")
export class ExpenseFileManagementController {
  constructor(private readonly files: FileManagementService) {}

  @Post("upload-intents")
  @UseGuards(CsrfGuard)
  @ApiSecurity("csrf-token")
  @RequirePermissions("expense.attachment.create")
  @ApiOperation({
    summary:
      "Create a direct-upload grant for an expense attachment (receipt or invoice)",
  })
  @ApiCreatedResponse({ type: UploadIntentResponse })
  @ApiBadRequestResponse({
    type: ProblemDetails,
    description: "Invalid upload declaration",
  })
  @ApiNotFoundResponse({
    type: ProblemDetails,
    description: "Expense not found",
  })
  async createUploadIntent(
    @Req() request: RequestWithContext,
    @Param("expenseId") expenseId: string,
    @Body() body: CreateUploadIntentDto,
  ): Promise<UploadIntentResponse> {
    return this.files.createExpenseUploadIntent(
      actingUserId(request),
      expenseId,
      body,
    );
  }

  @Post(":fileId/finalize")
  @HttpCode(HttpStatus.OK)
  @UseGuards(CsrfGuard)
  @ApiSecurity("csrf-token")
  @RequirePermissions("expense.attachment.create")
  @ApiOperation({
    summary: "Verify, scan, and attach a completed expense upload",
  })
  @ApiOkResponse({ type: ManagedFileResponse })
  @ApiConflictResponse({
    type: ProblemDetails,
    description: "Intent expired, upload missing, unsafe, or already finalized",
  })
  @ApiNotFoundResponse({
    type: ProblemDetails,
    description: "Expense or intent not found",
  })
  @ApiServiceUnavailableResponse({
    type: ProblemDetails,
    description: "File scanner unavailable",
  })
  async finalize(
    @Req() request: RequestWithContext,
    @Param("expenseId") expenseId: string,
    @Param("fileId") fileId: string,
  ): Promise<ManagedFileResponse> {
    return this.files.finalizeExpenseUpload(
      actingUserId(request),
      expenseId,
      fileId,
    );
  }

  @Get()
  @RequirePermissions("expense.read")
  @ApiOperation({ summary: "List available files attached to an expense" })
  @ApiOkResponse({ type: PaginatedManagedFilesResponse })
  @ApiBadRequestResponse({
    type: ProblemDetails,
    description: "Invalid pagination query",
  })
  @ApiNotFoundResponse({
    type: ProblemDetails,
    description: "Expense not found",
  })
  async list(
    @Req() request: RequestWithContext,
    @Param("expenseId") expenseId: string,
    @Query() query: ListManagedFilesQueryDto,
  ): Promise<PaginatedManagedFilesResponse> {
    return this.files.listExpenseFiles(actingUserId(request), expenseId, query);
  }

  @Get(":fileId/download")
  @RequirePermissions("expense.read")
  @ApiOperation({
    summary: "Issue a private download grant for an expense file",
  })
  @ApiOkResponse({ type: DownloadGrantResponse })
  @ApiNotFoundResponse({
    type: ProblemDetails,
    description: "Expense file not found",
  })
  async download(
    @Req() request: RequestWithContext,
    @Res({ passthrough: true }) response: Response,
    @Param("expenseId") expenseId: string,
    @Param("fileId") fileId: string,
  ): Promise<DownloadGrantResponse> {
    response.setHeader("Cache-Control", "private, no-store");
    return this.files.downloadExpenseFile(
      actingUserId(request),
      expenseId,
      fileId,
      request.id,
    );
  }
}
