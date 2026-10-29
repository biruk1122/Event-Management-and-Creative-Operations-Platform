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
  Put,
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
import { CreateTaskChecklistItemDto } from "./dto/create-task-checklist-item.dto.js";
import { CreateTaskCommentDto } from "./dto/create-task-comment.dto.js";
import { CreateTaskDto } from "./dto/create-task.dto.js";
import { ListEligibleAssigneesQueryDto } from "./dto/list-eligible-assignees-query.dto.js";
import { ListTaskFeedQueryDto } from "./dto/list-task-feed-query.dto.js";
import { ListTasksQueryDto } from "./dto/list-tasks-query.dto.js";
import { ReviewTaskDto } from "./dto/review-task.dto.js";
import { ToggleTaskChecklistItemDto } from "./dto/toggle-task-checklist-item.dto.js";
import { TransitionTaskDto } from "./dto/transition-task.dto.js";
import {
  ReorderTaskChecklistItemsDto,
  UpdateTaskChecklistItemDto,
} from "./dto/update-task-checklist-item.dto.js";
import { UpdateTaskDto } from "./dto/update-task.dto.js";
import {
  PaginatedTaskActivitiesResponse,
  PaginatedTaskCommentsResponse,
  PaginatedTaskReviewsResponse,
  PaginatedTasksResponse,
  TaskChecklistItemResponse,
  TaskCommentResponse,
  TaskEligibleAssigneesResponse,
  TaskResponse,
} from "./tasks.contracts.js";
import { TasksService } from "./tasks.service.js";

function actingUserId(request: RequestWithContext): string {
  const userId = request.user?.userId;
  if (!userId) throw unauthenticated();
  return userId;
}

@ApiTags("Task management")
@ApiCookieAuth("access_token")
@ApiUnauthorizedResponse({
  type: ProblemDetails,
  description: "Not authenticated",
})
@ApiForbiddenResponse({
  type: ProblemDetails,
  description:
    "Missing permission, outside the resolved scope, or invalid CSRF token",
})
@ApiBadRequestResponse({
  type: ProblemDetails,
  description: "Invalid request fields, owner, progress, or schedule",
})
@UseGuards(AccessTokenGuard, PermissionsGuard)
@Controller("tasks")
export class TasksController {
  constructor(private readonly tasks: TasksService) {}

  @Get()
  @RequirePermissions("task.read")
  @ApiOperation({
    summary: "List visible tasks for list, Kanban, and calendar projections",
  })
  @ApiOkResponse({ type: PaginatedTasksResponse })
  async list(
    @Req() request: RequestWithContext,
    @Query() query: ListTasksQueryDto,
  ): Promise<PaginatedTasksResponse> {
    return this.tasks.list(actingUserId(request), query);
  }

  @Post()
  @UseGuards(CsrfGuard)
  @ApiSecurity("csrf-token")
  @RequirePermissions("task.create")
  @ApiOperation({ summary: "Create a workspace or department task" })
  @ApiCreatedResponse({ type: TaskResponse })
  @ApiNotFoundResponse({
    type: ProblemDetails,
    description: "Workspace or department not found",
  })
  async create(
    @Req() request: RequestWithContext,
    @Body() body: CreateTaskDto,
  ): Promise<TaskResponse> {
    return this.tasks.create(actingUserId(request), body, request.id);
  }

  @Get("eligible-assignees")
  @RequirePermissions("task.create")
  @ApiOperation({
    summary: "List a department's active staff eligible for task assignment",
  })
  @ApiOkResponse({ type: TaskEligibleAssigneesResponse })
  @ApiNotFoundResponse({
    type: ProblemDetails,
    description: "Department not found",
  })
  async listEligibleAssignees(
    @Req() request: RequestWithContext,
    @Query() query: ListEligibleAssigneesQueryDto,
  ): Promise<TaskEligibleAssigneesResponse> {
    const items = await this.tasks.listEligibleAssignees(
      actingUserId(request),
      query.departmentId,
    );
    return { items };
  }

  @Get(":id")
  @RequirePermissions("task.read")
  @ApiOperation({ summary: "Get task details and assignees" })
  @ApiOkResponse({ type: TaskResponse })
  @ApiNotFoundResponse({ type: ProblemDetails, description: "Task not found" })
  async get(
    @Req() request: RequestWithContext,
    @Param("id") id: string,
  ): Promise<TaskResponse> {
    return this.tasks.get(actingUserId(request), id);
  }

  @Patch(":id")
  @UseGuards(CsrfGuard)
  @ApiSecurity("csrf-token")
  @RequirePermissions("task.update")
  @ApiOperation({
    summary:
      "Update task fields other than owners, status, progress, and assignees",
  })
  @ApiOkResponse({ type: TaskResponse })
  @ApiNotFoundResponse({ type: ProblemDetails, description: "Task not found" })
  async update(
    @Req() request: RequestWithContext,
    @Param("id") id: string,
    @Body() body: UpdateTaskDto,
  ): Promise<TaskResponse> {
    return this.tasks.update(actingUserId(request), id, body);
  }

  @Put(":id/assignees/:userId")
  @HttpCode(HttpStatus.OK)
  @UseGuards(CsrfGuard)
  @ApiSecurity("csrf-token")
  @RequirePermissions("task.assign")
  @ApiOperation({ summary: "Assign a user to a task (idempotent)" })
  @ApiOkResponse({ type: TaskResponse })
  @ApiNotFoundResponse({
    type: ProblemDetails,
    description: "Task or user not found",
  })
  async addAssignee(
    @Req() request: RequestWithContext,
    @Param("id") id: string,
    @Param("userId") userId: string,
  ): Promise<TaskResponse> {
    return this.tasks.addAssignee(
      actingUserId(request),
      id,
      userId,
      request.id,
    );
  }

  @Delete(":id/assignees/:userId")
  @HttpCode(HttpStatus.OK)
  @UseGuards(CsrfGuard)
  @ApiSecurity("csrf-token")
  @RequirePermissions("task.assign")
  @ApiOperation({ summary: "Remove a task assignee" })
  @ApiOkResponse({ type: TaskResponse })
  @ApiConflictResponse({
    type: ProblemDetails,
    description: "The user is not assigned to the task",
  })
  @ApiNotFoundResponse({ type: ProblemDetails, description: "Task not found" })
  async removeAssignee(
    @Req() request: RequestWithContext,
    @Param("id") id: string,
    @Param("userId") userId: string,
  ): Promise<TaskResponse> {
    return this.tasks.removeAssignee(
      actingUserId(request),
      id,
      userId,
      request.id,
    );
  }

  @Post(":id/transition")
  @HttpCode(HttpStatus.OK)
  @UseGuards(CsrfGuard)
  @ApiSecurity("csrf-token")
  @RequirePermissions("task.update_status")
  @ApiOperation({ summary: "Apply an allowed assignee lifecycle transition" })
  @ApiOkResponse({ type: TaskResponse })
  @ApiConflictResponse({
    type: ProblemDetails,
    description: "Invalid transition",
  })
  @ApiNotFoundResponse({ type: ProblemDetails, description: "Task not found" })
  async transition(
    @Req() request: RequestWithContext,
    @Param("id") id: string,
    @Body() body: TransitionTaskDto,
  ): Promise<TaskResponse> {
    return this.tasks.transition(actingUserId(request), id, body.status);
  }

  @Post(":id/submit")
  @HttpCode(HttpStatus.OK)
  @UseGuards(CsrfGuard)
  @ApiSecurity("csrf-token")
  @RequirePermissions("task.submit")
  @ApiOperation({ summary: "Submit an in-progress assigned task for review" })
  @ApiOkResponse({ type: TaskResponse })
  @ApiConflictResponse({
    type: ProblemDetails,
    description: "Invalid transition",
  })
  @ApiNotFoundResponse({ type: ProblemDetails, description: "Task not found" })
  async submit(
    @Req() request: RequestWithContext,
    @Param("id") id: string,
  ): Promise<TaskResponse> {
    return this.tasks.submit(actingUserId(request), id, request.id);
  }

  @Get(":id/checklist-items")
  @RequirePermissions("task.read")
  @ApiOperation({ summary: "List a task's own checklist items" })
  @ApiOkResponse({ type: [TaskChecklistItemResponse] })
  @ApiNotFoundResponse({ type: ProblemDetails, description: "Task not found" })
  async listChecklistItems(
    @Req() request: RequestWithContext,
    @Param("id") id: string,
  ): Promise<TaskChecklistItemResponse[]> {
    return this.tasks.listChecklistItems(actingUserId(request), id);
  }

  @Post(":id/checklist-items")
  @UseGuards(CsrfGuard)
  @ApiSecurity("csrf-token")
  @RequirePermissions("task.update")
  @ApiOperation({ summary: "Add a checklist item (checkpoint) to a task" })
  @ApiCreatedResponse({ type: TaskChecklistItemResponse })
  @ApiNotFoundResponse({ type: ProblemDetails, description: "Task not found" })
  async addChecklistItem(
    @Req() request: RequestWithContext,
    @Param("id") id: string,
    @Body() body: CreateTaskChecklistItemDto,
  ): Promise<TaskChecklistItemResponse> {
    return this.tasks.addChecklistItem(actingUserId(request), id, body);
  }

  @Patch(":id/checklist-items/:itemId")
  @UseGuards(CsrfGuard)
  @ApiSecurity("csrf-token")
  @RequirePermissions("task.update")
  @ApiOperation({ summary: "Edit a checklist item's description" })
  @ApiOkResponse({ type: TaskChecklistItemResponse })
  @ApiNotFoundResponse({
    type: ProblemDetails,
    description: "Task or checklist item not found",
  })
  async updateChecklistItem(
    @Req() request: RequestWithContext,
    @Param("id") id: string,
    @Param("itemId") itemId: string,
    @Body() body: UpdateTaskChecklistItemDto,
  ): Promise<TaskChecklistItemResponse> {
    return this.tasks.updateChecklistItem(
      actingUserId(request),
      id,
      itemId,
      body,
    );
  }

  @Delete(":id/checklist-items/:itemId")
  @HttpCode(HttpStatus.NO_CONTENT)
  @UseGuards(CsrfGuard)
  @ApiSecurity("csrf-token")
  @RequirePermissions("task.update")
  @ApiOperation({ summary: "Remove a checklist item from a task" })
  @ApiNotFoundResponse({
    type: ProblemDetails,
    description: "Task or checklist item not found",
  })
  async removeChecklistItem(
    @Req() request: RequestWithContext,
    @Param("id") id: string,
    @Param("itemId") itemId: string,
  ): Promise<void> {
    await this.tasks.removeChecklistItem(actingUserId(request), id, itemId);
  }

  @Post(":id/checklist-items/reorder")
  @HttpCode(HttpStatus.OK)
  @UseGuards(CsrfGuard)
  @ApiSecurity("csrf-token")
  @RequirePermissions("task.update")
  @ApiOperation({ summary: "Reorder a task's checklist items" })
  @ApiOkResponse({ type: [TaskChecklistItemResponse] })
  @ApiBadRequestResponse({
    type: ProblemDetails,
    description: "The id list did not exactly match the task's current items",
  })
  @ApiNotFoundResponse({ type: ProblemDetails, description: "Task not found" })
  async reorderChecklistItems(
    @Req() request: RequestWithContext,
    @Param("id") id: string,
    @Body() body: ReorderTaskChecklistItemsDto,
  ): Promise<TaskChecklistItemResponse[]> {
    return this.tasks.reorderChecklistItems(actingUserId(request), id, body);
  }

  @Patch(":id/checklist-items/:itemId/completion")
  @UseGuards(CsrfGuard)
  @ApiSecurity("csrf-token")
  @RequirePermissions("task.update_progress")
  @ApiOperation({
    summary: "Mark one of a task's own checklist items complete or incomplete",
  })
  @ApiOkResponse({ type: TaskResponse })
  @ApiNotFoundResponse({
    type: ProblemDetails,
    description: "Task or checklist item not found",
  })
  async toggleChecklistItem(
    @Req() request: RequestWithContext,
    @Param("id") id: string,
    @Param("itemId") itemId: string,
    @Body() body: ToggleTaskChecklistItemDto,
  ): Promise<TaskResponse> {
    return this.tasks.toggleChecklistItem(
      actingUserId(request),
      id,
      itemId,
      body.completed,
    );
  }

  @Post(":id/reviews")
  @UseGuards(CsrfGuard)
  @ApiSecurity("csrf-token")
  @RequirePermissions("task.review")
  @ApiOperation({ summary: "Approve a task under review or request changes" })
  @ApiCreatedResponse({ type: TaskResponse })
  @ApiConflictResponse({
    type: ProblemDetails,
    description: "The task is not under review",
  })
  @ApiNotFoundResponse({ type: ProblemDetails, description: "Task not found" })
  async review(
    @Req() request: RequestWithContext,
    @Param("id") id: string,
    @Body() body: ReviewTaskDto,
  ): Promise<TaskResponse> {
    return this.tasks.review(actingUserId(request), id, body, request.id);
  }

  @Get(":id/reviews")
  @RequirePermissions("task.read")
  @ApiOperation({ summary: "List immutable task review outcomes" })
  @ApiOkResponse({ type: PaginatedTaskReviewsResponse })
  @ApiNotFoundResponse({ type: ProblemDetails, description: "Task not found" })
  async listReviews(
    @Req() request: RequestWithContext,
    @Param("id") id: string,
    @Query() query: ListTaskFeedQueryDto,
  ): Promise<PaginatedTaskReviewsResponse> {
    return this.tasks.listReviews(actingUserId(request), id, query);
  }

  @Post(":id/comments")
  @UseGuards(CsrfGuard)
  @ApiSecurity("csrf-token")
  @RequirePermissions("task.comment.create")
  @ApiOperation({ summary: "Add a task comment with explicit user mentions" })
  @ApiCreatedResponse({ type: TaskCommentResponse })
  @ApiNotFoundResponse({
    type: ProblemDetails,
    description: "Task or mentioned user not found",
  })
  async createComment(
    @Req() request: RequestWithContext,
    @Param("id") id: string,
    @Body() body: CreateTaskCommentDto,
  ): Promise<TaskCommentResponse> {
    return this.tasks.createComment(actingUserId(request), id, body);
  }

  @Get(":id/comments")
  @RequirePermissions("task.read")
  @ApiOperation({ summary: "List task comments and normalized mentions" })
  @ApiOkResponse({ type: PaginatedTaskCommentsResponse })
  @ApiNotFoundResponse({ type: ProblemDetails, description: "Task not found" })
  async listComments(
    @Req() request: RequestWithContext,
    @Param("id") id: string,
    @Query() query: ListTaskFeedQueryDto,
  ): Promise<PaginatedTaskCommentsResponse> {
    return this.tasks.listComments(actingUserId(request), id, query);
  }

  @Get(":id/activity")
  @RequirePermissions("task.read")
  @ApiOperation({ summary: "List the append-only task activity feed" })
  @ApiOkResponse({ type: PaginatedTaskActivitiesResponse })
  @ApiNotFoundResponse({ type: ProblemDetails, description: "Task not found" })
  async listActivity(
    @Req() request: RequestWithContext,
    @Param("id") id: string,
    @Query() query: ListTaskFeedQueryDto,
  ): Promise<PaginatedTaskActivitiesResponse> {
    return this.tasks.listActivities(actingUserId(request), id, query);
  }
}
