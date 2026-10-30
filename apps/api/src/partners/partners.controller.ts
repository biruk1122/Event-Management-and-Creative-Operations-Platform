import {
  Body,
  Controller,
  Get,
  Param,
  Patch,
  Post,
  Query,
  Req,
  UseGuards,
} from "@nestjs/common";
import {
  ApiBadRequestResponse,
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
import { CreatePartnerActivityDto } from "./dto/create-partner-activity.dto.js";
import { CreatePartnerDto } from "./dto/create-partner.dto.js";
import { ListPartnerActivitiesQueryDto } from "./dto/list-partner-activities-query.dto.js";
import { ListPartnersQueryDto } from "./dto/list-partners-query.dto.js";
import { UpdatePartnerDto } from "./dto/update-partner.dto.js";
import {
  PaginatedPartnerActivitiesResponse,
  PaginatedPartnersResponse,
  PartnerActivityResponse,
  PartnerResponse,
} from "./partners.contracts.js";
import { PartnersService } from "./partners.service.js";

function actingUserId(request: RequestWithContext): string {
  if (!request.user?.userId) throw unauthenticated();
  return request.user.userId;
}

/**
 * Partner (sponsor/media/strategic-partner) directory for the Marketing
 * Department Workspace. Every route's required permission is known
 * statically; `PartnersService` re-checks it against the specific partner's
 * department/owner, the same boundary `CampaignsController` enforces for
 * campaigns.
 */
@ApiTags("Partner directory")
@ApiCookieAuth("access_token")
@ApiUnauthorizedResponse({ type: ProblemDetails })
@ApiForbiddenResponse({ type: ProblemDetails })
@UseGuards(AccessTokenGuard, PermissionsGuard)
@Controller("partners")
export class PartnersController {
  constructor(private readonly partners: PartnersService) {}

  @Get()
  @RequirePermissions("partner.read")
  @ApiOperation({ summary: "List partners visible to the caller" })
  @ApiOkResponse({ type: PaginatedPartnersResponse })
  list(
    @Req() req: RequestWithContext,
    @Query() query: ListPartnersQueryDto,
  ): Promise<PaginatedPartnersResponse> {
    return this.partners.list(actingUserId(req), query);
  }

  @Get(":id")
  @RequirePermissions("partner.read")
  @ApiOperation({ summary: "Get one partner" })
  @ApiOkResponse({ type: PartnerResponse })
  @ApiNotFoundResponse({ type: ProblemDetails })
  get(
    @Req() req: RequestWithContext,
    @Param("id") id: string,
  ): Promise<PartnerResponse> {
    return this.partners.get(actingUserId(req), id);
  }

  @Post()
  @UseGuards(CsrfGuard)
  @ApiSecurity("csrf-token")
  @RequirePermissions("partner.create")
  @ApiOperation({ summary: "Register a partnership opportunity" })
  @ApiCreatedResponse({ type: PartnerResponse })
  @ApiBadRequestResponse({
    type: ProblemDetails,
    description: "Invalid input, or the owner is outside the department",
  })
  @ApiNotFoundResponse({
    type: ProblemDetails,
    description: "The department, campaign, or event does not exist",
  })
  create(
    @Req() req: RequestWithContext,
    @Body() body: CreatePartnerDto,
  ): Promise<PartnerResponse> {
    return this.partners.create(actingUserId(req), body);
  }

  @Patch(":id")
  @UseGuards(CsrfGuard)
  @ApiSecurity("csrf-token")
  @RequirePermissions("partner.update")
  @ApiOperation({ summary: "Edit a partner or change its status" })
  @ApiOkResponse({ type: PartnerResponse })
  @ApiBadRequestResponse({
    type: ProblemDetails,
    description: "Invalid input, or the owner is outside the department",
  })
  @ApiNotFoundResponse({ type: ProblemDetails })
  update(
    @Req() req: RequestWithContext,
    @Param("id") id: string,
    @Body() body: UpdatePartnerDto,
  ): Promise<PartnerResponse> {
    return this.partners.update(actingUserId(req), id, body);
  }

  @Get(":id/activities")
  @RequirePermissions("partner.read")
  @ApiOperation({ summary: "List a partner's activity log" })
  @ApiOkResponse({ type: PaginatedPartnerActivitiesResponse })
  @ApiNotFoundResponse({ type: ProblemDetails })
  listActivities(
    @Req() req: RequestWithContext,
    @Param("id") id: string,
    @Query() query: ListPartnerActivitiesQueryDto,
  ): Promise<PaginatedPartnerActivitiesResponse> {
    return this.partners.listActivities(actingUserId(req), id, query);
  }

  @Post(":id/activities")
  @UseGuards(CsrfGuard)
  @ApiSecurity("csrf-token")
  @RequirePermissions("partner.activity.create")
  @ApiOperation({ summary: "Add a note to a partner's activity log" })
  @ApiCreatedResponse({ type: PartnerActivityResponse })
  @ApiNotFoundResponse({ type: ProblemDetails })
  createActivity(
    @Req() req: RequestWithContext,
    @Param("id") id: string,
    @Body() body: CreatePartnerActivityDto,
  ): Promise<PartnerActivityResponse> {
    return this.partners.createActivity(actingUserId(req), id, body);
  }
}
