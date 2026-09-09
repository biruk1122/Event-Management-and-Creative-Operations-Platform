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
  EventBudgetResponse,
  EventResponse,
  PaginatedEventsResponse,
} from "./events.contracts.js";
import { EventsService } from "./events.service.js";
import { AssignEventManagerDto } from "./dto/assign-event-manager.dto.js";
import { CreateEventDto } from "./dto/create-event.dto.js";
import { ListEventsQueryDto } from "./dto/list-events-query.dto.js";
import { SetEventBudgetDto } from "./dto/set-event-budget.dto.js";
import { TransitionEventDto } from "./dto/transition-event.dto.js";
import { UpdateEventDto } from "./dto/update-event.dto.js";

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
 * Event management (SRS 5.5). Every route is for an event, so - unlike the
 * generic connected-workspace controller - the required permission is known
 * statically and declared with `@RequirePermissions`. `EventsService` re-checks
 * that key at ORGANIZATION scope as the precise boundary. The guard chain
 * enforces authentication on every route and a CSRF token on every mutation.
 */
@ApiTags("Event management")
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
@Controller("events")
export class EventsController {
  constructor(private readonly events: EventsService) {}

  @Get()
  @RequirePermissions("event.read")
  @ApiOperation({ summary: "List events the caller may see, with filters" })
  @ApiOkResponse({ type: PaginatedEventsResponse })
  async list(
    @Req() request: RequestWithContext,
    @Query() query: ListEventsQueryDto,
  ): Promise<PaginatedEventsResponse> {
    return this.events.list(actingUserId(request), query);
  }

  @Get(":id")
  @RequirePermissions("event.read")
  @ApiOperation({
    summary: "Get one event with its connected workspace overview",
  })
  @ApiOkResponse({ type: EventResponse })
  @ApiNotFoundResponse({ type: ProblemDetails, description: "Event not found" })
  async get(
    @Req() request: RequestWithContext,
    @Param("id") id: string,
  ): Promise<EventResponse> {
    return this.events.get(actingUserId(request), id);
  }

  @Post()
  @UseGuards(CsrfGuard)
  @ApiSecurity("csrf-token")
  @RequirePermissions("event.create")
  @ApiOperation({
    summary: "Create an event and its connected workspace",
  })
  @ApiCreatedResponse({ type: EventResponse })
  @ApiNotFoundResponse({
    type: ProblemDetails,
    description: "The requested manager user does not exist",
  })
  async create(
    @Req() request: RequestWithContext,
    @Body() body: CreateEventDto,
  ): Promise<EventResponse> {
    return this.events.create(actingUserId(request), body);
  }

  @Patch(":id")
  @UseGuards(CsrfGuard)
  @ApiSecurity("csrf-token")
  @RequirePermissions("event.update")
  @ApiOperation({
    summary: "Update event details (not status, manager, teams, or budget)",
  })
  @ApiOkResponse({ type: EventResponse })
  @ApiNotFoundResponse({ type: ProblemDetails, description: "Event not found" })
  async update(
    @Req() request: RequestWithContext,
    @Param("id") id: string,
    @Body() body: UpdateEventDto,
  ): Promise<EventResponse> {
    return this.events.update(actingUserId(request), id, body);
  }

  @Post(":id/transition")
  @HttpCode(HttpStatus.OK)
  @UseGuards(CsrfGuard)
  @ApiSecurity("csrf-token")
  @RequirePermissions("event.transition_status")
  @ApiOperation({
    summary: "Move an event to another lifecycle state",
  })
  @ApiOkResponse({ type: EventResponse })
  @ApiNotFoundResponse({ type: ProblemDetails, description: "Event not found" })
  @ApiConflictResponse({
    type: ProblemDetails,
    description: "That transition is not allowed from the current state",
  })
  async transition(
    @Req() request: RequestWithContext,
    @Param("id") id: string,
    @Body() body: TransitionEventDto,
  ): Promise<EventResponse> {
    return this.events.transition(actingUserId(request), id, body.status);
  }

  @Put(":id/manager")
  @HttpCode(HttpStatus.OK)
  @UseGuards(CsrfGuard)
  @ApiSecurity("csrf-token")
  @RequirePermissions("event.assign_manager")
  @ApiOperation({ summary: "Set, change, or clear the event manager" })
  @ApiOkResponse({ type: EventResponse })
  @ApiNotFoundResponse({
    type: ProblemDetails,
    description: "The event or the requested manager user does not exist",
  })
  async setManager(
    @Req() request: RequestWithContext,
    @Param("id") id: string,
    @Body() body: AssignEventManagerDto,
  ): Promise<EventResponse> {
    return this.events.setManager(actingUserId(request), id, body.managerId);
  }

  @Put(":id/teams/:teamId")
  @HttpCode(HttpStatus.OK)
  @UseGuards(CsrfGuard)
  @ApiSecurity("csrf-token")
  @RequirePermissions("event.assign_teams")
  @ApiOperation({ summary: "Assign a team to this event (idempotent)" })
  @ApiOkResponse({ type: EventResponse })
  @ApiNotFoundResponse({
    type: ProblemDetails,
    description: "The event or the team does not exist",
  })
  async assignTeam(
    @Req() request: RequestWithContext,
    @Param("id") id: string,
    @Param("teamId") teamId: string,
  ): Promise<EventResponse> {
    return this.events.assignTeam(actingUserId(request), id, teamId);
  }

  @Delete(":id/teams/:teamId")
  @HttpCode(HttpStatus.OK)
  @UseGuards(CsrfGuard)
  @ApiSecurity("csrf-token")
  @RequirePermissions("event.assign_teams")
  @ApiOperation({ summary: "Unassign a team from this event" })
  @ApiOkResponse({ type: EventResponse })
  @ApiNotFoundResponse({ type: ProblemDetails, description: "Event not found" })
  @ApiConflictResponse({
    type: ProblemDetails,
    description: "That team is not assigned to this event",
  })
  async unassignTeam(
    @Req() request: RequestWithContext,
    @Param("id") id: string,
    @Param("teamId") teamId: string,
  ): Promise<EventResponse> {
    return this.events.unassignTeam(actingUserId(request), id, teamId);
  }

  @Get(":id/budget")
  @RequirePermissions("event.budget.read")
  @ApiOperation({ summary: "Read the event budget (sensitive)" })
  @ApiOkResponse({ type: EventBudgetResponse })
  @ApiNotFoundResponse({ type: ProblemDetails, description: "Event not found" })
  async getBudget(
    @Req() request: RequestWithContext,
    @Param("id") id: string,
  ): Promise<EventBudgetResponse> {
    return this.events.getBudget(actingUserId(request), id);
  }

  @Put(":id/budget")
  @HttpCode(HttpStatus.OK)
  @UseGuards(CsrfGuard)
  @ApiSecurity("csrf-token")
  @RequirePermissions("event.budget.update")
  @ApiOperation({ summary: "Set or clear the event budget (sensitive)" })
  @ApiOkResponse({ type: EventBudgetResponse })
  @ApiNotFoundResponse({ type: ProblemDetails, description: "Event not found" })
  async setBudget(
    @Req() request: RequestWithContext,
    @Param("id") id: string,
    @Body() body: SetEventBudgetDto,
  ): Promise<EventBudgetResponse> {
    return this.events.setBudget(actingUserId(request), id, body);
  }

  @Delete(":id")
  @HttpCode(HttpStatus.NO_CONTENT)
  @UseGuards(CsrfGuard)
  @ApiSecurity("csrf-token")
  @RequirePermissions("event.delete")
  @ApiOperation({ summary: "Remove an event and its connected workspace" })
  @ApiNoContentResponse({ description: "The event was removed" })
  @ApiNotFoundResponse({ type: ProblemDetails, description: "Event not found" })
  async remove(
    @Req() request: RequestWithContext,
    @Param("id") id: string,
  ): Promise<void> {
    await this.events.remove(actingUserId(request), id);
  }
}
