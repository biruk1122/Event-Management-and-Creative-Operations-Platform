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
  CampaignActivityResponse,
  CampaignBudgetResponse,
  CampaignResponse,
  PaginatedCampaignActivitiesResponse,
  PaginatedCampaignsResponse,
} from "./campaigns.contracts.js";
import { CampaignsService } from "./campaigns.service.js";
import { AssignCampaignManagerDto } from "./dto/assign-campaign-manager.dto.js";
import { CreateCampaignActivityDto } from "./dto/create-campaign-activity.dto.js";
import { CreateCampaignDto } from "./dto/create-campaign.dto.js";
import { ListCampaignActivitiesQueryDto } from "./dto/list-campaign-activities-query.dto.js";
import { ListCampaignsQueryDto } from "./dto/list-campaigns-query.dto.js";
import { SetCampaignBudgetDto } from "./dto/set-campaign-budget.dto.js";
import { TransitionCampaignDto } from "./dto/transition-campaign.dto.js";
import { UpdateCampaignActivityDto } from "./dto/update-campaign-activity.dto.js";
import { UpdateCampaignDto } from "./dto/update-campaign.dto.js";

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
 * Campaign platform shared by Marketing and Promotion (SRS 5.8, 5.9). Every
 * route is for a campaign, so - unlike the generic connected-workspace
 * controller - the required permission is known statically and declared with
 * `@RequirePermissions`. `CampaignsService` re-checks that key at ORGANIZATION
 * scope as the precise boundary. The guard chain enforces authentication on
 * every route and a CSRF token on every mutation.
 */
@ApiTags("Campaign platform")
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
@Controller("campaigns")
export class CampaignsController {
  constructor(private readonly campaigns: CampaignsService) {}

  @Get()
  @RequirePermissions("campaign.read")
  @ApiOperation({ summary: "List campaigns the caller may see, with filters" })
  @ApiOkResponse({ type: PaginatedCampaignsResponse })
  async list(
    @Req() request: RequestWithContext,
    @Query() query: ListCampaignsQueryDto,
  ): Promise<PaginatedCampaignsResponse> {
    return this.campaigns.list(actingUserId(request), query);
  }

  @Get(":id")
  @RequirePermissions("campaign.read")
  @ApiOperation({
    summary:
      "Get one campaign with its progress and connected workspace overview",
  })
  @ApiOkResponse({ type: CampaignResponse })
  @ApiNotFoundResponse({
    type: ProblemDetails,
    description: "Campaign not found",
  })
  async get(
    @Req() request: RequestWithContext,
    @Param("id") id: string,
  ): Promise<CampaignResponse> {
    return this.campaigns.get(actingUserId(request), id);
  }

  @Post()
  @UseGuards(CsrfGuard)
  @ApiSecurity("csrf-token")
  @RequirePermissions("campaign.create")
  @ApiOperation({
    summary: "Create a campaign and its connected workspace",
  })
  @ApiCreatedResponse({ type: CampaignResponse })
  @ApiBadRequestResponse({
    type: ProblemDetails,
    description:
      "Invalid input, an end before the start, or both an event and a product subject",
  })
  @ApiNotFoundResponse({
    type: ProblemDetails,
    description: "The requested manager user or related event does not exist",
  })
  async create(
    @Req() request: RequestWithContext,
    @Body() body: CreateCampaignDto,
  ): Promise<CampaignResponse> {
    return this.campaigns.create(actingUserId(request), body);
  }

  @Patch(":id")
  @UseGuards(CsrfGuard)
  @ApiSecurity("csrf-token")
  @RequirePermissions("campaign.update")
  @ApiOperation({
    summary: "Update campaign details (not status, manager, teams, or budget)",
  })
  @ApiOkResponse({ type: CampaignResponse })
  @ApiBadRequestResponse({
    type: ProblemDetails,
    description:
      "Invalid input, an end before the start, or both an event and a product subject",
  })
  @ApiNotFoundResponse({
    type: ProblemDetails,
    description: "The campaign or the related event does not exist",
  })
  async update(
    @Req() request: RequestWithContext,
    @Param("id") id: string,
    @Body() body: UpdateCampaignDto,
  ): Promise<CampaignResponse> {
    return this.campaigns.update(actingUserId(request), id, body);
  }

  @Post(":id/transition")
  @HttpCode(HttpStatus.OK)
  @UseGuards(CsrfGuard)
  @ApiSecurity("csrf-token")
  @RequirePermissions("campaign.transition_status")
  @ApiOperation({
    summary: "Move a campaign to another lifecycle state",
  })
  @ApiOkResponse({ type: CampaignResponse })
  @ApiNotFoundResponse({
    type: ProblemDetails,
    description: "Campaign not found",
  })
  @ApiConflictResponse({
    type: ProblemDetails,
    description: "That transition is not allowed from the current state",
  })
  async transition(
    @Req() request: RequestWithContext,
    @Param("id") id: string,
    @Body() body: TransitionCampaignDto,
  ): Promise<CampaignResponse> {
    return this.campaigns.transition(actingUserId(request), id, body.status);
  }

  @Put(":id/manager")
  @HttpCode(HttpStatus.OK)
  @UseGuards(CsrfGuard)
  @ApiSecurity("csrf-token")
  @RequirePermissions("campaign.assign")
  @ApiOperation({ summary: "Set, change, or clear the campaign manager" })
  @ApiOkResponse({ type: CampaignResponse })
  @ApiNotFoundResponse({
    type: ProblemDetails,
    description: "The campaign or the requested manager user does not exist",
  })
  async setManager(
    @Req() request: RequestWithContext,
    @Param("id") id: string,
    @Body() body: AssignCampaignManagerDto,
  ): Promise<CampaignResponse> {
    return this.campaigns.setManager(actingUserId(request), id, body.managerId);
  }

  @Put(":id/teams/:teamId")
  @HttpCode(HttpStatus.OK)
  @UseGuards(CsrfGuard)
  @ApiSecurity("csrf-token")
  @RequirePermissions("campaign.assign")
  @ApiOperation({ summary: "Assign a team to this campaign (idempotent)" })
  @ApiOkResponse({ type: CampaignResponse })
  @ApiNotFoundResponse({
    type: ProblemDetails,
    description: "The campaign or the team does not exist",
  })
  async assignTeam(
    @Req() request: RequestWithContext,
    @Param("id") id: string,
    @Param("teamId") teamId: string,
  ): Promise<CampaignResponse> {
    return this.campaigns.assignTeam(actingUserId(request), id, teamId);
  }

  @Delete(":id/teams/:teamId")
  @HttpCode(HttpStatus.OK)
  @UseGuards(CsrfGuard)
  @ApiSecurity("csrf-token")
  @RequirePermissions("campaign.assign")
  @ApiOperation({ summary: "Unassign a team from this campaign" })
  @ApiOkResponse({ type: CampaignResponse })
  @ApiNotFoundResponse({
    type: ProblemDetails,
    description: "Campaign not found",
  })
  @ApiConflictResponse({
    type: ProblemDetails,
    description: "That team is not assigned to this campaign",
  })
  async unassignTeam(
    @Req() request: RequestWithContext,
    @Param("id") id: string,
    @Param("teamId") teamId: string,
  ): Promise<CampaignResponse> {
    return this.campaigns.unassignTeam(actingUserId(request), id, teamId);
  }

  @Get(":id/budget")
  @RequirePermissions("campaign.budget.read")
  @ApiOperation({ summary: "Read the campaign budget (sensitive)" })
  @ApiOkResponse({ type: CampaignBudgetResponse })
  @ApiNotFoundResponse({
    type: ProblemDetails,
    description: "Campaign not found",
  })
  async getBudget(
    @Req() request: RequestWithContext,
    @Param("id") id: string,
  ): Promise<CampaignBudgetResponse> {
    return this.campaigns.getBudget(actingUserId(request), id);
  }

  @Put(":id/budget")
  @HttpCode(HttpStatus.OK)
  @UseGuards(CsrfGuard)
  @ApiSecurity("csrf-token")
  @RequirePermissions("campaign.budget.update")
  @ApiOperation({ summary: "Set or clear the campaign budget (sensitive)" })
  @ApiOkResponse({ type: CampaignBudgetResponse })
  @ApiBadRequestResponse({
    type: ProblemDetails,
    description: "An amount without a currency, or the reverse",
  })
  @ApiNotFoundResponse({
    type: ProblemDetails,
    description: "Campaign not found",
  })
  async setBudget(
    @Req() request: RequestWithContext,
    @Param("id") id: string,
    @Body() body: SetCampaignBudgetDto,
  ): Promise<CampaignBudgetResponse> {
    return this.campaigns.setBudget(actingUserId(request), id, body);
  }

  @Delete(":id")
  @HttpCode(HttpStatus.NO_CONTENT)
  @UseGuards(CsrfGuard)
  @ApiSecurity("csrf-token")
  @RequirePermissions("campaign.delete")
  @ApiOperation({
    summary: "Remove a campaign, its activities, and its connected workspace",
  })
  @ApiNoContentResponse({ description: "The campaign was removed" })
  @ApiConflictResponse({
    type: ProblemDetails,
    description: "The campaign has pending or attached managed files",
  })
  @ApiNotFoundResponse({
    type: ProblemDetails,
    description: "Campaign not found",
  })
  async remove(
    @Req() request: RequestWithContext,
    @Param("id") id: string,
  ): Promise<void> {
    await this.campaigns.remove(actingUserId(request), id);
  }

  @Get(":id/activities")
  @RequirePermissions("campaign.read")
  @ApiOperation({ summary: "List a campaign's activities" })
  @ApiOkResponse({ type: PaginatedCampaignActivitiesResponse })
  @ApiNotFoundResponse({
    type: ProblemDetails,
    description: "Campaign not found",
  })
  async listActivities(
    @Req() request: RequestWithContext,
    @Param("id") id: string,
    @Query() query: ListCampaignActivitiesQueryDto,
  ): Promise<PaginatedCampaignActivitiesResponse> {
    return this.campaigns.listActivities(actingUserId(request), id, query);
  }

  @Post(":id/activities")
  @UseGuards(CsrfGuard)
  @ApiSecurity("csrf-token")
  @RequirePermissions("campaign.activity.manage")
  @ApiOperation({ summary: "Add an activity to a campaign" })
  @ApiCreatedResponse({ type: CampaignActivityResponse })
  @ApiBadRequestResponse({
    type: ProblemDetails,
    description: "Invalid input or an end before the start",
  })
  @ApiNotFoundResponse({
    type: ProblemDetails,
    description: "Campaign not found",
  })
  async createActivity(
    @Req() request: RequestWithContext,
    @Param("id") id: string,
    @Body() body: CreateCampaignActivityDto,
  ): Promise<CampaignActivityResponse> {
    return this.campaigns.createActivity(actingUserId(request), id, body);
  }

  @Patch(":id/activities/:activityId")
  @UseGuards(CsrfGuard)
  @ApiSecurity("csrf-token")
  @RequirePermissions("campaign.activity.manage")
  @ApiOperation({ summary: "Update a campaign activity, including its status" })
  @ApiOkResponse({ type: CampaignActivityResponse })
  @ApiBadRequestResponse({
    type: ProblemDetails,
    description: "Invalid input or an end before the start",
  })
  @ApiNotFoundResponse({
    type: ProblemDetails,
    description: "The campaign or the activity does not exist",
  })
  async updateActivity(
    @Req() request: RequestWithContext,
    @Param("id") id: string,
    @Param("activityId") activityId: string,
    @Body() body: UpdateCampaignActivityDto,
  ): Promise<CampaignActivityResponse> {
    return this.campaigns.updateActivity(
      actingUserId(request),
      id,
      activityId,
      body,
    );
  }

  @Delete(":id/activities/:activityId")
  @HttpCode(HttpStatus.NO_CONTENT)
  @UseGuards(CsrfGuard)
  @ApiSecurity("csrf-token")
  @RequirePermissions("campaign.activity.manage")
  @ApiOperation({ summary: "Remove a campaign activity" })
  @ApiNoContentResponse({ description: "The activity was removed" })
  @ApiNotFoundResponse({
    type: ProblemDetails,
    description: "The campaign or the activity does not exist",
  })
  async removeActivity(
    @Req() request: RequestWithContext,
    @Param("id") id: string,
    @Param("activityId") activityId: string,
  ): Promise<void> {
    await this.campaigns.removeActivity(actingUserId(request), id, activityId);
  }
}
