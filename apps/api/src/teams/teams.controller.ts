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
import { PaginatedTeamsResponse, TeamResponse } from "./teams.contracts.js";
import { TeamsService } from "./teams.service.js";
import { AssignTeamManagerDto } from "./dto/assign-team-manager.dto.js";
import { CreateTeamDto } from "./dto/create-team.dto.js";
import { ListTeamsQueryDto } from "./dto/list-teams-query.dto.js";
import { UpdateTeamDto } from "./dto/update-team.dto.js";

/** `AccessTokenGuard` always runs first in this controller's guard chain and
 * sets `request.user`; this only guards against that invariant changing. */
function actingUserId(request: RequestWithContext): string {
  const userId = request.user?.userId;
  if (!userId) {
    throw unauthenticated();
  }
  return userId;
}

@ApiTags("Team management")
@ApiCookieAuth("access_token")
@ApiUnauthorizedResponse({
  type: ProblemDetails,
  description: "Not authenticated",
})
@ApiForbiddenResponse({
  type: ProblemDetails,
  description: "Missing permission, out of read scope, or CSRF token invalid",
})
@UseGuards(AccessTokenGuard, PermissionsGuard)
@Controller("teams")
export class TeamsController {
  constructor(private readonly teams: TeamsService) {}

  @Get()
  @RequirePermissions("team.read")
  @ApiOperation({
    summary: "List teams the caller may see, with optional filters",
  })
  @ApiOkResponse({ type: PaginatedTeamsResponse })
  async list(
    @Req() request: RequestWithContext,
    @Query() query: ListTeamsQueryDto,
  ): Promise<PaginatedTeamsResponse> {
    return this.teams.list(actingUserId(request), query);
  }

  @Get(":id")
  @RequirePermissions("team.read")
  @ApiOperation({ summary: "Get one team and its composition" })
  @ApiOkResponse({ type: TeamResponse })
  @ApiNotFoundResponse({ type: ProblemDetails, description: "Team not found" })
  async get(
    @Req() request: RequestWithContext,
    @Param("id") id: string,
  ): Promise<TeamResponse> {
    return this.teams.get(actingUserId(request), id);
  }

  @Post()
  @UseGuards(CsrfGuard)
  @ApiSecurity("csrf-token")
  @RequirePermissions("team.create")
  @ApiOperation({ summary: "Create a team under a department" })
  @ApiCreatedResponse({ type: TeamResponse })
  @ApiNotFoundResponse({
    type: ProblemDetails,
    description:
      "The owning department or the requested manager does not exist",
  })
  @ApiConflictResponse({
    type: ProblemDetails,
    description: "A team with that name already exists in the department",
  })
  async create(
    @Req() request: RequestWithContext,
    @Body() body: CreateTeamDto,
  ): Promise<TeamResponse> {
    return this.teams.create(actingUserId(request), body);
  }

  @Patch(":id")
  @UseGuards(CsrfGuard)
  @ApiSecurity("csrf-token")
  @RequirePermissions("team.update")
  @ApiOperation({ summary: "Update a team's name or description" })
  @ApiOkResponse({ type: TeamResponse })
  @ApiNotFoundResponse({ type: ProblemDetails, description: "Team not found" })
  @ApiConflictResponse({
    type: ProblemDetails,
    description: "A team with that name already exists in the department",
  })
  async update(
    @Req() request: RequestWithContext,
    @Param("id") id: string,
    @Body() body: UpdateTeamDto,
  ): Promise<TeamResponse> {
    return this.teams.update(actingUserId(request), id, body);
  }

  @Put(":id/manager")
  @HttpCode(HttpStatus.OK)
  @UseGuards(CsrfGuard)
  @ApiSecurity("csrf-token")
  @RequirePermissions("team.assign_manager")
  @ApiOperation({ summary: "Set, change, or clear a team's manager" })
  @ApiOkResponse({ type: TeamResponse })
  @ApiNotFoundResponse({
    type: ProblemDetails,
    description: "The team or the requested manager user does not exist",
  })
  async setManager(
    @Req() request: RequestWithContext,
    @Param("id") id: string,
    @Body() body: AssignTeamManagerDto,
  ): Promise<TeamResponse> {
    return this.teams.setManager(actingUserId(request), id, body.managerId);
  }

  @Post(":id/deactivate")
  @HttpCode(HttpStatus.OK)
  @UseGuards(CsrfGuard)
  @ApiSecurity("csrf-token")
  @RequirePermissions("team.update")
  @ApiOperation({ summary: "Deactivate a team (safe deactivation)" })
  @ApiOkResponse({ type: TeamResponse })
  @ApiNotFoundResponse({ type: ProblemDetails, description: "Team not found" })
  @ApiConflictResponse({
    type: ProblemDetails,
    description: "The team is already deactivated",
  })
  async deactivate(
    @Req() request: RequestWithContext,
    @Param("id") id: string,
  ): Promise<TeamResponse> {
    return this.teams.deactivate(actingUserId(request), id);
  }

  @Post(":id/reactivate")
  @HttpCode(HttpStatus.OK)
  @UseGuards(CsrfGuard)
  @ApiSecurity("csrf-token")
  @RequirePermissions("team.update")
  @ApiOperation({ summary: "Reactivate a deactivated team" })
  @ApiOkResponse({ type: TeamResponse })
  @ApiNotFoundResponse({ type: ProblemDetails, description: "Team not found" })
  @ApiConflictResponse({
    type: ProblemDetails,
    description: "The team is already active",
  })
  async reactivate(
    @Req() request: RequestWithContext,
    @Param("id") id: string,
  ): Promise<TeamResponse> {
    return this.teams.reactivate(actingUserId(request), id);
  }

  @Delete(":id")
  @HttpCode(HttpStatus.NO_CONTENT)
  @UseGuards(CsrfGuard)
  @ApiSecurity("csrf-token")
  @RequirePermissions("team.delete")
  @ApiOperation({ summary: "Remove a team that has no members" })
  @ApiNoContentResponse({ description: "The team was removed" })
  @ApiNotFoundResponse({ type: ProblemDetails, description: "Team not found" })
  @ApiConflictResponse({
    type: ProblemDetails,
    description: "The team still has members",
  })
  async remove(
    @Req() request: RequestWithContext,
    @Param("id") id: string,
  ): Promise<void> {
    await this.teams.remove(actingUserId(request), id);
  }

  @Put(":id/members/:userId")
  @HttpCode(HttpStatus.OK)
  @UseGuards(CsrfGuard)
  @ApiSecurity("csrf-token")
  @RequirePermissions("team.manage_members")
  @ApiOperation({
    summary: "Add a user to this team (idempotent)",
  })
  @ApiOkResponse({ type: TeamResponse })
  @ApiNotFoundResponse({
    type: ProblemDetails,
    description: "The team or the user does not exist",
  })
  async addMember(
    @Req() request: RequestWithContext,
    @Param("id") id: string,
    @Param("userId") userId: string,
  ): Promise<TeamResponse> {
    return this.teams.addMember(actingUserId(request), id, userId);
  }

  @Delete(":id/members/:userId")
  @HttpCode(HttpStatus.OK)
  @UseGuards(CsrfGuard)
  @ApiSecurity("csrf-token")
  @RequirePermissions("team.manage_members")
  @ApiOperation({ summary: "Remove a user from this team" })
  @ApiOkResponse({ type: TeamResponse })
  @ApiNotFoundResponse({
    type: ProblemDetails,
    description: "The team or the user does not exist",
  })
  @ApiConflictResponse({
    type: ProblemDetails,
    description: "That user is not a member of this team",
  })
  async removeMember(
    @Req() request: RequestWithContext,
    @Param("id") id: string,
    @Param("userId") userId: string,
  ): Promise<TeamResponse> {
    return this.teams.removeMember(actingUserId(request), id, userId);
  }
}
