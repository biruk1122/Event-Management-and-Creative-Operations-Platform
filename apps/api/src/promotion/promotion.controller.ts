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
  PromotionActivityResponse,
  PaginatedPromotionActivitiesResponse,
} from "./promotion.contracts.js";
import {
  AttachPromotionActivityDto,
  AssignPromotionTalentDto,
  UpdatePromotionChannelDto,
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
    return this.promotion.remove(user(request), campaignId, activityId);
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
    );
  }
}
