import { Injectable } from "@nestjs/common";

import { AuditWriterService } from "../../audit/audit-writer.service.js";
import { PermissionsService } from "../../common/security/permissions.service.js";
import { permissionDenied } from "../../common/security/security.errors.js";
import {
  AuditActorKind,
  AuditOutcome,
  EventShiftChangeType,
  EventShiftStatus,
  type PermissionScope,
} from "../../generated/prisma/client.js";
import { LeaveRepository } from "../../leave/infrastructure/leave.repository.js";
import {
  attendanceAssignmentNotFound,
  attendanceEmployeeNotFound,
  attendanceEventNotFound,
  attendanceInvalidSchedule,
  attendanceLeaveConflict,
  attendanceShiftEventMismatch,
  attendanceShiftNotAvailable,
  attendanceShiftNotCancelled,
  attendanceShiftNotFound,
} from "../attendance.errors.js";
import type { AssignEmployeeDto } from "./dto/assign-employee.dto.js";
import type { CreateEventShiftDto } from "./dto/create-event-shift.dto.js";
import type { RescheduleEventShiftDto } from "./dto/reschedule-event-shift.dto.js";
import type { ShiftReasonDto } from "./dto/shift-reason.dto.js";
import type { UpdateEventShiftDto } from "./dto/update-event-shift.dto.js";
import {
  EventShiftAssignmentResponse,
  EventShiftChangeResponse,
  EventShiftResponse,
} from "./eventshifts.contracts.js";
import {
  EventShiftsRepository,
  type EventShiftChangeRecord,
  type EventShiftRecord,
} from "./infrastructure/eventshifts.repository.js";

function toResponse(record: EventShiftRecord): EventShiftResponse {
  return {
    id: record.id,
    eventId: record.eventId,
    eventName: record.eventName,
    label: record.label,
    plannedStartAt: record.plannedStartAt.toISOString(),
    plannedEndAt: record.plannedEndAt.toISOString(),
    timeZone: record.timeZone,
    locationLabel: record.locationLabel,
    latitude: record.latitude,
    longitude: record.longitude,
    geofenceRadiusMeters: record.geofenceRadiusMeters,
    breakMinutes: record.breakMinutes,
    status: record.status,
    createdAt: record.createdAt.toISOString(),
  };
}

function toChangeResponse(
  record: EventShiftChangeRecord,
): EventShiftChangeResponse {
  return {
    id: record.id,
    changeType: record.changeType,
    previousStartAt: record.previousStartAt?.toISOString() ?? null,
    previousEndAt: record.previousEndAt?.toISOString() ?? null,
    newStartAt: record.newStartAt?.toISOString() ?? null,
    newEndAt: record.newEndAt?.toISOString() ?? null,
    reason: record.reason,
    changedByName: record.changedByName,
    createdAt: record.createdAt.toISOString(),
  };
}

/**
 * Event shift scheduling (create/reschedule/cancel/reinstate, employee
 * assignment, and the append-only change history). `attendance.schedule.manage`
 * at DEPARTMENT scope is resolved against the *event's* own department -
 * the established `findUserDepartmentId(actingUserId) === target.departmentId`
 * pattern used throughout the codebase, here applied to the event that owns
 * the shift rather than to an individual employee.
 */
@Injectable()
export class EventShiftsService {
  constructor(
    private readonly repository: EventShiftsRepository,
    private readonly permissions: PermissionsService,
    private readonly leave: LeaveRepository,
    private readonly audit: AuditWriterService,
  ) {}

  private hasGrant(
    actingUserId: string,
    permissionKey: string,
    scope: PermissionScope,
  ): Promise<boolean> {
    return this.permissions.hasGrant(actingUserId, permissionKey, scope);
  }

  private async requireManage(
    actingUserId: string,
    eventDepartmentId: string | null,
  ): Promise<void> {
    if (
      await this.hasGrant(
        actingUserId,
        "attendance.schedule.manage",
        "ORGANIZATION",
      )
    ) {
      return;
    }
    if (
      await this.hasGrant(
        actingUserId,
        "attendance.schedule.manage",
        "DEPARTMENT",
      )
    ) {
      const departmentId =
        await this.repository.findUserDepartmentId(actingUserId);
      if (departmentId && departmentId === eventDepartmentId) return;
    }
    throw permissionDenied();
  }

  private async requireEvent(
    eventId: string,
  ): Promise<{ id: string; name: string; departmentId: string | null }> {
    const event = await this.repository.findEventContext(eventId);
    if (!event) throw attendanceEventNotFound();
    return event;
  }

  /** Loads the shift and confirms it actually belongs to `eventId` - the
   * explicit object-level check that stops a shift id from one event being
   * used to act against a different event's authorization boundary. */
  private async requireShift(
    eventId: string,
    shiftId: string,
  ): Promise<EventShiftRecord> {
    const shift = await this.repository.findById(shiftId);
    if (!shift) throw attendanceShiftNotFound();
    if (shift.eventId !== eventId) throw attendanceShiftEventMismatch();
    return shift;
  }

  async create(
    actingUserId: string,
    eventId: string,
    dto: CreateEventShiftDto,
    requestId: string,
  ): Promise<EventShiftResponse> {
    const event = await this.requireEvent(eventId);
    await this.requireManage(actingUserId, event.departmentId);

    const plannedStartAt = new Date(dto.plannedStartAt);
    const plannedEndAt = new Date(dto.plannedEndAt);
    if (plannedEndAt <= plannedStartAt) {
      throw attendanceInvalidSchedule(
        "plannedEndAt must be after plannedStartAt.",
      );
    }

    const record = await this.repository.create(eventId, {
      plannedStartAt,
      plannedEndAt,
      timeZone: dto.timeZone,
      latitude: dto.latitude,
      longitude: dto.longitude,
      createdById: actingUserId,
      ...(dto.label !== undefined ? { label: dto.label } : {}),
      ...(dto.locationLabel !== undefined
        ? { locationLabel: dto.locationLabel }
        : {}),
      ...(dto.geofenceRadiusMeters !== undefined
        ? { geofenceRadiusMeters: dto.geofenceRadiusMeters }
        : {}),
      ...(dto.breakMinutes !== undefined
        ? { breakMinutes: dto.breakMinutes }
        : {}),
    });
    await this.audit.record({
      action: "attendance.shift.created",
      actorKind: AuditActorKind.USER,
      actorUserId: actingUserId,
      requestId,
      resourceType: "event_shift",
      resourceId: record.id,
      outcome: AuditOutcome.SUCCEEDED,
      metadata: { eventId },
    });
    return toResponse(record);
  }

  async list(
    actingUserId: string,
    eventId: string,
  ): Promise<EventShiftResponse[]> {
    const event = await this.requireEvent(eventId);
    await this.requireManage(actingUserId, event.departmentId);
    const records = await this.repository.listByEvent(eventId);
    return records.map(toResponse);
  }

  async findOne(
    actingUserId: string,
    eventId: string,
    shiftId: string,
  ): Promise<EventShiftResponse> {
    const event = await this.requireEvent(eventId);
    const shift = await this.requireShift(eventId, shiftId);
    await this.requireManage(actingUserId, event.departmentId);
    return toResponse(shift);
  }

  async update(
    actingUserId: string,
    eventId: string,
    shiftId: string,
    dto: UpdateEventShiftDto,
  ): Promise<EventShiftResponse> {
    const event = await this.requireEvent(eventId);
    await this.requireShift(eventId, shiftId);
    await this.requireManage(actingUserId, event.departmentId);

    const record = await this.repository.updateMetadata(shiftId, {
      ...(dto.label !== undefined ? { label: dto.label } : {}),
      ...(dto.locationLabel !== undefined
        ? { locationLabel: dto.locationLabel }
        : {}),
      ...(dto.latitude !== undefined ? { latitude: dto.latitude } : {}),
      ...(dto.longitude !== undefined ? { longitude: dto.longitude } : {}),
      ...(dto.geofenceRadiusMeters !== undefined
        ? { geofenceRadiusMeters: dto.geofenceRadiusMeters }
        : {}),
      ...(dto.breakMinutes !== undefined
        ? { breakMinutes: dto.breakMinutes }
        : {}),
    });
    return toResponse(record);
  }

  async reschedule(
    actingUserId: string,
    eventId: string,
    shiftId: string,
    dto: RescheduleEventShiftDto,
    requestId: string,
  ): Promise<EventShiftResponse> {
    const event = await this.requireEvent(eventId);
    const shift = await this.requireShift(eventId, shiftId);
    await this.requireManage(actingUserId, event.departmentId);

    if (dto.plannedStartAt === undefined && dto.plannedEndAt === undefined) {
      throw attendanceInvalidSchedule(
        "Provide plannedStartAt or plannedEndAt to reschedule.",
      );
    }
    if (
      shift.status === EventShiftStatus.CANCELLED ||
      shift.status === EventShiftStatus.COMPLETED
    ) {
      throw attendanceShiftNotAvailable();
    }

    const newStartAt = dto.plannedStartAt
      ? new Date(dto.plannedStartAt)
      : shift.plannedStartAt;
    const newEndAt = dto.plannedEndAt
      ? new Date(dto.plannedEndAt)
      : shift.plannedEndAt;
    if (newEndAt <= newStartAt) {
      throw attendanceInvalidSchedule(
        "plannedEndAt must be after plannedStartAt.",
      );
    }

    const changeType =
      dto.plannedStartAt !== undefined
        ? EventShiftChangeType.RESCHEDULE
        : newEndAt.getTime() > shift.plannedEndAt.getTime()
          ? EventShiftChangeType.EXTENSION
          : EventShiftChangeType.RESCHEDULE;

    const record = await this.repository.reschedule(shiftId, {
      plannedStartAt: newStartAt,
      plannedEndAt: newEndAt,
      changeType,
      previousStartAt: shift.plannedStartAt,
      previousEndAt: shift.plannedEndAt,
      reason: dto.reason,
      changedById: actingUserId,
    });
    await this.audit.record({
      action: "attendance.shift.rescheduled",
      actorKind: AuditActorKind.USER,
      actorUserId: actingUserId,
      requestId,
      resourceType: "event_shift",
      resourceId: shiftId,
      outcome: AuditOutcome.SUCCEEDED,
      metadata: { changeType, reason: dto.reason },
    });
    return toResponse(record);
  }

  async cancel(
    actingUserId: string,
    eventId: string,
    shiftId: string,
    dto: ShiftReasonDto,
    requestId: string,
  ): Promise<EventShiftResponse> {
    const event = await this.requireEvent(eventId);
    const shift = await this.requireShift(eventId, shiftId);
    await this.requireManage(actingUserId, event.departmentId);

    if (
      shift.status === EventShiftStatus.CANCELLED ||
      shift.status === EventShiftStatus.COMPLETED
    ) {
      throw attendanceShiftNotAvailable();
    }

    const record = await this.repository.setStatus(shiftId, {
      status: EventShiftStatus.CANCELLED,
      changeType: EventShiftChangeType.CANCELLATION,
      reason: dto.reason,
      changedById: actingUserId,
    });
    await this.audit.record({
      action: "attendance.shift.cancelled",
      actorKind: AuditActorKind.USER,
      actorUserId: actingUserId,
      requestId,
      resourceType: "event_shift",
      resourceId: shiftId,
      outcome: AuditOutcome.SUCCEEDED,
      metadata: { reason: dto.reason },
    });
    return toResponse(record);
  }

  async reinstate(
    actingUserId: string,
    eventId: string,
    shiftId: string,
    dto: ShiftReasonDto,
    requestId: string,
  ): Promise<EventShiftResponse> {
    const event = await this.requireEvent(eventId);
    const shift = await this.requireShift(eventId, shiftId);
    await this.requireManage(actingUserId, event.departmentId);

    if (shift.status !== EventShiftStatus.CANCELLED) {
      throw attendanceShiftNotCancelled();
    }

    const record = await this.repository.setStatus(shiftId, {
      status: EventShiftStatus.PLANNED,
      changeType: EventShiftChangeType.REINSTATEMENT,
      reason: dto.reason,
      changedById: actingUserId,
    });
    await this.audit.record({
      action: "attendance.shift.reinstated",
      actorKind: AuditActorKind.USER,
      actorUserId: actingUserId,
      requestId,
      resourceType: "event_shift",
      resourceId: shiftId,
      outcome: AuditOutcome.SUCCEEDED,
      metadata: { reason: dto.reason },
    });
    return toResponse(record);
  }

  async listChanges(
    actingUserId: string,
    eventId: string,
    shiftId: string,
  ): Promise<EventShiftChangeResponse[]> {
    const event = await this.requireEvent(eventId);
    await this.requireShift(eventId, shiftId);
    await this.requireManage(actingUserId, event.departmentId);
    const records = await this.repository.listChanges(shiftId);
    return records.map(toChangeResponse);
  }

  async assign(
    actingUserId: string,
    eventId: string,
    shiftId: string,
    dto: AssignEmployeeDto,
    requestId: string,
  ): Promise<void> {
    const event = await this.requireEvent(eventId);
    const shift = await this.requireShift(eventId, shiftId);
    await this.requireManage(actingUserId, event.departmentId);

    if (!(await this.repository.isActiveEmployee(dto.employeeId))) {
      throw attendanceEmployeeNotFound();
    }
    if (
      await this.leave.hasApprovedLeaveOverlap(
        dto.employeeId,
        shift.plannedStartAt,
        shift.plannedEndAt,
      )
    ) {
      throw attendanceLeaveConflict();
    }
    await this.repository.assign(shiftId, dto.employeeId, actingUserId);
    await this.audit.record({
      action: "attendance.shift.assignment_added",
      actorKind: AuditActorKind.USER,
      actorUserId: actingUserId,
      requestId,
      resourceType: "event_shift",
      resourceId: shiftId,
      outcome: AuditOutcome.SUCCEEDED,
      metadata: { employeeId: dto.employeeId },
    });
  }

  async unassign(
    actingUserId: string,
    eventId: string,
    shiftId: string,
    employeeId: string,
    requestId: string,
  ): Promise<void> {
    const event = await this.requireEvent(eventId);
    await this.requireShift(eventId, shiftId);
    await this.requireManage(actingUserId, event.departmentId);

    const result = await this.repository.unassign(
      shiftId,
      employeeId,
      actingUserId,
    );
    if (result === "not_found") throw attendanceAssignmentNotFound();
    await this.audit.record({
      action: "attendance.shift.assignment_removed",
      actorKind: AuditActorKind.USER,
      actorUserId: actingUserId,
      requestId,
      resourceType: "event_shift",
      resourceId: shiftId,
      outcome: AuditOutcome.SUCCEEDED,
      metadata: { employeeId },
    });
  }

  async listAssignments(
    actingUserId: string,
    eventId: string,
    shiftId: string,
  ): Promise<EventShiftAssignmentResponse[]> {
    const event = await this.requireEvent(eventId);
    await this.requireShift(eventId, shiftId);
    await this.requireManage(actingUserId, event.departmentId);
    const records = await this.repository.listAssignments(shiftId);
    return records.map((record) => ({
      employeeId: record.employeeId,
      employeeName: record.employeeName,
      assignedAt: record.assignedAt.toISOString(),
    }));
  }
}
