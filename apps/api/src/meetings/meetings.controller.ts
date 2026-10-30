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
  ApiNotFoundResponse,
  ApiNoContentResponse,
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
import { TaskResponse } from "../tasks/tasks.contracts.js";
import { CheckMeetingAvailabilityDto } from "./dto/check-meeting-availability.dto.js";
import { CreateMeetingDto } from "./dto/create-meeting.dto.js";
import { ListMeetingsQueryDto } from "./dto/list-meetings-query.dto.js";
import { CreateMeetingActionItemDto } from "./dto/create-meeting-action-item.dto.js";
import { RespondToMeetingDto } from "./dto/respond-to-meeting.dto.js";
import { SetMeetingMinutesDto } from "./dto/set-meeting-minutes.dto.js";
import { TransitionMeetingDto } from "./dto/transition-meeting.dto.js";
import { UpdateMeetingDto } from "./dto/update-meeting.dto.js";
import {
  MeetingAcknowledgementResponse,
  MeetingAvailabilityResponse,
  MeetingJitsiSessionResponse,
  MeetingResponse,
  PaginatedMeetingsResponse,
} from "./meetings.contracts.js";
import { MeetingsService } from "./meetings.service.js";

function actingUserId(request: RequestWithContext): string {
  const userId = request.user?.userId;
  if (!userId) throw unauthenticated();
  return userId;
}

@ApiTags("Meetings")
@ApiCookieAuth("access_token")
@ApiUnauthorizedResponse({
  type: ProblemDetails,
  description: "Not authenticated",
})
@ApiForbiddenResponse({
  type: ProblemDetails,
  description:
    "Missing permission, outside the resolved scope, or invalid CSRF token",
})
@ApiBadRequestResponse({
  type: ProblemDetails,
  description: "Invalid fields, UTC interval, reminder, or venue details",
})
@UseGuards(AccessTokenGuard, PermissionsGuard)
@Controller("meetings")
export class MeetingsController {
  constructor(private readonly meetings: MeetingsService) {}

  @Get()
  @RequirePermissions("meeting.read")
  @ApiOperation({ summary: "List meetings visible to the current user" })
  @ApiOkResponse({ type: PaginatedMeetingsResponse })
  list(
    @Req() request: RequestWithContext,
    @Query() query: ListMeetingsQueryDto,
  ): Promise<PaginatedMeetingsResponse> {
    return this.meetings.list(actingUserId(request), query);
  }

  @Post("availability")
  @HttpCode(HttpStatus.OK)
  @UseGuards(CsrfGuard)
  @ApiSecurity("csrf-token")
  @RequirePermissions("meeting.read")
  @ApiOperation({
    summary: "Check participant availability for a UTC interval",
  })
  @ApiOkResponse({ type: MeetingAvailabilityResponse })
  @ApiNotFoundResponse({
    type: ProblemDetails,
    description: "One or more users do not exist or are inactive",
  })
  availability(
    @Req() request: RequestWithContext,
    @Body() body: CheckMeetingAvailabilityDto,
  ): Promise<MeetingAvailabilityResponse> {
    return this.meetings.availability(actingUserId(request), body);
  }

  @Post()
  @UseGuards(CsrfGuard)
  @ApiSecurity("csrf-token")
  @RequirePermissions("meeting.create")
  @ApiOperation({ summary: "Schedule a meeting and invite its participants" })
  @ApiCreatedResponse({ type: MeetingResponse })
  @ApiNotFoundResponse({
    type: ProblemDetails,
    description: "Workspace or participant not found",
  })
  @ApiConflictResponse({
    type: ProblemDetails,
    description: "Organizer is also listed as a participant",
  })
  create(
    @Req() request: RequestWithContext,
    @Body() body: CreateMeetingDto,
  ): Promise<MeetingResponse> {
    return this.meetings.create(actingUserId(request), body, request.id);
  }

  @Get(":id")
  @RequirePermissions("meeting.read")
  @ApiOperation({ summary: "Get meeting details and participant responses" })
  @ApiOkResponse({ type: MeetingResponse })
  @ApiNotFoundResponse({
    type: ProblemDetails,
    description: "Meeting not found",
  })
  get(
    @Req() request: RequestWithContext,
    @Param("id") id: string,
  ): Promise<MeetingResponse> {
    return this.meetings.get(actingUserId(request), id);
  }

  @Get(":id/jitsi-session")
  @RequirePermissions("meeting.read")
  @ApiOperation({
    summary: "Get this meeting's self-hosted Jitsi room-join information",
  })
  @ApiOkResponse({ type: MeetingJitsiSessionResponse })
  @ApiNotFoundResponse({
    type: ProblemDetails,
    description: "Meeting not found",
  })
  @ApiConflictResponse({
    type: ProblemDetails,
    description:
      "The meeting is physical and has no video room, or video conferencing is not configured",
  })
  getJitsiSession(
    @Req() request: RequestWithContext,
    @Param("id") id: string,
  ): Promise<MeetingJitsiSessionResponse> {
    return this.meetings.getJitsiSession(actingUserId(request), id);
  }

  @Patch(":id")
  @UseGuards(CsrfGuard)
  @ApiSecurity("csrf-token")
  @RequirePermissions("meeting.update")
  @ApiOperation({
    summary: "Update a scheduled or completed meeting as its organizer",
  })
  @ApiOkResponse({ type: MeetingResponse })
  @ApiNotFoundResponse({
    type: ProblemDetails,
    description: "Meeting not found",
  })
  @ApiConflictResponse({
    type: ProblemDetails,
    description: "Meeting is cancelled",
  })
  update(
    @Req() request: RequestWithContext,
    @Param("id") id: string,
    @Body() body: UpdateMeetingDto,
  ): Promise<MeetingResponse> {
    return this.meetings.update(actingUserId(request), id, body);
  }

  @Delete(":id")
  @HttpCode(HttpStatus.NO_CONTENT)
  @UseGuards(CsrfGuard)
  @ApiSecurity("csrf-token")
  @RequirePermissions("meeting.update")
  @ApiOperation({
    summary: "Delete a meeting as its organizer, retaining action-item tasks",
  })
  @ApiNoContentResponse({ description: "Meeting removed" })
  @ApiNotFoundResponse({
    type: ProblemDetails,
    description: "Meeting not found",
  })
  remove(
    @Req() request: RequestWithContext,
    @Param("id") id: string,
  ): Promise<void> {
    return this.meetings.remove(actingUserId(request), id);
  }

  @Put(":id/minutes")
  @HttpCode(HttpStatus.OK)
  @UseGuards(CsrfGuard)
  @ApiSecurity("csrf-token")
  @RequirePermissions("meeting.update")
  @ApiOperation({
    summary: "Record or edit a meeting's minutes as its organizer",
  })
  @ApiOkResponse({ type: MeetingResponse })
  @ApiNotFoundResponse({
    type: ProblemDetails,
    description: "Meeting not found",
  })
  @ApiConflictResponse({
    type: ProblemDetails,
    description: "Meeting is cancelled",
  })
  setMinutes(
    @Req() request: RequestWithContext,
    @Param("id") id: string,
    @Body() body: SetMeetingMinutesDto,
  ): Promise<MeetingResponse> {
    return this.meetings.setMinutes(actingUserId(request), id, body.minutes);
  }

  @Post(":id/action-items")
  @UseGuards(CsrfGuard)
  @ApiSecurity("csrf-token")
  @RequirePermissions("meeting.update")
  @ApiOperation({
    summary: "Create a task action item from this meeting, as its organizer",
  })
  @ApiCreatedResponse({ type: TaskResponse })
  @ApiNotFoundResponse({
    type: ProblemDetails,
    description: "Meeting, department, or assignee not found",
  })
  createActionItem(
    @Req() request: RequestWithContext,
    @Param("id") id: string,
    @Body() body: CreateMeetingActionItemDto,
  ): Promise<TaskResponse> {
    return this.meetings.createActionItem(
      actingUserId(request),
      id,
      body,
      request.id,
    );
  }

  @Put(":id/participants/:userId")
  @HttpCode(HttpStatus.OK)
  @UseGuards(CsrfGuard)
  @ApiSecurity("csrf-token")
  @RequirePermissions("meeting.update")
  @ApiOperation({
    summary: "Invite an active participant to a scheduled meeting",
  })
  @ApiOkResponse({ type: MeetingResponse })
  @ApiNotFoundResponse({
    type: ProblemDetails,
    description: "Meeting or participant not found",
  })
  @ApiConflictResponse({
    type: ProblemDetails,
    description: "Participant already invited or meeting is terminal",
  })
  addParticipant(
    @Req() request: RequestWithContext,
    @Param("id") id: string,
    @Param("userId") userId: string,
  ): Promise<MeetingResponse> {
    return this.meetings.addParticipant(
      actingUserId(request),
      id,
      userId,
      request.id,
    );
  }

  @Delete(":id/participants/:userId")
  @HttpCode(HttpStatus.OK)
  @UseGuards(CsrfGuard)
  @ApiSecurity("csrf-token")
  @RequirePermissions("meeting.update")
  @ApiOperation({
    summary: "Remove an invited participant from a scheduled meeting",
  })
  @ApiOkResponse({ type: MeetingResponse })
  @ApiNotFoundResponse({
    type: ProblemDetails,
    description: "Meeting not found",
  })
  @ApiConflictResponse({
    type: ProblemDetails,
    description: "Participant was not invited or meeting is terminal",
  })
  removeParticipant(
    @Req() request: RequestWithContext,
    @Param("id") id: string,
    @Param("userId") userId: string,
  ): Promise<MeetingResponse> {
    return this.meetings.removeParticipant(actingUserId(request), id, userId);
  }

  @Put(":id/response")
  @HttpCode(HttpStatus.OK)
  @UseGuards(CsrfGuard)
  @ApiSecurity("csrf-token")
  @RequirePermissions("meeting.respond")
  @ApiOperation({
    summary: "Acknowledge an invitation as accepted or declined",
  })
  @ApiOkResponse({ type: MeetingAcknowledgementResponse })
  @ApiNotFoundResponse({
    type: ProblemDetails,
    description: "Meeting not found",
  })
  @ApiConflictResponse({
    type: ProblemDetails,
    description: "Response was already acknowledged or meeting is terminal",
  })
  respond(
    @Req() request: RequestWithContext,
    @Param("id") id: string,
    @Body() body: RespondToMeetingDto,
  ): Promise<MeetingAcknowledgementResponse> {
    return this.meetings.respond(actingUserId(request), id, body.response);
  }

  @Post(":id/transition")
  @HttpCode(HttpStatus.OK)
  @UseGuards(CsrfGuard)
  @ApiSecurity("csrf-token")
  @RequirePermissions("meeting.update")
  @ApiOperation({
    summary: "Complete or cancel a scheduled meeting as its organizer",
  })
  @ApiOkResponse({ type: MeetingResponse })
  @ApiNotFoundResponse({
    type: ProblemDetails,
    description: "Meeting not found",
  })
  @ApiConflictResponse({
    type: ProblemDetails,
    description: "Invalid lifecycle transition",
  })
  transition(
    @Req() request: RequestWithContext,
    @Param("id") id: string,
    @Body() body: TransitionMeetingDto,
  ): Promise<MeetingResponse> {
    return this.meetings.transition(actingUserId(request), id, body.status);
  }
}
