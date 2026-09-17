import { Injectable } from "@nestjs/common";

import { CalendarEntryType, Prisma } from "../../generated/prisma/client.js";
import { DatabaseService } from "../../database/database.service.js";

export interface CalendarEntryRecord {
  id: string;
  title: string;
  description: string | null;
  type: CalendarEntryType;
  startAt: Date;
  endAt: Date | null;
  userId: string;
  eventId: string | null;
  taskId: string | null;
  projectId: string | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface ListCalendarEntriesInput {
  userId: string;
  from: Date;
  to: Date;
  type?: CalendarEntryType;
}

export interface CreateCalendarEntryInput {
  userId: string;
  title: string;
  description?: string;
  type: "PERSONAL" | "REMINDER";
  startAt: Date;
  endAt?: Date;
}

export interface UpdateCalendarEntryFields {
  title?: string;
  description?: string | null;
  startAt?: Date;
  endAt?: Date | null;
}

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function isUuid(value: string): boolean {
  return UUID_PATTERN.test(value);
}

const CALENDAR_ENTRY_SELECT = {
  id: true,
  title: true,
  description: true,
  type: true,
  startAt: true,
  endAt: true,
  userId: true,
  eventId: true,
  taskId: true,
  projectId: true,
  createdAt: true,
  updatedAt: true,
} as const;

type RawCalendarEntry = Prisma.CalendarEntryGetPayload<{
  select: typeof CALENDAR_ENTRY_SELECT;
}>;

function toRecord(entry: RawCalendarEntry): CalendarEntryRecord {
  return entry;
}

function updateData(
  fields: UpdateCalendarEntryFields,
): Prisma.CalendarEntryUpdateManyMutationInput {
  const data: Prisma.CalendarEntryUpdateManyMutationInput = {};
  if (fields.title !== undefined) data.title = fields.title;
  if (fields.description !== undefined) data.description = fields.description;
  if (fields.startAt !== undefined) data.startAt = fields.startAt;
  if (fields.endAt !== undefined) data.endAt = fields.endAt;
  return data;
}

/**
 * Persistence boundary for calendar-owned records. Source modules own their
 * event/task/project rows; this repository only reads their existing calendar
 * projections and only mutates PERSONAL and REMINDER rows.
 */
@Injectable()
export class CalendarRepository {
  constructor(private readonly db: DatabaseService) {}

  async list(input: ListCalendarEntriesInput): Promise<CalendarEntryRecord[]> {
    const entries = await this.db.calendarEntry.findMany({
      where: {
        userId: input.userId,
        ...(input.type ? { type: input.type } : {}),
        // An entry that began before the view but has not ended is visible in
        // the view as well. `to` is exclusive, matching the HTTP contract.
        startAt: { lt: input.to },
        OR: [{ endAt: null }, { endAt: { gt: input.from } }],
      },
      select: CALENDAR_ENTRY_SELECT,
      orderBy: [{ startAt: "asc" }, { id: "asc" }],
    });
    return entries.map(toRecord);
  }

  async findOwned(
    id: string,
    userId: string,
  ): Promise<CalendarEntryRecord | null> {
    if (!isUuid(id)) return null;
    const entry = await this.db.calendarEntry.findFirst({
      where: { id, userId },
      select: CALENDAR_ENTRY_SELECT,
    });
    return entry ? toRecord(entry) : null;
  }

  async create(input: CreateCalendarEntryInput): Promise<CalendarEntryRecord> {
    const entry = await this.db.calendarEntry.create({
      data: {
        userId: input.userId,
        createdById: input.userId,
        title: input.title,
        ...(input.description !== undefined
          ? { description: input.description }
          : {}),
        type: input.type,
        startAt: input.startAt,
        ...(input.endAt !== undefined ? { endAt: input.endAt } : {}),
      },
      select: CALENDAR_ENTRY_SELECT,
    });
    return toRecord(entry);
  }

  async updateOwnedMutable(
    id: string,
    userId: string,
    fields: UpdateCalendarEntryFields,
  ): Promise<CalendarEntryRecord | null> {
    if (!isUuid(id)) return null;
    const result = await this.db.calendarEntry.updateMany({
      where: {
        id,
        userId,
        type: { in: [CalendarEntryType.PERSONAL, CalendarEntryType.REMINDER] },
      },
      data: updateData(fields),
    });
    if (result.count === 0) return null;
    return this.findOwned(id, userId);
  }

  async deleteOwnedMutable(id: string, userId: string): Promise<boolean> {
    if (!isUuid(id)) return false;
    const result = await this.db.calendarEntry.deleteMany({
      where: {
        id,
        userId,
        type: { in: [CalendarEntryType.PERSONAL, CalendarEntryType.REMINDER] },
      },
    });
    return result.count === 1;
  }
}
