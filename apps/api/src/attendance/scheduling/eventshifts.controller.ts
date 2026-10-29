import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  Patch,
  Post,
  Req,
  UseGuards,
} from "@nestjs/common";
import {
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

import { unauthenticated } from "../../auth/auth.errors.js";
import { AccessTokenGuard } from "../../auth/guards/access-token.guard.js";
import { CsrfGuard } from "../../auth/guards/csrf.guard.js";
import { ProblemDetails } from "../../common/http/problem-details.js";
import type { RequestWithContext } from "../../common/http/request-with-context.js";
import { RequirePermissions } from "../../common/security/permissions.decorator.js";
import { PermissionsGuard } from "../../common/security/permissions.guard.js";
import { AssignEmployeeDto } from "./dto/assign-employee.dto.js";
import { CreateEventShiftDto } from "./dto/create-event-shift.dto.js";
import { RescheduleEventShiftDto } from "./dto/reschedule-event-shift.dto.js";
import { ShiftReasonDto } from "./dto/shift-reason.dto.js";
import { UpdateEventShiftDto } from "./dto/update-event-shift.dto.js";
import {
  EventShiftAssignmentResponse,
  EventShiftChangeResponse,
  EventShiftResponse,
} from "./eventshifts.contracts.js";
import { EventShiftsService } from "./eventshifts.service.js";

function actingUserId(request: RequestWithContext): string {
  if (!request.user?.userId) throw unauthenticated();
  return request.user.userId;
}

/**
 * Event shift scheduling - nested under the owning event so every id in
 * the path is validated as belonging to that event (`EventShiftsService`'s
 * own object-level check), never trusted on its own.
 */
@ApiTags("Attendance: Scheduling")
@ApiCookieAuth("access_token")
@ApiUnauthorizedResponse({ type: ProblemDetails })
@ApiForbiddenResponse({ type: ProblemDetails })
@ApiNotFoundResponse({ type: ProblemDetails })
@UseGuards(AccessTokenGuard, PermissionsGuard)
@Controller("events/:eventId/shifts")
export class EventShiftsController {
  constructor(private readonly shifts: EventShiftsService) {}

  @Get()
  @RequirePermissions("attendance.schedule.manage")
  @ApiOperation({ summary: "List an event's shifts" })
  @ApiOkResponse({ type: [EventShiftResponse] })
  list(
    @Req() req: RequestWithContext,
    @Param("eventId") eventId: string,
  ): Promise<EventShiftResponse[]> {
    return this.shifts.list(actingUserId(req), eventId);
  }

  @Post()
  @UseGuards(CsrfGuard)
  @ApiSecurity("csrf-token")
  @RequirePermissions("attendance.schedule.manage")
  @ApiOperation({ summary: "Create an event shift" })
  @ApiCreatedResponse({ type: EventShiftResponse })
  create(
    @Req() req: RequestWithContext,
    @Param("eventId") eventId: string,
    @Body() body: CreateEventShiftDto,
  ): Promise<EventShiftResponse> {
    return this.shifts.create(actingUserId(req), eventId, body, req.id);
  }

  @Get(":shiftId")
  @RequirePermissions("attendance.schedule.manage")
  @ApiOperation({ summary: "Get one event shift" })
  @ApiOkResponse({ type: EventShiftResponse })
  findOne(
    @Req() req: RequestWithContext,
    @Param("eventId") eventId: string,
    @Param("shiftId") shiftId: string,
  ): Promise<EventShiftResponse> {
    return this.shifts.findOne(actingUserId(req), eventId, shiftId);
  }

  @Patch(":shiftId")
  @UseGuards(CsrfGuard)
  @ApiSecurity("csrf-token")
  @RequirePermissions("attendance.schedule.manage")
  @ApiOperation({ summary: "Update shift metadata (location, geofence, break)" })
  @ApiOkResponse({ type: EventShiftResponse })
  update(
    @Req() req: RequestWithContext,
    @Param("eventId") eventId: string,
    @Param("shiftId") shiftId: string,
    @Body() body: UpdateEventShiftDto,
  ): Promise<EventShiftResponse> {
    return this.shifts.update(actingUserId(req), eventId, shiftId, body);
  }

  @Post(":shiftId/reschedule")
  @UseGuards(CsrfGuard)
  @ApiSecurity("csrf-token")
  @RequirePermissions("attendance.schedule.manage")
  @ApiOperation({ summary: "Reschedule or extend a shift, with a required reason" })
  @ApiOkResponse({ type: EventShiftResponse })
  reschedule(
    @Req() req: RequestWithContext,
    @Param("eventId") eventId: string,
    @Param("shiftId") shiftId: string,
    @Body() body: RescheduleEventShiftDto,
  ): Promise<EventShiftResponse> {
    return this.shifts.reschedule(actingUserId(req), eventId, shiftId, body, req.id);
  }

  @Post(":shiftId/cancel")
  @UseGuards(CsrfGuard)
  @ApiSecurity("csrf-token")
  @RequirePermissions("attendance.schedule.manage")
  @ApiOperation({ summary: "Cancel a shift, with a required reason" })
  @ApiOkResponse({ type: EventShiftResponse })
  cancel(
    @Req() req: RequestWithContext,
    @Param("eventId") eventId: string,
    @Param("shiftId") shiftId: string,
    @Body() body: ShiftReasonDto,
  ): Promise<EventShiftResponse> {
    return this.shifts.cancel(actingUserId(req), eventId, shiftId, body, req.id);
  }

  @Post(":shiftId/reinstate")
  @UseGuards(CsrfGuard)
  @ApiSecurity("csrf-token")
  @RequirePermissions("attendance.schedule.manage")
  @ApiOperation({ summary: "Reinstate a previously cancelled shift" })
  @ApiOkResponse({ type: EventShiftResponse })
  reinstate(
    @Req() req: RequestWithContext,
    @Param("eventId") eventId: string,
    @Param("shiftId") shiftId: string,
    @Body() body: ShiftReasonDto,
  ): Promise<EventShiftResponse> {
    return this.shifts.reinstate(actingUserId(req), eventId, shiftId, body, req.id);
  }

  @Get(":shiftId/changes")
  @RequirePermissions("attendance.schedule.manage")
  @ApiOperation({ summary: "Schedule-change history for a shift" })
  @ApiOkResponse({ type: [EventShiftChangeResponse] })
  listChanges(
    @Req() req: RequestWithContext,
    @Param("eventId") eventId: string,
    @Param("shiftId") shiftId: string,
  ): Promise<EventShiftChangeResponse[]> {
    return this.shifts.listChanges(actingUserId(req), eventId, shiftId);
  }

  @Get(":shiftId/assignments")
  @RequirePermissions("attendance.schedule.manage")
  @ApiOperation({ summary: "List employees currently assigned to a shift" })
  @ApiOkResponse({ type: [EventShiftAssignmentResponse] })
  listAssignments(
    @Req() req: RequestWithContext,
    @Param("eventId") eventId: string,
    @Param("shiftId") shiftId: string,
  ): Promise<EventShiftAssignmentResponse[]> {
    return this.shifts.listAssignments(actingUserId(req), eventId, shiftId);
  }

  @Post(":shiftId/assignments")
  @UseGuards(CsrfGuard)
  @ApiSecurity("csrf-token")
  @RequirePermissions("attendance.schedule.manage")
  @HttpCode(204)
  @ApiOperation({ summary: "Assign an employee to a shift" })
  @ApiNoContentResponse()
  async assign(
    @Req() req: RequestWithContext,
    @Param("eventId") eventId: string,
    @Param("shiftId") shiftId: string,
    @Body() body: AssignEmployeeDto,
  ): Promise<void> {
    await this.shifts.assign(actingUserId(req), eventId, shiftId, body, req.id);
  }

  @Delete(":shiftId/assignments/:employeeId")
  @UseGuards(CsrfGuard)
  @ApiSecurity("csrf-token")
  @RequirePermissions("attendance.schedule.manage")
  @HttpCode(204)
  @ApiOperation({ summary: "Unassign an employee from a shift" })
  @ApiNoContentResponse()
  async unassign(
    @Req() req: RequestWithContext,
    @Param("eventId") eventId: string,
    @Param("shiftId") shiftId: string,
    @Param("employeeId") employeeId: string,
  ): Promise<void> {
    await this.shifts.unassign(actingUserId(req), eventId, shiftId, employeeId, req.id);
  }
}
