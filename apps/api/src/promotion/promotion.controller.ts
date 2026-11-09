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
import { ListCampaignActivitiesQueryDto } from "../campaigns/dto/list-campaign-activities-query.dto.js";
import { ProblemDetails } from "../common/http/problem-details.js";
import type { RequestWithContext } from "../common/http/request-with-context.js";
import { RequirePermissions } from "../common/security/permissions.decorator.js";
import { PermissionsGuard } from "../common/security/permissions.guard.js";
import {
  PaginatedAssignableEmployeesResponse,
  PaginatedPromotionActivitiesResponse,
  PaginatedPromotionActivityListResponse,
  PromotionActivityResponse,
} from "./promotion.contracts.js";
import {
  AttachPromotionActivityDto,
  AssignPromotionTalentDto,
  ListAssignableEmployeesQueryDto,
  ListPromotionActivitiesQueryDto,
  UpdatePromotionChannelDto,
  UpdatePromotionDetailsDto,
} from "./promotion.dto.js";
import { PromotionService } from "./promotion.service.js";

function user(request: RequestWithContext): string {
  if (!request.user?.userId) throw unauthenticated();
  return request.user.userId;
}

/** Shared campaign creation, status, scheduling, and workspace operations stay
 * on the campaign API. These routes own only promotion detail and talent links. */
@ApiTags("Promotion operations")
@ApiCookieAuth("access_token")
@ApiUnauthorizedResponse({ type: ProblemDetails })
@ApiForbiddenResponse({ type: ProblemDetails })
@ApiNotFoundResponse({ type: ProblemDetails })
@UseGuards(AccessTokenGuard, PermissionsGuard)
@Controller("promotion/campaigns/:campaignId/activities")
export class PromotionController {
  constructor(private readonly promotion: PromotionService) {}

  @Get()
  @RequirePermissions("campaign.read")
  @ApiOperation({
    summary: "List promotion activities in a promotion campaign",
  })
  @ApiOkResponse({ type: PaginatedPromotionActivitiesResponse })
  list(
    @Req() request: RequestWithContext,
    @Param("campaignId") campaignId: string,
    @Query() query: ListCampaignActivitiesQueryDto,
  ) {
    return this.promotion.list(user(request), campaignId, query);
  }

  @Get(":activityId")
  @RequirePermissions("campaign.read")
  @ApiOperation({
    summary: "Get a promotion activity with channel and talent assignments",
  })
  @ApiOkResponse({ type: PromotionActivityResponse })
  get(
    @Req() request: RequestWithContext,
    @Param("campaignId") campaignId: string,
    @Param("activityId") activityId: string,
  ) {
    return this.promotion.get(user(request), campaignId, activityId);
  }

  @Post(":activityId")
  @UseGuards(CsrfGuard)
  @ApiSecurity("csrf-token")
  @RequirePermissions("campaign.activity.manage")
  @ApiOperation({
    summary:
      "Attach promotion channel and optional talents to an existing campaign activity",
  })
  @ApiCreatedResponse({ type: PromotionActivityResponse })
  @ApiBadRequestResponse({ type: ProblemDetails })
  @ApiConflictResponse({ type: ProblemDetails })
  attach(
    @Req() request: RequestWithContext,
    @Param("campaignId") campaignId: string,
    @Param("activityId") activityId: string,
    @Body() body: AttachPromotionActivityDto,
  ) {
    return this.promotion.attach(user(request), campaignId, activityId, body);
  }

  @Patch(":activityId")
  @UseGuards(CsrfGuard)
  @ApiSecurity("csrf-token")
  @RequirePermissions("campaign.activity.manage")
  @ApiOperation({ summary: "Change a promotion activity's delivery channel" })
  @ApiOkResponse({ type: PromotionActivityResponse })
  updateChannel(
    @Req() request: RequestWithContext,
    @Param("campaignId") campaignId: string,
    @Param("activityId") activityId: string,
    @Body() body: UpdatePromotionChannelDto,
  ) {
    return this.promotion.updateChannel(
      user(request),
      campaignId,
      activityId,
      body,
    );
  }

  @Delete(":activityId")
  @HttpCode(HttpStatus.NO_CONTENT)
  @UseGuards(CsrfGuard)
  @ApiSecurity("csrf-token")
  @RequirePermissions("campaign.activity.manage")
  @ApiOperation({
    summary:
      "Remove promotion detail and talent links, retaining the shared activity",
  })
  @ApiNoContentResponse()
  remove(
    @Req() request: RequestWithContext,
    @Param("campaignId") campaignId: string,
    @Param("activityId") activityId: string,
  ) {
    return this.promotion.remove(
      user(request),
      campaignId,
      activityId,
      request.id,
    );
  }

  @Patch(":activityId/details")
  @UseGuards(CsrfGuard)
  @ApiSecurity("csrf-token")
  @RequirePermissions("campaign.activity.manage")
  @ApiOperation({
    summary:
      "Set an activity's location and required resources (campaign department only)",
  })
  @ApiOkResponse({ type: PromotionActivityResponse })
  @ApiNotFoundResponse({ type: ProblemDetails })
  updateDetails(
    @Req() request: RequestWithContext,
    @Param("campaignId") campaignId: string,
    @Param("activityId") activityId: string,
    @Body() body: UpdatePromotionDetailsDto,
  ) {
    return this.promotion.updateDetails(
      user(request),
      campaignId,
      activityId,
      body,
    );
  }

  @Put(":activityId/assignees/:userId")
  @UseGuards(CsrfGuard)
  @ApiSecurity("csrf-token")
  @RequirePermissions("campaign.activity.manage")
  @ApiOperation({
    summary:
      "Assign an active employee of the campaign's department to the activity",
  })
  @ApiOkResponse({ type: PromotionActivityResponse })
  @ApiConflictResponse({ type: ProblemDetails })
  assignEmployee(
    @Req() request: RequestWithContext,
    @Param("campaignId") campaignId: string,
    @Param("activityId") activityId: string,
    @Param("userId") employeeId: string,
  ) {
    return this.promotion.assignEmployee(
      user(request),
      campaignId,
      activityId,
      employeeId,
    );
  }

  @Delete(":activityId/assignees/:userId")
  @UseGuards(CsrfGuard)
  @ApiSecurity("csrf-token")
  @RequirePermissions("campaign.activity.manage")
  @ApiOperation({ summary: "Remove an employee from the activity" })
  @ApiOkResponse({ type: PromotionActivityResponse })
  @ApiNotFoundResponse({ type: ProblemDetails })
  unassignEmployee(
    @Req() request: RequestWithContext,
    @Param("campaignId") campaignId: string,
    @Param("activityId") activityId: string,
    @Param("userId") employeeId: string,
  ) {
    return this.promotion.unassignEmployee(
      user(request),
      campaignId,
      activityId,
      employeeId,
    );
  }

  @Post(":activityId/talents")
  @UseGuards(CsrfGuard)
  @ApiSecurity("csrf-token")
  @RequirePermissions("campaign.activity.manage", "talent.assign")
  @ApiOperation({ summary: "Assign one talent to a promotion activity" })
  @ApiCreatedResponse({ type: PromotionActivityResponse })
  @ApiConflictResponse({ type: ProblemDetails })
  assignTalent(
    @Req() request: RequestWithContext,
    @Param("campaignId") campaignId: string,
    @Param("activityId") activityId: string,
    @Body() body: AssignPromotionTalentDto,
  ) {
    return this.promotion.assignTalent(
      user(request),
      campaignId,
      activityId,
      body,
      request.id,
    );
  }

  @Delete(":activityId/talents/:talentId")
  @HttpCode(HttpStatus.OK)
  @UseGuards(CsrfGuard)
  @ApiSecurity("csrf-token")
  @RequirePermissions("campaign.activity.manage", "talent.assign")
  @ApiOperation({ summary: "Unassign one talent from a promotion activity" })
  @ApiOkResponse({ type: PromotionActivityResponse })
  unassignTalent(
    @Req() request: RequestWithContext,
    @Param("campaignId") campaignId: string,
    @Param("activityId") activityId: string,
    @Param("talentId") talentId: string,
  ) {
    return this.promotion.unassignTalent(
      user(request),
      campaignId,
      activityId,
      talentId,
      request.id,
    );
  }
}

/** Active employees of the campaign's department who can be assigned (EVE-231). */
@ApiTags("Campaign platform")
@ApiCookieAuth("access_token")
@ApiUnauthorizedResponse({ type: ProblemDetails })
@ApiForbiddenResponse({ type: ProblemDetails })
@ApiNotFoundResponse({ type: ProblemDetails })
@UseGuards(AccessTokenGuard, PermissionsGuard)
@Controller("promotion/campaigns/:campaignId/assignable-employees")
export class PromotionAssignableEmployeesController {
  constructor(private readonly promotion: PromotionService) {}

  @Get()
  @RequirePermissions("campaign.activity.manage")
  @ApiOperation({
    summary:
      "List active employees of the campaign's department who can be assigned",
  })
  @ApiOkResponse({ type: PaginatedAssignableEmployeesResponse })
  list(
    @Req() request: RequestWithContext,
    @Param("campaignId") campaignId: string,
    @Query() query: ListAssignableEmployeesQueryDto,
  ) {
    return this.promotion.assignableEmployees(user(request), campaignId, query);
  }
}

/**
 * Every promotion activity the caller can read, across promotion campaigns
 * (EVE-231). Filters: campaign, channel, status, name search, start window;
 * sort by start or name. Visibility follows the campaigns list rules.
 */
@ApiTags("Campaign platform")
@ApiCookieAuth("access_token")
@ApiUnauthorizedResponse({ type: ProblemDetails })
@ApiForbiddenResponse({ type: ProblemDetails })
@UseGuards(AccessTokenGuard, PermissionsGuard)
@Controller("promotion/activities")
export class PromotionActivitiesController {
  constructor(private readonly promotion: PromotionService) {}

  @Get()
  @RequirePermissions("campaign.read")
  @ApiOperation({
    summary:
      "List promotion activities across the promotion campaigns you can read",
  })
  @ApiOkResponse({ type: PaginatedPromotionActivityListResponse })
  list(
    @Req() request: RequestWithContext,
    @Query() query: ListPromotionActivitiesQueryDto,
  ) {
    return this.promotion.listAll(user(request), query);
  }
}
