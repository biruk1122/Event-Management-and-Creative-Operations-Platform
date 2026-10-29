import { Injectable } from "@nestjs/common";

import { DatabaseService } from "../../../database/database.service.js";
import {
  EventShiftChangeType,
  EventShiftStatus,
  OutboxActorKind,
} from "../../../generated/prisma/client.js";
import { OutboxWriterService } from "../../../outbox/outbox-writer.service.js";
import type {
  AttendanceShiftAssignedEventPayload,
  AttendanceShiftScheduleChangedEventPayload,
} from "../../../outbox/outbox.types.js";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
function isUuid(value: string): boolean {
  return UUID.test(value);
}

export interface EventShiftRecord {
  id: string;
  eventId: string;
  eventName: string;
  eventDepartmentId: string | null;
  label: string | null;
  plannedStartAt: Date;
  plannedEndAt: Date;
  timeZone: string;
  locationLabel: string | null;
  latitude: number;
  longitude: number;
  geofenceRadiusMeters: number;
  breakMinutes: number;
  status: EventShiftStatus;
  createdAt: Date;
}

export interface EventShiftChangeRecord {
  id: string;
  changeType: EventShiftChangeType;
  previousStartAt: Date | null;
  previousEndAt: Date | null;
  newStartAt: Date | null;
  newEndAt: Date | null;
  reason: string;
  changedByName: string | null;
  createdAt: Date;
}

export interface EventShiftAssignmentRecord {
  employeeId: string;
  employeeName: string | null;
  assignedAt: Date;
}

const SHIFT_SELECT = {
  id: true,
  eventId: true,
  label: true,
  plannedStartAt: true,
  plannedEndAt: true,
  timeZone: true,
  locationLabel: true,
  latitude: true,
  longitude: true,
  geofenceRadiusMeters: true,
  breakMinutes: true,
  status: true,
  createdAt: true,
  event: { select: { name: true, departmentId: true } },
} as const;

type RawShift = {
  id: string;
  eventId: string;
  label: string | null;
  plannedStartAt: Date;
  plannedEndAt: Date;
  timeZone: string;
  locationLabel: string | null;
  latitude: { toNumber(): number };
  longitude: { toNumber(): number };
  geofenceRadiusMeters: number;
  breakMinutes: number;
  status: EventShiftStatus;
  createdAt: Date;
  event: { name: string; departmentId: string | null };
};

function toShiftRecord(raw: RawShift): EventShiftRecord {
  return {
    id: raw.id,
    eventId: raw.eventId,
    eventName: raw.event.name,
    eventDepartmentId: raw.event.departmentId,
    label: raw.label,
    plannedStartAt: raw.plannedStartAt,
    plannedEndAt: raw.plannedEndAt,
    timeZone: raw.timeZone,
    locationLabel: raw.locationLabel,
    latitude: raw.latitude.toNumber(),
    longitude: raw.longitude.toNumber(),
    geofenceRadiusMeters: raw.geofenceRadiusMeters,
    breakMinutes: raw.breakMinutes,
    status: raw.status,
    createdAt: raw.createdAt,
  };
}

function personName(
  person: { firstName: string | null; lastName: string | null; email: string } | null,
): string | null {
  if (!person) return null;
  const name = [person.firstName, person.lastName]
    .filter((part): part is string => Boolean(part))
    .join(" ");
  return name.length > 0 ? name : person.email;
}

@Injectable()
export class EventShiftsRepository {
  constructor(
    private readonly db: DatabaseService,
    private readonly outbox: OutboxWriterService,
  ) {}

  async findUserDepartmentId(userId: string): Promise<string | null> {
    if (!isUuid(userId)) return null;
    const user = await this.db.user.findUnique({
      where: { id: userId },
      select: { departmentId: true },
    });
    return user?.departmentId ?? null;
  }

  async findEventContext(
    eventId: string,
  ): Promise<{ id: string; name: string; departmentId: string | null } | null> {
    if (!isUuid(eventId)) return null;
    return this.db.event.findUnique({
      where: { id: eventId },
      select: { id: true, name: true, departmentId: true },
    });
  }

  async create(
    eventId: string,
    input: {
      label?: string;
      plannedStartAt: Date;
      plannedEndAt: Date;
      timeZone: string;
      locationLabel?: string;
      latitude: number;
      longitude: number;
      geofenceRadiusMeters?: number;
      breakMinutes?: number;
      createdById: string;
    },
  ): Promise<EventShiftRecord> {
    const raw = await this.db.eventShift.create({
      data: {
        eventId,
        plannedStartAt: input.plannedStartAt,
        plannedEndAt: input.plannedEndAt,
        timeZone: input.timeZone,
        latitude: input.latitude,
        longitude: input.longitude,
        createdById: input.createdById,
        ...(input.label !== undefined ? { label: input.label } : {}),
        ...(input.locationLabel !== undefined
          ? { locationLabel: input.locationLabel }
          : {}),
        ...(input.geofenceRadiusMeters !== undefined
          ? { geofenceRadiusMeters: input.geofenceRadiusMeters }
          : {}),
        ...(input.breakMinutes !== undefined
          ? { breakMinutes: input.breakMinutes }
          : {}),
      },
      select: SHIFT_SELECT,
    });
    return toShiftRecord(raw);
  }

  async findById(id: string): Promise<EventShiftRecord | null> {
    if (!isUuid(id)) return null;
    const raw = await this.db.eventShift.findUnique({
      where: { id },
      select: SHIFT_SELECT,
    });
    return raw ? toShiftRecord(raw) : null;
  }

  async listByEvent(eventId: string): Promise<EventShiftRecord[]> {
    if (!isUuid(eventId)) return [];
    const rows = await this.db.eventShift.findMany({
      where: { eventId },
      select: SHIFT_SELECT,
      orderBy: { plannedStartAt: "asc" },
    });
    return rows.map(toShiftRecord);
  }

  async updateMetadata(
    id: string,
    patch: {
      label?: string | null;
      locationLabel?: string | null;
      latitude?: number;
      longitude?: number;
      geofenceRadiusMeters?: number;
      breakMinutes?: number;
    },
  ): Promise<EventShiftRecord> {
    const raw = await this.db.eventShift.update({
      where: { id },
      data: {
        ...(patch.label !== undefined ? { label: patch.label } : {}),
        ...(patch.locationLabel !== undefined
          ? { locationLabel: patch.locationLabel }
          : {}),
        ...(patch.latitude !== undefined ? { latitude: patch.latitude } : {}),
        ...(patch.longitude !== undefined ? { longitude: patch.longitude } : {}),
        ...(patch.geofenceRadiusMeters !== undefined
          ? { geofenceRadiusMeters: patch.geofenceRadiusMeters }
          : {}),
        ...(patch.breakMinutes !== undefined
          ? { breakMinutes: patch.breakMinutes }
          : {}),
      },
      select: SHIFT_SELECT,
    });
    return toShiftRecord(raw);
  }

  /**
   * Every time change leaves an append-only `EventShiftChange` row behind
   * instead of overwriting the prior planned times silently - the shift
   * row itself and its history are updated together, in one transaction.
   */
  async reschedule(
    id: string,
    input: {
      plannedStartAt: Date;
      plannedEndAt: Date;
      changeType: EventShiftChangeType;
      previousStartAt: Date;
      previousEndAt: Date;
      reason: string;
      changedById: string;
    },
  ): Promise<EventShiftRecord> {
    return this.db.$transaction(async (tx) => {
      const raw = await tx.eventShift.update({
        where: { id },
        data: { plannedStartAt: input.plannedStartAt, plannedEndAt: input.plannedEndAt },
        select: SHIFT_SELECT,
      });
      await tx.eventShiftChange.create({
        data: {
          eventShiftId: id,
          changeType: input.changeType,
          previousStartAt: input.previousStartAt,
          previousEndAt: input.previousEndAt,
          newStartAt: input.plannedStartAt,
          newEndAt: input.plannedEndAt,
          reason: input.reason,
          changedById: input.changedById,
        },
      });
      await this.outbox.append(tx, {
        name: "attendance.shift.schedule_changed",
        version: 1,
        actorKind: OutboxActorKind.USER,
        actorUserId: input.changedById,
        resourceType: "event_shift",
        resourceId: id,
        payload: {
          changeType: input.changeType,
        } satisfies AttendanceShiftScheduleChangedEventPayload,
        consumers: [{ consumerName: "notifications", consumerVersion: 1 }],
      });
      return toShiftRecord(raw);
    });
  }

  async setStatus(
    id: string,
    input: {
      status: EventShiftStatus;
      changeType: EventShiftChangeType;
      reason: string;
      changedById: string;
    },
  ): Promise<EventShiftRecord> {
    return this.db.$transaction(async (tx) => {
      const raw = await tx.eventShift.update({
        where: { id },
        data: { status: input.status },
        select: SHIFT_SELECT,
      });
      await tx.eventShiftChange.create({
        data: {
          eventShiftId: id,
          changeType: input.changeType,
          reason: input.reason,
          changedById: input.changedById,
        },
      });
      await this.outbox.append(tx, {
        name: "attendance.shift.schedule_changed",
        version: 1,
        actorKind: OutboxActorKind.USER,
        actorUserId: input.changedById,
        resourceType: "event_shift",
        resourceId: id,
        payload: {
          changeType: input.changeType,
        } satisfies AttendanceShiftScheduleChangedEventPayload,
        consumers: [{ consumerName: "notifications", consumerVersion: 1 }],
      });
      return toShiftRecord(raw);
    });
  }

  async listChanges(eventShiftId: string): Promise<EventShiftChangeRecord[]> {
    if (!isUuid(eventShiftId)) return [];
    const rows = await this.db.eventShiftChange.findMany({
      where: { eventShiftId },
      select: {
        id: true,
        changeType: true,
        previousStartAt: true,
        previousEndAt: true,
        newStartAt: true,
        newEndAt: true,
        reason: true,
        createdAt: true,
        changedBy: { select: { firstName: true, lastName: true, email: true } },
      },
      orderBy: { createdAt: "desc" },
    });
    return rows.map((row) => ({
      id: row.id,
      changeType: row.changeType,
      previousStartAt: row.previousStartAt,
      previousEndAt: row.previousEndAt,
      newStartAt: row.newStartAt,
      newEndAt: row.newEndAt,
      reason: row.reason,
      changedByName: personName(row.changedBy),
      createdAt: row.createdAt,
    }));
  }

  /** Upserts against the shift+employee unique pair - re-assigning after a
   * prior unassignment updates that same row rather than colliding with it. */
  async assign(
    eventShiftId: string,
    employeeId: string,
    assignedById: string,
  ): Promise<void> {
    await this.db.eventShiftAssignment.upsert({
      where: { eventShiftId_employeeId: { eventShiftId, employeeId } },
      create: { eventShiftId, employeeId, assignedById },
      update: { assignedAt: new Date(), assignedById, unassignedAt: null, unassignedById: null },
    });
    await this.outbox.record({
      name: "attendance.shift.assigned",
      version: 1,
      actorKind: OutboxActorKind.USER,
      actorUserId: assignedById,
      resourceType: "event_shift",
      resourceId: eventShiftId,
      payload: { employeeId } satisfies AttendanceShiftAssignedEventPayload,
      consumers: [{ consumerName: "notifications", consumerVersion: 1 }],
    });
  }

  async unassign(
    eventShiftId: string,
    employeeId: string,
    unassignedById: string,
  ): Promise<"not_found" | "unassigned"> {
    const result = await this.db.eventShiftAssignment.updateMany({
      where: { eventShiftId, employeeId, unassignedAt: null },
      data: { unassignedAt: new Date(), unassignedById },
    });
    return result.count === 1 ? "unassigned" : "not_found";
  }

  async listAssignments(eventShiftId: string): Promise<EventShiftAssignmentRecord[]> {
    if (!isUuid(eventShiftId)) return [];
    const rows = await this.db.eventShiftAssignment.findMany({
      where: { eventShiftId, unassignedAt: null },
      select: {
        assignedAt: true,
        employee: { select: { id: true, firstName: true, lastName: true, email: true } },
      },
      orderBy: { assignedAt: "asc" },
    });
    return rows.map((row) => ({
      employeeId: row.employee.id,
      employeeName: personName(row.employee),
      assignedAt: row.assignedAt,
    }));
  }

  async isActiveEmployee(userId: string): Promise<boolean> {
    if (!isUuid(userId)) return false;
    const count = await this.db.employeeProfile.count({
      where: { userId, employmentStatus: "ACTIVE" },
    });
    return count === 1;
  }
}
