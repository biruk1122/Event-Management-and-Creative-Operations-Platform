import {
  BadRequestException,
  Body,
  Controller,
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
  ApiCookieAuth,
  ApiForbiddenResponse,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
  ApiUnauthorizedResponse,
} from "@nestjs/swagger";
import { unauthenticated } from "../auth/auth.errors.js";
import { AccessTokenGuard } from "../auth/guards/access-token.guard.js";
import { CsrfGuard } from "../auth/guards/csrf.guard.js";
import { ProblemDetails } from "../common/http/problem-details.js";
import type { RequestWithContext } from "../common/http/request-with-context.js";
import type { AssignmentKind } from "./talent-assignment.domain.js";
import {
  TalentActivityResponse,
  TalentAssignmentCheckResponse,
  TalentAssignmentResponse,
  TalentWorkOptionResponse,
} from "./talent-assignments.contracts.js";
import { TalentAssignmentsService } from "./talent-assignments.service.js";
import {
  ASSIGNMENT_KINDS,
  CreateTalentAssignmentDto,
  ListAssignableWorksQueryDto,
  TalentAssignmentWindowDto,
  TransitionTalentAssignmentDto,
  UpdateTalentAssignmentDto,
} from "./dto/talent-assignment.dto.js";

function actor(request: RequestWithContext): string {
  if (!request.user?.userId) throw unauthenticated();
  return request.user.userId;
}

/**
 * Route kinds are validated here because they select a database table. Access
 * is decided by TalentAssignmentsService, not by a route-level permission key:
 * a Production Manager holds no organization-wide talent key, but may manage
 * the assignments of their own department's events and productions.
 */
function parseKind(raw: string): AssignmentKind {
  if ((ASSIGNMENT_KINDS as readonly string[]).includes(raw)) {
    return raw as AssignmentKind;
  }
  throw new BadRequestException({
    code: "TALENT_ASSIGNMENT_KIND_INVALID",
    error: "Bad Request",
    detail: "The assignment kind must be EVENT, PRODUCTION, or PROMOTION.",
  });
}

@ApiTags("Talent management")
@ApiCookieAuth("access_token")
@ApiUnauthorizedResponse({ type: ProblemDetails })
@ApiForbiddenResponse({ type: ProblemDetails })
@UseGuards(AccessTokenGuard)
@Controller("talents")
export class TalentAssignmentsController {
  constructor(private readonly assignments: TalentAssignmentsService) {}

  @Get(":talentId/assignments")
  @ApiOperation({
    summary:
      "List a talent's assignments, of every status, that the caller may see",
  })
  @ApiOkResponse({ type: [TalentAssignmentResponse] })
  @ApiNotFoundResponse({ type: ProblemDetails })
  list(
    @Req() request: RequestWithContext,
    @Param("talentId") talentId: string,
  ): Promise<TalentAssignmentResponse[]> {
    return this.assignments.list(actor(request), talentId);
  }

  @Get(":talentId/activity")
  @ApiOperation({
    summary: "List a talent's history (organization talent readers only)",
  })
  @ApiOkResponse({ type: [TalentActivityResponse] })
  @ApiNotFoundResponse({ type: ProblemDetails })
  activity(
    @Req() request: RequestWithContext,
    @Param("talentId") talentId: string,
  ): Promise<TalentActivityResponse[]> {
    return this.assignments.history(actor(request), talentId);
  }

  @Post(":talentId/assignments/check")
  @HttpCode(HttpStatus.OK)
  @UseGuards(CsrfGuard)
  @ApiOperation({
    summary:
      "Check an assignment against current data without saving it: blocks, duplicates, and conflicts",
  })
  @ApiOkResponse({ type: TalentAssignmentCheckResponse })
  check(
    @Req() request: RequestWithContext,
    @Param("talentId") talentId: string,
    @Body() body: TalentAssignmentWindowDto,
  ): Promise<TalentAssignmentCheckResponse> {
    return this.assignments.check(actor(request), talentId, body);
  }

  @Post(":talentId/assignments")
  @UseGuards(CsrfGuard)
  @ApiOperation({
    summary:
      "Create an assignment. Conflicts need acknowledgeConflicts; the override is recorded",
  })
  @ApiOkResponse({ type: TalentAssignmentResponse })
  create(
    @Req() request: RequestWithContext,
    @Param("talentId") talentId: string,
    @Body() body: CreateTalentAssignmentDto,
  ): Promise<TalentAssignmentResponse> {
    return this.assignments.create(actor(request), talentId, body, request.id);
  }

  @Patch(":talentId/assignments/:kind/:assignmentId")
  @UseGuards(CsrfGuard)
  @ApiOperation({
    summary: "Update an active assignment's role, notes, or dates",
  })
  @ApiOkResponse({ type: TalentAssignmentResponse })
  update(
    @Req() request: RequestWithContext,
    @Param("talentId") talentId: string,
    @Param("kind") kind: string,
    @Param("assignmentId") assignmentId: string,
    @Body() body: UpdateTalentAssignmentDto,
  ): Promise<TalentAssignmentResponse> {
    return this.assignments.update(
      actor(request),
      talentId,
      parseKind(kind),
      assignmentId,
      body,
      request.id,
    );
  }

  @Post(":talentId/assignments/:kind/:assignmentId/transition")
  @HttpCode(HttpStatus.OK)
  @UseGuards(CsrfGuard)
  @ApiOperation({
    summary:
      "Complete or cancel an active assignment (cancelling needs a reason)",
  })
  @ApiOkResponse({ type: TalentAssignmentResponse })
  transition(
    @Req() request: RequestWithContext,
    @Param("talentId") talentId: string,
    @Param("kind") kind: string,
    @Param("assignmentId") assignmentId: string,
    @Body() body: TransitionTalentAssignmentDto,
  ): Promise<TalentAssignmentResponse> {
    return this.assignments.transition(
      actor(request),
      talentId,
      parseKind(kind),
      assignmentId,
      body,
      request.id,
    );
  }
}

@ApiTags("Talent management")
@ApiCookieAuth("access_token")
@ApiUnauthorizedResponse({ type: ProblemDetails })
@ApiForbiddenResponse({ type: ProblemDetails })
@UseGuards(AccessTokenGuard)
@Controller("talent-assignments")
export class TalentAssignableWorksController {
  constructor(private readonly assignments: TalentAssignmentsService) {}

  @Get("works")
  @ApiOperation({
    summary:
      "Events, productions, or promotional activities the caller may assign talent to",
  })
  @ApiOkResponse({ type: [TalentWorkOptionResponse] })
  works(
    @Req() request: RequestWithContext,
    @Query() query: ListAssignableWorksQueryDto,
  ): Promise<TalentWorkOptionResponse[]> {
    return this.assignments.assignableWorks(actor(request), query);
  }
}
