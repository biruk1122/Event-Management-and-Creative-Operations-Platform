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
import { MarketingStrategyResponse } from "./marketing.contracts.js";
import { MarketingStrategyDto } from "./marketing.dto.js";
import { MarketingService } from "./marketing.service.js";

function user(request: RequestWithContext): string {
  if (!request.user?.userId) throw unauthenticated();
  return request.user.userId;
}

/** Shared campaign creation, activities, teams, progress, lifecycle and budget
 * remain on `/campaigns`. This subresource owns marketing strategy only. */
@ApiTags("Marketing campaigns")
@ApiCookieAuth("access_token")
@ApiUnauthorizedResponse({ type: ProblemDetails })
@ApiForbiddenResponse({ type: ProblemDetails })
@ApiNotFoundResponse({ type: ProblemDetails })
@UseGuards(AccessTokenGuard, PermissionsGuard)
@Controller("marketing/campaigns/:campaignId/strategy")
export class MarketingController {
  constructor(private readonly marketing: MarketingService) {}

  @Get()
  @RequirePermissions("campaign.read")
  @ApiOperation({ summary: "Get the strategy of a marketing campaign" })
  @ApiOkResponse({ type: MarketingStrategyResponse })
  get(
    @Req() request: RequestWithContext,
    @Param("campaignId") campaignId: string,
  ) {
    return this.marketing.get(user(request), campaignId);
  }

  @Post()
  @UseGuards(CsrfGuard)
  @ApiSecurity("csrf-token")
  @RequirePermissions("campaign.read", "campaign.update")
  @ApiOperation({ summary: "Attach a strategy to a marketing campaign" })
  @ApiCreatedResponse({ type: MarketingStrategyResponse })
  @ApiBadRequestResponse({ type: ProblemDetails })
  @ApiConflictResponse({ type: ProblemDetails })
  create(
    @Req() request: RequestWithContext,
    @Param("campaignId") campaignId: string,
    @Body() body: MarketingStrategyDto,
  ) {
    return this.marketing.create(user(request), campaignId, body.strategy);
  }

  @Patch()
  @UseGuards(CsrfGuard)
  @ApiSecurity("csrf-token")
  @RequirePermissions("campaign.read", "campaign.update")
  @ApiOperation({ summary: "Change a marketing campaign's strategy" })
  @ApiOkResponse({ type: MarketingStrategyResponse })
  @ApiBadRequestResponse({ type: ProblemDetails })
  update(
    @Req() request: RequestWithContext,
    @Param("campaignId") campaignId: string,
    @Body() body: MarketingStrategyDto,
  ) {
    return this.marketing.update(user(request), campaignId, body.strategy);
  }

  @Delete()
  @HttpCode(HttpStatus.NO_CONTENT)
  @UseGuards(CsrfGuard)
  @ApiSecurity("csrf-token")
  @RequirePermissions("campaign.read", "campaign.update")
  @ApiOperation({ summary: "Remove strategy content, retaining the campaign" })
  @ApiNoContentResponse()
  remove(
    @Req() request: RequestWithContext,
    @Param("campaignId") campaignId: string,
  ) {
    return this.marketing.remove(user(request), campaignId);
  }
}
