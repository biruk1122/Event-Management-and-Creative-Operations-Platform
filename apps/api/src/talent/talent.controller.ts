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
  ApiCookieAuth,
  ApiCreatedResponse,
  ApiForbiddenResponse,
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
import {
  PaginatedTalentsResponse,
  TalentResponse,
} from "./talent.contracts.js";
import { TalentService } from "./talent.service.js";
import { CreateEventTalentAssignmentDto } from "./dto/create-event-talent-assignment.dto.js";
import { CreateTalentScheduleDto } from "./dto/create-talent-schedule.dto.js";
import { CreateTalentSocialLinkDto } from "./dto/create-talent-social-link.dto.js";
import { CreateTalentDto } from "./dto/create-talent.dto.js";
import { ListTalentsQueryDto } from "./dto/list-talents-query.dto.js";
import { SetTalentManagerDto } from "./dto/set-talent-manager.dto.js";
import { TransitionEventTalentAssignmentDto } from "./dto/transition-event-talent-assignment.dto.js";
import { TransitionTalentDto } from "./dto/transition-talent.dto.js";
import { UpdateTalentScheduleDto } from "./dto/update-talent-schedule.dto.js";
import { UpdateTalentDto } from "./dto/update-talent.dto.js";
function actor(request: RequestWithContext): string {
  if (!request.user?.userId) throw unauthenticated();
  return request.user.userId;
}
@ApiTags("Talent management")
@ApiCookieAuth("access_token")
@ApiUnauthorizedResponse({ type: ProblemDetails })
@ApiForbiddenResponse({ type: ProblemDetails })
@UseGuards(AccessTokenGuard, PermissionsGuard)
@Controller("talents")
export class TalentController {
  constructor(private readonly talent: TalentService) {}
  @Get()
  @RequirePermissions("talent.read")
  @ApiOperation({ summary: "List talent profiles" })
  @ApiOkResponse({ type: PaginatedTalentsResponse })
  list(@Req() r: RequestWithContext, @Query() q: ListTalentsQueryDto) {
    return this.talent.list(actor(r), q);
  }
  @Get(":id")
  @RequirePermissions("talent.read")
  @ApiOperation({
    summary: "Get a talent profile, schedule, and event assignments",
  })
  @ApiOkResponse({ type: TalentResponse })
  get(@Req() r: RequestWithContext, @Param("id") id: string) {
    return this.talent.get(actor(r), id);
  }
  @Post()
  @UseGuards(CsrfGuard)
  @ApiSecurity("csrf-token")
  @RequirePermissions("talent.create")
  @ApiCreatedResponse({ type: TalentResponse })
  create(@Req() r: RequestWithContext, @Body() b: CreateTalentDto) {
    return this.talent.create(actor(r), b);
  }
  @Patch(":id")
  @UseGuards(CsrfGuard)
  @ApiSecurity("csrf-token")
  @RequirePermissions("talent.update")
  @ApiOkResponse({ type: TalentResponse })
  update(
    @Req() r: RequestWithContext,
    @Param("id") id: string,
    @Body() b: UpdateTalentDto,
  ) {
    return this.talent.update(actor(r), id, b);
  }
  @Put(":id/manager")
  @UseGuards(CsrfGuard)
  @ApiSecurity("csrf-token")
  @RequirePermissions("talent.update")
  manager(
    @Req() r: RequestWithContext,
    @Param("id") id: string,
    @Body() b: SetTalentManagerDto,
  ) {
    return this.talent.setManager(actor(r), id, b);
  }
  @Post(":id/transition")
  @HttpCode(HttpStatus.OK)
  @UseGuards(CsrfGuard)
  @ApiSecurity("csrf-token")
  @RequirePermissions("talent.transition_status")
  transition(
    @Req() r: RequestWithContext,
    @Param("id") id: string,
    @Body() b: TransitionTalentDto,
  ) {
    return this.talent.transition(actor(r), id, b.availability);
  }
  @Post(":id/social-links")
  @UseGuards(CsrfGuard)
  @ApiSecurity("csrf-token")
  @RequirePermissions("talent.update")
  @ApiCreatedResponse({ type: TalentResponse })
  social(
    @Req() r: RequestWithContext,
    @Param("id") id: string,
    @Body() b: CreateTalentSocialLinkDto,
  ) {
    return this.talent.addSocialLink(actor(r), id, b);
  }
  @Delete(":id/social-links/:socialLinkId")
  @HttpCode(HttpStatus.NO_CONTENT)
  @UseGuards(CsrfGuard)
  @ApiSecurity("csrf-token")
  @RequirePermissions("talent.update")
  @ApiNoContentResponse()
  async removeSocial(
    @Req() r: RequestWithContext,
    @Param("id") id: string,
    @Param("socialLinkId") socialLinkId: string,
  ) {
    await this.talent.removeSocialLink(actor(r), id, socialLinkId);
  }
  @Post(":id/schedules")
  @UseGuards(CsrfGuard)
  @ApiSecurity("csrf-token")
  @RequirePermissions("talent.manage_activities")
  @ApiCreatedResponse({ type: TalentResponse })
  schedule(
    @Req() r: RequestWithContext,
    @Param("id") id: string,
    @Body() b: CreateTalentScheduleDto,
  ) {
    return this.talent.addSchedule(actor(r), id, b);
  }
  @Patch(":id/schedules/:scheduleId")
  @UseGuards(CsrfGuard)
  @ApiSecurity("csrf-token")
  @RequirePermissions("talent.manage_activities")
  updateSchedule(
    @Req() r: RequestWithContext,
    @Param("id") id: string,
    @Param("scheduleId") scheduleId: string,
    @Body() b: UpdateTalentScheduleDto,
  ) {
    return this.talent.updateSchedule(actor(r), id, scheduleId, b);
  }
  @Delete(":id/schedules/:scheduleId")
  @HttpCode(HttpStatus.NO_CONTENT)
  @UseGuards(CsrfGuard)
  @ApiSecurity("csrf-token")
  @RequirePermissions("talent.manage_activities")
  @ApiNoContentResponse()
  async removeSchedule(
    @Req() r: RequestWithContext,
    @Param("id") id: string,
    @Param("scheduleId") scheduleId: string,
  ) {
    await this.talent.removeSchedule(actor(r), id, scheduleId);
  }
  @Post(":id/event-assignments")
  @UseGuards(CsrfGuard)
  @ApiSecurity("csrf-token")
  @RequirePermissions("talent.assign")
  @ApiCreatedResponse({ type: TalentResponse })
  assign(
    @Req() r: RequestWithContext,
    @Param("id") id: string,
    @Body() b: CreateEventTalentAssignmentDto,
  ) {
    return this.talent.assignEvent(actor(r), id, b);
  }
  @Post(":id/event-assignments/:assignmentId/transition")
  @HttpCode(HttpStatus.OK)
  @UseGuards(CsrfGuard)
  @ApiSecurity("csrf-token")
  @RequirePermissions("talent.assign")
  assignmentTransition(
    @Req() r: RequestWithContext,
    @Param("id") id: string,
    @Param("assignmentId") assignmentId: string,
    @Body() b: TransitionEventTalentAssignmentDto,
  ) {
    return this.talent.transitionAssignment(
      actor(r),
      id,
      assignmentId,
      b.status,
    );
  }
}
