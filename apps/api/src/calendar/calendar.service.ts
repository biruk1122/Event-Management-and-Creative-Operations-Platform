import { Injectable } from "@nestjs/common";

import {
  CalendarEntryType,
  type PermissionScope,
} from "../generated/prisma/client.js";
import { permissionDenied } from "../common/security/security.errors.js";
import { PermissionsService } from "../common/security/permissions.service.js";
import type {
  CalendarEntryResponse,
  CalendarFeedResponse,
} from "./calendar.contracts.js";
import {
  calendarEntryNotFound,
  calendarRangeInvalid,
  calendarScheduleInvalid,
} from "./calendar.errors.js";
import type { CreateCalendarEntryDto } from "./dto/create-calendar-entry.dto.js";
import type { ListCalendarQueryDto } from "./dto/list-calendar-query.dto.js";
import type { UpdateCalendarEntryDto } from "./dto/update-calendar-entry.dto.js";
import {
  CalendarRepository,
  type CalendarEntryRecord,
} from "./infrastructure/calendar.repository.js";

const MAXIMUM_RANGE_MILLISECONDS = 90 * 24 * 60 * 60 * 1000;

@Injectable()
export class CalendarService {
  constructor(
    private readonly repository: CalendarRepository,
    private readonly permissions: PermissionsService,
  ) {}

  private async requireGrant(
    actingUserId: string,
    permissionKey: string,
    scope: PermissionScope = "SELF",
  ): Promise<void> {
    if (
      !(await this.permissions.hasGrant(actingUserId, permissionKey, scope))
    ) {
      throw permissionDenied();
    }
  }

  async list(
    actingUserId: string,
    query: ListCalendarQueryDto,
  ): Promise<CalendarFeedResponse> {
    await this.requireGrant(actingUserId, "calendar.read");
    const from = new Date(query.from);
    const to = new Date(query.to);
    assertRange(from, to);
    const items = await this.repository.list({
      userId: actingUserId,
      from,
      to,
      ...(query.type ? { type: query.type } : {}),
    });
    return { items: items.map(toCalendarEntryResponse) };
  }

  async get(actingUserId: string, id: string): Promise<CalendarEntryResponse> {
    await this.requireGrant(actingUserId, "calendar.read");
    const entry = await this.repository.findOwned(id, actingUserId);
    if (!entry) throw calendarEntryNotFound();
    return toCalendarEntryResponse(entry);
  }

  async create(
    actingUserId: string,
    dto: CreateCalendarEntryDto,
  ): Promise<CalendarEntryResponse> {
    await this.requireGrant(actingUserId, "calendar.create");
    const startAt = new Date(dto.startAt);
    const endAt = dto.endAt === undefined ? undefined : new Date(dto.endAt);
    assertScheduleOrdered(startAt, endAt ?? null);
    const entry = await this.repository.create({
      userId: actingUserId,
      title: dto.title.trim(),
      ...(dto.description !== undefined
        ? { description: dto.description.trim() }
        : {}),
      type:
        dto.type === "PERSONAL"
          ? CalendarEntryType.PERSONAL
          : CalendarEntryType.REMINDER,
      startAt,
      ...(endAt ? { endAt } : {}),
    });
    return toCalendarEntryResponse(entry);
  }

  async update(
    actingUserId: string,
    id: string,
    dto: UpdateCalendarEntryDto,
  ): Promise<CalendarEntryResponse> {
    await this.requireGrant(actingUserId, "calendar.update");
    const current = await this.repository.findOwned(id, actingUserId);
    if (!current || !isMutable(current)) throw calendarEntryNotFound();
    const nextStartAt =
      dto.startAt === undefined ? current.startAt : new Date(dto.startAt);
    const nextEndAt =
      dto.endAt === undefined
        ? current.endAt
        : dto.endAt === null
          ? null
          : new Date(dto.endAt);
    assertScheduleOrdered(nextStartAt, nextEndAt);
    const entry = await this.repository.updateOwnedMutable(id, actingUserId, {
      ...(dto.title !== undefined ? { title: dto.title.trim() } : {}),
      ...(dto.description !== undefined
        ? {
            description:
              dto.description === null ? null : dto.description.trim(),
          }
        : {}),
      ...(dto.startAt !== undefined ? { startAt: nextStartAt } : {}),
      ...(dto.endAt !== undefined ? { endAt: nextEndAt } : {}),
    });
    if (!entry) throw calendarEntryNotFound();
    return toCalendarEntryResponse(entry);
  }

  async remove(actingUserId: string, id: string): Promise<void> {
    await this.requireGrant(actingUserId, "calendar.delete");
    if (!(await this.repository.deleteOwnedMutable(id, actingUserId))) {
      throw calendarEntryNotFound();
    }
  }
}

function assertRange(from: Date, to: Date): void {
  const duration = to.getTime() - from.getTime();
  if (
    !Number.isFinite(duration) ||
    duration <= 0 ||
    duration > MAXIMUM_RANGE_MILLISECONDS
  ) {
    throw calendarRangeInvalid();
  }
}

function assertScheduleOrdered(startAt: Date, endAt: Date | null): void {
  if (endAt && endAt.getTime() < startAt.getTime()) {
    throw calendarScheduleInvalid();
  }
}

function isMutable(entry: CalendarEntryRecord): boolean {
  return (
    entry.type === CalendarEntryType.PERSONAL ||
    entry.type === CalendarEntryType.REMINDER
  );
}

function toCalendarEntryResponse(
  entry: CalendarEntryRecord,
): CalendarEntryResponse {
  return {
    id: entry.id,
    title: entry.title,
    description: entry.description,
    type: entry.type,
    startAt: entry.startAt.toISOString(),
    endAt: entry.endAt?.toISOString() ?? null,
    eventId: entry.eventId,
    taskId: entry.taskId,
    projectId: entry.projectId,
    meetingId: entry.meetingId,
    createdAt: entry.createdAt.toISOString(),
    updatedAt: entry.updatedAt.toISOString(),
  };
}
