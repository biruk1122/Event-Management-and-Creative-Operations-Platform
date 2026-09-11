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
  ApiConflictResponse,
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
import {
  PaginatedProjectsResponse,
  ProjectResponse,
} from "./projects.contracts.js";
import { ProjectsService } from "./projects.service.js";
import { AssignProjectManagerDto } from "./dto/assign-project-manager.dto.js";
import { CreateProjectDto } from "./dto/create-project.dto.js";
import { ListProjectsQueryDto } from "./dto/list-projects-query.dto.js";
import { TransitionProjectDto } from "./dto/transition-project.dto.js";
import { UpdateProjectDto } from "./dto/update-project.dto.js";

/** `AccessTokenGuard` always runs first in this controller's guard chain and
 * sets `request.user`; this only guards against that invariant changing. */
function actingUserId(request: RequestWithContext): string {
  const userId = request.user?.userId;
  if (!userId) {
    throw unauthenticated();
  }
  return userId;
}

/**
 * General project management (SRS 9). Every route is for a project, so - like
 * the event controller - the required permission is known statically and
 * declared with `@RequirePermissions`. `ProjectsService` re-checks that key at
 * ORGANIZATION scope as the precise boundary. The guard chain enforces
 * authentication on every route and a CSRF token on every mutation.
 */
@ApiTags("General project management")
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
@Controller("projects")
export class ProjectsController {
  constructor(private readonly projects: ProjectsService) {}

  @Get()
  @RequirePermissions("project.read")
  @ApiOperation({ summary: "List projects the caller may see, with filters" })
  @ApiOkResponse({ type: PaginatedProjectsResponse })
  async list(
    @Req() request: RequestWithContext,
    @Query() query: ListProjectsQueryDto,
  ): Promise<PaginatedProjectsResponse> {
    return this.projects.list(actingUserId(request), query);
  }

  @Get(":id")
  @RequirePermissions("project.read")
  @ApiOperation({
    summary: "Get one project with its connected workspace overview",
  })
  @ApiOkResponse({ type: ProjectResponse })
  @ApiNotFoundResponse({
    type: ProblemDetails,
    description: "Project not found",
  })
  async get(
    @Req() request: RequestWithContext,
    @Param("id") id: string,
  ): Promise<ProjectResponse> {
    return this.projects.get(actingUserId(request), id);
  }

  @Post()
  @UseGuards(CsrfGuard)
  @ApiSecurity("csrf-token")
  @RequirePermissions("project.create")
  @ApiOperation({
    summary: "Create a project and its connected workspace",
  })
  @ApiCreatedResponse({ type: ProjectResponse })
  @ApiNotFoundResponse({
    type: ProblemDetails,
    description:
      "The requested manager user, or the related event, does not exist",
  })
  async create(
    @Req() request: RequestWithContext,
    @Body() body: CreateProjectDto,
  ): Promise<ProjectResponse> {
    return this.projects.create(actingUserId(request), body);
  }

  @Patch(":id")
  @UseGuards(CsrfGuard)
  @ApiSecurity("csrf-token")
  @RequirePermissions("project.update")
  @ApiOperation({
    summary: "Update project details (not status, manager, or teams)",
  })
  @ApiOkResponse({ type: ProjectResponse })
  @ApiNotFoundResponse({
    type: ProblemDetails,
    description: "Project not found, or the related event does not exist",
  })
  async update(
    @Req() request: RequestWithContext,
    @Param("id") id: string,
    @Body() body: UpdateProjectDto,
  ): Promise<ProjectResponse> {
    return this.projects.update(actingUserId(request), id, body);
  }

  @Post(":id/transition")
  @HttpCode(HttpStatus.OK)
  @UseGuards(CsrfGuard)
  @ApiSecurity("csrf-token")
  @RequirePermissions("project.transition_status")
  @ApiOperation({
    summary: "Move a project to another lifecycle state",
  })
  @ApiOkResponse({ type: ProjectResponse })
  @ApiNotFoundResponse({
    type: ProblemDetails,
    description: "Project not found",
  })
  @ApiConflictResponse({
    type: ProblemDetails,
    description: "That transition is not allowed from the current state",
  })
  async transition(
    @Req() request: RequestWithContext,
    @Param("id") id: string,
    @Body() body: TransitionProjectDto,
  ): Promise<ProjectResponse> {
    return this.projects.transition(actingUserId(request), id, body.status);
  }

  @Put(":id/manager")
  @HttpCode(HttpStatus.OK)
  @UseGuards(CsrfGuard)
  @ApiSecurity("csrf-token")
  @RequirePermissions("project.assign")
  @ApiOperation({ summary: "Set, change, or clear the project manager" })
  @ApiOkResponse({ type: ProjectResponse })
  @ApiNotFoundResponse({
    type: ProblemDetails,
    description: "The project or the requested manager user does not exist",
  })
  async setManager(
    @Req() request: RequestWithContext,
    @Param("id") id: string,
    @Body() body: AssignProjectManagerDto,
  ): Promise<ProjectResponse> {
    return this.projects.setManager(actingUserId(request), id, body.managerId);
  }

  @Put(":id/teams/:teamId")
  @HttpCode(HttpStatus.OK)
  @UseGuards(CsrfGuard)
  @ApiSecurity("csrf-token")
  @RequirePermissions("project.assign")
  @ApiOperation({ summary: "Assign a team to this project (idempotent)" })
  @ApiOkResponse({ type: ProjectResponse })
  @ApiNotFoundResponse({
    type: ProblemDetails,
    description: "The project or the team does not exist",
  })
  async assignTeam(
    @Req() request: RequestWithContext,
    @Param("id") id: string,
    @Param("teamId") teamId: string,
  ): Promise<ProjectResponse> {
    return this.projects.assignTeam(actingUserId(request), id, teamId);
  }

  @Delete(":id/teams/:teamId")
  @HttpCode(HttpStatus.OK)
  @UseGuards(CsrfGuard)
  @ApiSecurity("csrf-token")
  @RequirePermissions("project.assign")
  @ApiOperation({ summary: "Unassign a team from this project" })
  @ApiOkResponse({ type: ProjectResponse })
  @ApiNotFoundResponse({
    type: ProblemDetails,
    description: "Project not found",
  })
  @ApiConflictResponse({
    type: ProblemDetails,
    description: "That team is not assigned to this project",
  })
  async unassignTeam(
    @Req() request: RequestWithContext,
    @Param("id") id: string,
    @Param("teamId") teamId: string,
  ): Promise<ProjectResponse> {
    return this.projects.unassignTeam(actingUserId(request), id, teamId);
  }

  @Delete(":id")
  @HttpCode(HttpStatus.NO_CONTENT)
  @UseGuards(CsrfGuard)
  @ApiSecurity("csrf-token")
  @RequirePermissions("project.delete")
  @ApiOperation({ summary: "Remove a project and its connected workspace" })
  @ApiNoContentResponse({ description: "The project was removed" })
  @ApiConflictResponse({
    type: ProblemDetails,
    description: "The project has pending or attached managed files",
  })
  @ApiNotFoundResponse({
    type: ProblemDetails,
    description: "Project not found",
  })
  async remove(
    @Req() request: RequestWithContext,
    @Param("id") id: string,
  ): Promise<void> {
    await this.projects.remove(actingUserId(request), id);
  }
}
