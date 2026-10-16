import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Patch,
  Post,
  Query,
  Req,
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
import { CreateExpenseDto } from "./dto/create-expense.dto.js";
import { ListExpensesQueryDto } from "./dto/list-expenses-query.dto.js";
import { ReviewExpenseDto } from "./dto/review-expense.dto.js";
import { UpdateExpenseDto } from "./dto/update-expense.dto.js";
import {
  ExpenseResponse,
  PaginatedExpensesResponse,
} from "./expenses.contracts.js";
import { ExpensesService } from "./expenses.service.js";

function actingUserId(request: RequestWithContext): string {
  if (!request.user?.userId) throw unauthenticated();
  return request.user.userId;
}

/**
 * Expense management (EOM-01). `expense.approve` is granted only at
 * ORGANIZATION scope to the full permission catalog (Super Admin), never to
 * `DEPARTMENT_MANAGER_GRANTS` - approval is Super-Admin-only by company
 * policy, enforced here on the backend, not merely hidden in the UI.
 */
@ApiTags("Expense management")
@ApiCookieAuth("access_token")
@ApiUnauthorizedResponse({ type: ProblemDetails })
@ApiForbiddenResponse({ type: ProblemDetails })
@UseGuards(AccessTokenGuard, PermissionsGuard)
@Controller("expenses")
export class ExpensesController {
  constructor(private readonly expenses: ExpensesService) {}

  @Get()
  @RequirePermissions("expense.read")
  @ApiOperation({
    summary: "List expenses visible to the caller, with filters",
  })
  @ApiOkResponse({ type: PaginatedExpensesResponse })
  list(
    @Req() req: RequestWithContext,
    @Query() query: ListExpensesQueryDto,
  ): Promise<PaginatedExpensesResponse> {
    return this.expenses.list(actingUserId(req), query);
  }

  @Get(":id")
  @RequirePermissions("expense.read")
  @ApiOperation({ summary: "Get one expense and its full review history" })
  @ApiOkResponse({ type: ExpenseResponse })
  @ApiNotFoundResponse({ type: ProblemDetails })
  get(
    @Req() req: RequestWithContext,
    @Param("id") id: string,
  ): Promise<ExpenseResponse> {
    return this.expenses.get(actingUserId(req), id);
  }

  @Post()
  @UseGuards(CsrfGuard)
  @ApiSecurity("csrf-token")
  @RequirePermissions("expense.create")
  @ApiOperation({
    summary: "Record a draft expense against an event, a production, or both",
  })
  @ApiCreatedResponse({ type: ExpenseResponse })
  @ApiBadRequestResponse({ type: ProblemDetails })
  @ApiNotFoundResponse({ type: ProblemDetails })
  create(
    @Req() req: RequestWithContext,
    @Body() body: CreateExpenseDto,
  ): Promise<ExpenseResponse> {
    return this.expenses.create(actingUserId(req), body);
  }

  @Patch(":id")
  @UseGuards(CsrfGuard)
  @ApiSecurity("csrf-token")
  @RequirePermissions("expense.update")
  @ApiOperation({ summary: "Edit a draft or rejected expense" })
  @ApiOkResponse({ type: ExpenseResponse })
  @ApiBadRequestResponse({ type: ProblemDetails })
  @ApiConflictResponse({ type: ProblemDetails })
  update(
    @Req() req: RequestWithContext,
    @Param("id") id: string,
    @Body() body: UpdateExpenseDto,
  ): Promise<ExpenseResponse> {
    return this.expenses.update(actingUserId(req), id, body);
  }

  @Post(":id/submit")
  @HttpCode(HttpStatus.OK)
  @UseGuards(CsrfGuard)
  @ApiSecurity("csrf-token")
  @RequirePermissions("expense.submit")
  @ApiOperation({ summary: "Submit a draft expense for Super Admin approval" })
  @ApiOkResponse({ type: ExpenseResponse })
  @ApiConflictResponse({ type: ProblemDetails })
  submit(
    @Req() req: RequestWithContext,
    @Param("id") id: string,
  ): Promise<ExpenseResponse> {
    return this.expenses.submit(actingUserId(req), id, req.id);
  }

  @Post(":id/reviews")
  @HttpCode(HttpStatus.OK)
  @UseGuards(CsrfGuard)
  @ApiSecurity("csrf-token")
  @RequirePermissions("expense.approve")
  @ApiOperation({
    summary: "Approve or reject a submitted expense (Super Admin only)",
  })
  @ApiOkResponse({ type: ExpenseResponse })
  @ApiConflictResponse({ type: ProblemDetails })
  review(
    @Req() req: RequestWithContext,
    @Param("id") id: string,
    @Body() body: ReviewExpenseDto,
  ): Promise<ExpenseResponse> {
    return this.expenses.review(actingUserId(req), id, body, req.id);
  }
}
