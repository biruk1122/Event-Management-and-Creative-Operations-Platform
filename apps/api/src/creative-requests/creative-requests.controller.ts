import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
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
  CreativeRequestFeedbackResponse,
  CreativeRequestResponse,
  PaginatedCreativeRequestFeedbackResponse,
  PaginatedCreativeRequestsResponse,
} from "./creative-requests.contracts.js";
import {
  CreateCreativeRequestDto,
  CreateCreativeRequestFeedbackDto,
  DeclineCreativeRequestDto,
  ListCreativeRequestFeedbackQueryDto,
  ListCreativeRequestsQueryDto,
  ReviewCreativeRequestDto,
} from "./creative-requests.dto.js";
import { CreativeRequestsService } from "./creative-requests.service.js";

function actingUserId(request: RequestWithContext): string {
  if (!request.user?.userId) throw unauthenticated();
  return request.user.userId;
}

/**
 * Creative requests (EVE-232). The guard checks the key each action needs;
 * `CreativeRequestsService` then checks which side of the specific request
 * the caller acts for.
 */
@ApiTags("Creative requests")
@ApiCookieAuth("access_token")
@ApiUnauthorizedResponse({ type: ProblemDetails })
@ApiForbiddenResponse({ type: ProblemDetails })
@UseGuards(AccessTokenGuard, PermissionsGuard)
@Controller("creative-requests")
export class CreativeRequestsController {
  constructor(private readonly requests: CreativeRequestsService) {}

  @Get()
  @RequirePermissions("creative_request.read")
  @ApiOperation({ summary: "List creative requests visible to the caller" })
  @ApiOkResponse({ type: PaginatedCreativeRequestsResponse })
  list(
    @Req() req: RequestWithContext,
    @Query() query: ListCreativeRequestsQueryDto,
  ): Promise<PaginatedCreativeRequestsResponse> {
    return this.requests.list(actingUserId(req), query);
  }

  @Get(":id")
  @RequirePermissions("creative_request.read")
  @ApiOperation({ summary: "Get one creative request" })
  @ApiOkResponse({ type: CreativeRequestResponse })
  @ApiNotFoundResponse({ type: ProblemDetails })
  get(
    @Req() req: RequestWithContext,
    @Param("id") id: string,
  ): Promise<CreativeRequestResponse> {
    return this.requests.get(actingUserId(req), id);
  }

  @Post()
  @UseGuards(CsrfGuard)
  @ApiSecurity("csrf-token")
  @RequirePermissions("creative_request.create")
  @ApiOperation({ summary: "Send a creative request to Production" })
  @ApiCreatedResponse({ type: CreativeRequestResponse })
  @ApiBadRequestResponse({ type: ProblemDetails })
  @ApiNotFoundResponse({
    type: ProblemDetails,
    description: "The campaign or event does not exist",
  })
  @ApiConflictResponse({
    type: ProblemDetails,
    description: "Promotion or Production is not an active department",
  })
  create(
    @Req() req: RequestWithContext,
    @Body() body: CreateCreativeRequestDto,
  ): Promise<CreativeRequestResponse> {
    return this.requests.create(actingUserId(req), body, req.id);
  }

  @Post(":id/cancel")
  @HttpCode(HttpStatus.OK)
  @UseGuards(CsrfGuard)
  @ApiSecurity("csrf-token")
  @RequirePermissions("creative_request.create")
  @ApiOperation({ summary: "Cancel a request before it is accepted" })
  @ApiOkResponse({ type: CreativeRequestResponse })
  @ApiNotFoundResponse({ type: ProblemDetails })
  @ApiConflictResponse({ type: ProblemDetails })
  cancel(
    @Req() req: RequestWithContext,
    @Param("id") id: string,
  ): Promise<CreativeRequestResponse> {
    return this.requests.cancel(actingUserId(req), id, req.id);
  }

  @Post(":id/accept")
  @HttpCode(HttpStatus.OK)
  @UseGuards(CsrfGuard)
  @ApiSecurity("csrf-token")
  @RequirePermissions("creative_request.respond")
  @ApiOperation({
    summary: "Accept a request and create its CREATIVE task",
  })
  @ApiOkResponse({ type: CreativeRequestResponse })
  @ApiNotFoundResponse({ type: ProblemDetails })
  @ApiConflictResponse({ type: ProblemDetails })
  accept(
    @Req() req: RequestWithContext,
    @Param("id") id: string,
  ): Promise<CreativeRequestResponse> {
    return this.requests.accept(actingUserId(req), id, req.id);
  }

  @Post(":id/decline")
  @HttpCode(HttpStatus.OK)
  @UseGuards(CsrfGuard)
  @ApiSecurity("csrf-token")
  @RequirePermissions("creative_request.respond")
  @ApiOperation({ summary: "Decline a request, with a reason" })
  @ApiOkResponse({ type: CreativeRequestResponse })
  @ApiBadRequestResponse({ type: ProblemDetails })
  @ApiNotFoundResponse({ type: ProblemDetails })
  @ApiConflictResponse({ type: ProblemDetails })
  decline(
    @Req() req: RequestWithContext,
    @Param("id") id: string,
    @Body() body: DeclineCreativeRequestDto,
  ): Promise<CreativeRequestResponse> {
    return this.requests.decline(actingUserId(req), id, body, req.id);
  }

  @Post(":id/start")
  @HttpCode(HttpStatus.OK)
  @UseGuards(CsrfGuard)
  @ApiSecurity("csrf-token")
  @RequirePermissions("creative_request.respond")
  @ApiOperation({
    summary: "Start work on an accepted request, or resume after changes",
  })
  @ApiOkResponse({ type: CreativeRequestResponse })
  @ApiNotFoundResponse({ type: ProblemDetails })
  @ApiConflictResponse({ type: ProblemDetails })
  start(
    @Req() req: RequestWithContext,
    @Param("id") id: string,
  ): Promise<CreativeRequestResponse> {
    return this.requests.start(actingUserId(req), id, req.id);
  }

  @Post(":id/deliver")
  @HttpCode(HttpStatus.OK)
  @UseGuards(CsrfGuard)
  @ApiSecurity("csrf-token")
  @RequirePermissions("creative_request.respond")
  @ApiOperation({ summary: "Hand the deliverables back for review" })
  @ApiOkResponse({ type: CreativeRequestResponse })
  @ApiNotFoundResponse({ type: ProblemDetails })
  @ApiConflictResponse({ type: ProblemDetails })
  deliver(
    @Req() req: RequestWithContext,
    @Param("id") id: string,
  ): Promise<CreativeRequestResponse> {
    return this.requests.deliver(actingUserId(req), id, req.id);
  }

  @Post(":id/review")
  @HttpCode(HttpStatus.OK)
  @UseGuards(CsrfGuard)
  @ApiSecurity("csrf-token")
  @RequirePermissions("creative_request.review")
  @ApiOperation({
    summary: "Approve the delivered work, or ask for changes",
  })
  @ApiOkResponse({ type: CreativeRequestResponse })
  @ApiBadRequestResponse({ type: ProblemDetails })
  @ApiNotFoundResponse({ type: ProblemDetails })
  @ApiConflictResponse({ type: ProblemDetails })
  review(
    @Req() req: RequestWithContext,
    @Param("id") id: string,
    @Body() body: ReviewCreativeRequestDto,
  ): Promise<CreativeRequestResponse> {
    return this.requests.review(actingUserId(req), id, body, req.id);
  }

  @Get(":id/feedback")
  @RequirePermissions("creative_request.read")
  @ApiOperation({ summary: "List a request's feedback, oldest first" })
  @ApiOkResponse({ type: PaginatedCreativeRequestFeedbackResponse })
  @ApiNotFoundResponse({ type: ProblemDetails })
  listFeedback(
    @Req() req: RequestWithContext,
    @Param("id") id: string,
    @Query() query: ListCreativeRequestFeedbackQueryDto,
  ): Promise<PaginatedCreativeRequestFeedbackResponse> {
    return this.requests.listFeedback(actingUserId(req), id, query);
  }

  @Post(":id/feedback")
  @UseGuards(CsrfGuard)
  @ApiSecurity("csrf-token")
  @RequirePermissions("creative_request.read")
  @ApiOperation({
    summary: "Add feedback; either side of the request may write it",
  })
  @ApiCreatedResponse({ type: CreativeRequestFeedbackResponse })
  @ApiBadRequestResponse({ type: ProblemDetails })
  @ApiNotFoundResponse({ type: ProblemDetails })
  addFeedback(
    @Req() req: RequestWithContext,
    @Param("id") id: string,
    @Body() body: CreateCreativeRequestFeedbackDto,
  ): Promise<CreativeRequestFeedbackResponse> {
    return this.requests.addFeedback(actingUserId(req), id, body);
  }
}
