import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
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
import { PermissionsGuard } from "../common/security/permissions.guard.js";
import {
  PaginatedWorkspacesResponse,
  WorkspaceResponse,
} from "./workspaces.contracts.js";
import { WorkspacesService } from "./workspaces.service.js";
import { AssignWorkspaceManagerDto } from "./dto/assign-workspace-manager.dto.js";
import { CreateWorkspaceDto } from "./dto/create-workspace.dto.js";
import { ListWorkspacesQueryDto } from "./dto/list-workspaces-query.dto.js";

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
 * Connected workspace ownership (WSP-02). The permission a route needs depends
 * on the persisted workspace `kind` (`event.*`, `project.*`, or `campaign.*`),
 * which a static `@RequirePermissions` cannot resolve, so these routes carry
 * no permission metadata and `WorkspacesService` is the authoritative
 * authorization boundary. The guard chain still enforces authentication on
 * every route and a CSRF token on every mutation.
 */
@ApiTags("Connected workspace ownership")
@ApiCookieAuth("access_token")
@ApiUnauthorizedResponse({
  type: ProblemDetails,
  description: "Not authenticated",
})
@ApiForbiddenResponse({
  type: ProblemDetails,
  description:
    "Missing the owning module's permission for this workspace kind, or CSRF token invalid",
})
@UseGuards(AccessTokenGuard, PermissionsGuard)
@Controller("workspaces")
export class WorkspacesController {
  constructor(private readonly workspaces: WorkspacesService) {}

  @Get()
  @ApiOperation({
    summary: "List workspaces of one kind the caller may see",
  })
  @ApiOkResponse({ type: PaginatedWorkspacesResponse })
  async list(
    @Req() request: RequestWithContext,
    @Query() query: ListWorkspacesQueryDto,
  ): Promise<PaginatedWorkspacesResponse> {
    return this.workspaces.list(actingUserId(request), query);
  }

  @Get(":id")
  @ApiOperation({
    summary: "Get one workspace root with its manager, teams, and participants",
  })
  @ApiOkResponse({ type: WorkspaceResponse })
  @ApiNotFoundResponse({
    type: ProblemDetails,
    description: "Workspace not found",
  })
  async get(
    @Req() request: RequestWithContext,
    @Param("id") id: string,
  ): Promise<WorkspaceResponse> {
    return this.workspaces.get(actingUserId(request), id);
  }

  @Post()
  @UseGuards(CsrfGuard)
  @ApiSecurity("csrf-token")
  @ApiOperation({
    summary:
      "Create a workspace root of a given kind, optionally with a manager",
  })
  @ApiCreatedResponse({ type: WorkspaceResponse })
  @ApiNotFoundResponse({
    type: ProblemDetails,
    description: "The requested manager user does not exist",
  })
  async create(
    @Req() request: RequestWithContext,
    @Body() body: CreateWorkspaceDto,
  ): Promise<WorkspaceResponse> {
    return this.workspaces.create(actingUserId(request), body);
  }

  @Put(":id/manager")
  @HttpCode(HttpStatus.OK)
  @UseGuards(CsrfGuard)
  @ApiSecurity("csrf-token")
  @ApiOperation({ summary: "Set, change, or clear a workspace's manager" })
  @ApiOkResponse({ type: WorkspaceResponse })
  @ApiNotFoundResponse({
    type: ProblemDetails,
    description: "The workspace or the requested manager user does not exist",
  })
  async setManager(
    @Req() request: RequestWithContext,
    @Param("id") id: string,
    @Body() body: AssignWorkspaceManagerDto,
  ): Promise<WorkspaceResponse> {
    return this.workspaces.setManager(
      actingUserId(request),
      id,
      body.managerId,
    );
  }

  @Put(":id/teams/:teamId")
  @HttpCode(HttpStatus.OK)
  @UseGuards(CsrfGuard)
  @ApiSecurity("csrf-token")
  @ApiOperation({ summary: "Assign a team to this workspace (idempotent)" })
  @ApiOkResponse({ type: WorkspaceResponse })
  @ApiNotFoundResponse({
    type: ProblemDetails,
    description: "The workspace or the team does not exist",
  })
  async assignTeam(
    @Req() request: RequestWithContext,
    @Param("id") id: string,
    @Param("teamId") teamId: string,
  ): Promise<WorkspaceResponse> {
    return this.workspaces.assignTeam(actingUserId(request), id, teamId);
  }

  @Delete(":id/teams/:teamId")
  @HttpCode(HttpStatus.OK)
  @UseGuards(CsrfGuard)
  @ApiSecurity("csrf-token")
  @ApiOperation({ summary: "Unassign a team from this workspace" })
  @ApiOkResponse({ type: WorkspaceResponse })
  @ApiNotFoundResponse({
    type: ProblemDetails,
    description: "Workspace not found",
  })
  @ApiConflictResponse({
    type: ProblemDetails,
    description: "That team is not assigned to this workspace",
  })
  async unassignTeam(
    @Req() request: RequestWithContext,
    @Param("id") id: string,
    @Param("teamId") teamId: string,
  ): Promise<WorkspaceResponse> {
    return this.workspaces.unassignTeam(actingUserId(request), id, teamId);
  }

  @Put(":id/participants/:userId")
  @HttpCode(HttpStatus.OK)
  @UseGuards(CsrfGuard)
  @ApiSecurity("csrf-token")
  @ApiOperation({
    summary: "Add a user as a participant in this workspace (idempotent)",
  })
  @ApiOkResponse({ type: WorkspaceResponse })
  @ApiNotFoundResponse({
    type: ProblemDetails,
    description: "The workspace or the user does not exist",
  })
  async addParticipant(
    @Req() request: RequestWithContext,
    @Param("id") id: string,
    @Param("userId") userId: string,
  ): Promise<WorkspaceResponse> {
    return this.workspaces.addParticipant(actingUserId(request), id, userId);
  }

  @Delete(":id/participants/:userId")
  @HttpCode(HttpStatus.OK)
  @UseGuards(CsrfGuard)
  @ApiSecurity("csrf-token")
  @ApiOperation({ summary: "Remove a participant from this workspace" })
  @ApiOkResponse({ type: WorkspaceResponse })
  @ApiNotFoundResponse({
    type: ProblemDetails,
    description: "Workspace not found",
  })
  @ApiConflictResponse({
    type: ProblemDetails,
    description: "That user is not a participant in this workspace",
  })
  async removeParticipant(
    @Req() request: RequestWithContext,
    @Param("id") id: string,
    @Param("userId") userId: string,
  ): Promise<WorkspaceResponse> {
    return this.workspaces.removeParticipant(actingUserId(request), id, userId);
  }

  @Delete(":id")
  @HttpCode(HttpStatus.NO_CONTENT)
  @UseGuards(CsrfGuard)
  @ApiSecurity("csrf-token")
  @ApiOperation({ summary: "Remove a workspace root" })
  @ApiNoContentResponse({ description: "The workspace was removed" })
  @ApiNotFoundResponse({
    type: ProblemDetails,
    description: "Workspace not found",
  })
  @ApiConflictResponse({
    type: ProblemDetails,
    description:
      "The workspace is still owned by an event, project, campaign, task, meeting, or conversation",
  })
  async remove(
    @Req() request: RequestWithContext,
    @Param("id") id: string,
  ): Promise<void> {
    await this.workspaces.remove(actingUserId(request), id);
  }
}
