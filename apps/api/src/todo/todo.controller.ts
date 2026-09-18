import {
  Body,
  Controller,
  Delete,
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
import { TodoFeedResponse, TodoResponse } from "./todo.contracts.js";
import { TodoService } from "./todo.service.js";
import { CreateTodoDto } from "./dto/create-todo.dto.js";
import { ListTodoQueryDto } from "./dto/list-todo-query.dto.js";
import { UpdateTodoDto } from "./dto/update-todo.dto.js";

function actingUserId(request: RequestWithContext): string {
  const userId = request.user?.userId;
  if (!userId) throw unauthenticated();
  return userId;
}

/**
 * Personal To-Do items and reminders (SRS 5.15) - always the caller's own,
 * separate from official Task Management.
 */
@ApiTags("Personal to-do and reminders")
@ApiCookieAuth("access_token")
@ApiUnauthorizedResponse({
  type: ProblemDetails,
  description: "Not authenticated",
})
@ApiForbiddenResponse({
  type: ProblemDetails,
  description: "Missing the required permission, or CSRF token invalid",
})
@UseGuards(AccessTokenGuard, PermissionsGuard)
@Controller("todos")
export class TodoController {
  constructor(private readonly todos: TodoService) {}

  @Get()
  @RequirePermissions("todo.read")
  @ApiOperation({ summary: "List the caller's to-do items" })
  @ApiOkResponse({ type: TodoFeedResponse })
  async list(
    @Req() request: RequestWithContext,
    @Query() query: ListTodoQueryDto,
  ): Promise<TodoFeedResponse> {
    return this.todos.list(actingUserId(request), query);
  }

  @Get(":id")
  @RequirePermissions("todo.read")
  @ApiOperation({ summary: "Get one to-do item owned by the caller" })
  @ApiOkResponse({ type: TodoResponse })
  @ApiNotFoundResponse({ type: ProblemDetails, description: "To-do not found" })
  async get(
    @Req() request: RequestWithContext,
    @Param("id") id: string,
  ): Promise<TodoResponse> {
    return this.todos.get(actingUserId(request), id);
  }

  @Post()
  @UseGuards(CsrfGuard)
  @ApiSecurity("csrf-token")
  @RequirePermissions("todo.create")
  @ApiOperation({ summary: "Create a personal to-do item" })
  @ApiCreatedResponse({ type: TodoResponse })
  async create(
    @Req() request: RequestWithContext,
    @Body() body: CreateTodoDto,
  ): Promise<TodoResponse> {
    return this.todos.create(actingUserId(request), body);
  }

  @Patch(":id")
  @UseGuards(CsrfGuard)
  @ApiSecurity("csrf-token")
  @RequirePermissions("todo.update")
  @ApiOperation({ summary: "Update a to-do item owned by the caller" })
  @ApiOkResponse({ type: TodoResponse })
  @ApiNotFoundResponse({ type: ProblemDetails, description: "To-do not found" })
  async update(
    @Req() request: RequestWithContext,
    @Param("id") id: string,
    @Body() body: UpdateTodoDto,
  ): Promise<TodoResponse> {
    return this.todos.update(actingUserId(request), id, body);
  }

  @Delete(":id")
  @HttpCode(HttpStatus.NO_CONTENT)
  @UseGuards(CsrfGuard)
  @ApiSecurity("csrf-token")
  @RequirePermissions("todo.delete")
  @ApiOperation({ summary: "Delete a to-do item owned by the caller" })
  @ApiNoContentResponse({ description: "The to-do item was removed" })
  @ApiNotFoundResponse({ type: ProblemDetails, description: "To-do not found" })
  async remove(
    @Req() request: RequestWithContext,
    @Param("id") id: string,
  ): Promise<void> {
    await this.todos.remove(actingUserId(request), id);
  }
}
