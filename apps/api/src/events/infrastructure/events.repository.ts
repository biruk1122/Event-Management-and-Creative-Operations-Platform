import { Injectable } from "@nestjs/common";

import {
  Prisma,
  WorkspaceKind,
  type EventStatus,
  type EventType,
} from "../../generated/prisma/client.js";
import { DatabaseService } from "../../database/database.service.js";

export interface EventPersonRecord {
  id: string;
  email: string;
  firstName: string | null;
  lastName: string | null;
}

export interface EventTeamRecord {
  id: string;
  name: string;
}

/**
 * The event's own columns plus the composition of its connected workspace read
 * through the 1:1 relation - the manager, assigned teams, and assigned
 * participants that WSP-01 anchors on the workspace. `budgetAmount` /
 * `budgetCurrency` are carried so the service can serve them through the
 * sensitive budget routes only.
 */
export interface EventRecord {
  id: string;
  workspaceId: string;
  name: string;
  eventType: EventType;
  description: string | null;
  status: EventStatus;
  startAt: Date | null;
  endAt: Date | null;
  location: string | null;
  organizerName: string | null;
  budgetAmount: string | null;
  budgetCurrency: string | null;
  manager: EventPersonRecord | null;
  teams: EventTeamRecord[];
  participants: EventPersonRecord[];
  createdBy: EventPersonRecord | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface ListEventsInput {
  status?: EventStatus;
  eventType?: EventType;
  managerId?: string;
  search?: string;
  startingAfter?: Date;
  startingBefore?: Date;
  page: number;
  pageSize: number;
}

export interface CreateEventInput {
  name: string;
  eventType: EventType;
  description?: string;
  startAt?: Date;
  endAt?: Date;
  location?: string;
  organizerName?: string;
  managerId?: string;
  createdById: string;
}

export interface UpdateEventFields {
  name?: string;
  eventType?: EventType;
  description?: string | null;
  startAt?: Date | null;
  endAt?: Date | null;
  location?: string | null;
  organizerName?: string | null;
}

const PRISMA_ERROR = {
  uniqueViolation: "P2002",
  foreignKeyViolation: "P2003",
  recordNotFound: "P2025",
} as const;

function isPrismaError(error: unknown, code: string): boolean {
  return (
    error instanceof Prisma.PrismaClientKnownRequestError && error.code === code
  );
}

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * The `:id` path segment arrives as a raw string. A value that is not a UUID
 * cannot match any row, and handing it to a `@db.Uuid` column makes the driver
 * raise `22P02`, which would surface as a 500. Treating it as "no such row"
 * keeps those routes returning a clean not-found.
 */
function isUuid(value: string): boolean {
  return UUID_PATTERN.test(value);
}

const PERSON_SELECT = {
  id: true,
  email: true,
  firstName: true,
  lastName: true,
} as const;

const EVENT_SELECT = {
  id: true,
  workspaceId: true,
  name: true,
  eventType: true,
  description: true,
  status: true,
  startAt: true,
  endAt: true,
  location: true,
  organizerName: true,
  budgetAmount: true,
  budgetCurrency: true,
  createdBy: { select: PERSON_SELECT },
  createdAt: true,
  updatedAt: true,
  workspace: {
    select: {
      manager: { select: PERSON_SELECT },
      teams: { select: { team: { select: { id: true, name: true } } } },
      participants: { select: { user: { select: PERSON_SELECT } } },
    },
  },
} as const;

type RawEvent = Prisma.EventGetPayload<{ select: typeof EVENT_SELECT }>;

function byName(a: EventTeamRecord, b: EventTeamRecord): number {
  return a.name.localeCompare(b.name);
}

function byPerson(a: EventPersonRecord, b: EventPersonRecord): number {
  return (
    (a.lastName ?? "").localeCompare(b.lastName ?? "") ||
    (a.firstName ?? "").localeCompare(b.firstName ?? "") ||
    a.email.localeCompare(b.email)
  );
}

function toRecord(raw: RawEvent): EventRecord {
  return {
    id: raw.id,
    workspaceId: raw.workspaceId,
    name: raw.name,
    eventType: raw.eventType,
    description: raw.description,
    status: raw.status,
    startAt: raw.startAt,
    endAt: raw.endAt,
    location: raw.location,
    organizerName: raw.organizerName,
    budgetAmount:
      raw.budgetAmount === null ? null : raw.budgetAmount.toFixed(2),
    // A `@db.Char(3)` reads back space-padded; the CHECK guarantees three
    // letters, so trimming is safe and keeps the contract clean.
    budgetCurrency:
      raw.budgetCurrency === null ? null : raw.budgetCurrency.trim(),
    manager: raw.workspace.manager ?? null,
    teams: raw.workspace.teams
      .map((assignment) => assignment.team)
      .sort(byName),
    participants: raw.workspace.participants
      .map((participation) => participation.user)
      .sort(byPerson),
    createdBy: raw.createdBy ?? null,
    createdAt: raw.createdAt,
    updatedAt: raw.updatedAt,
  };
}

/** Only the keys the caller actually set, so a patch never nulls a field by omission. */
function updateData(fields: UpdateEventFields): Prisma.EventUpdateInput {
  const data: Prisma.EventUpdateInput = {};
  if (fields.name !== undefined) data.name = fields.name;
  if (fields.eventType !== undefined) data.eventType = fields.eventType;
  if (fields.description !== undefined) data.description = fields.description;
  if (fields.startAt !== undefined) data.startAt = fields.startAt;
  if (fields.endAt !== undefined) data.endAt = fields.endAt;
  if (fields.location !== undefined) data.location = fields.location;
  if (fields.organizerName !== undefined) {
    data.organizerName = fields.organizerName;
  }
  return data;
}

@Injectable()
export class EventsRepository {
  constructor(private readonly db: DatabaseService) {}

  async list(
    input: ListEventsInput,
  ): Promise<{ items: EventRecord[]; total: number }> {
    const startAt =
      input.startingAfter || input.startingBefore
        ? {
            ...(input.startingAfter ? { gte: input.startingAfter } : {}),
            ...(input.startingBefore ? { lte: input.startingBefore } : {}),
          }
        : undefined;

    const where: Prisma.EventWhereInput = {
      ...(input.status ? { status: input.status } : {}),
      ...(input.eventType ? { eventType: input.eventType } : {}),
      ...(input.managerId ? { workspace: { managerId: input.managerId } } : {}),
      ...(input.search
        ? { name: { contains: input.search, mode: "insensitive" } }
        : {}),
      ...(startAt ? { startAt } : {}),
    };

    const [items, total] = await Promise.all([
      this.db.event.findMany({
        where,
        select: EVENT_SELECT,
        // `id` (uuidv7) is the tiebreaker so pagination stays deterministic
        // when two events share a `created_at` value.
        orderBy: [{ createdAt: "asc" }, { id: "asc" }],
        skip: (input.page - 1) * input.pageSize,
        take: input.pageSize,
      }),
      this.db.event.count({ where }),
    ]);

    return { items: items.map(toRecord), total };
  }

  async findById(id: string): Promise<EventRecord | null> {
    if (!isUuid(id)) {
      return null;
    }
    const raw = await this.db.event.findUnique({
      where: { id },
      select: EVENT_SELECT,
    });
    return raw ? toRecord(raw) : null;
  }

  /**
   * Creates the connected workspace (`kind = EVENT`) and the event together in
   * one transaction - the pairing EVT-01 assigned to this slice. Returns the
   * created record, or `"manager_not_found"` when the optional manager id has no
   * user.
   */
  async create(
    input: CreateEventInput,
  ): Promise<EventRecord | "manager_not_found"> {
    try {
      return await this.db.$transaction(async (tx) => {
        const workspace = await tx.workspace.create({
          data: {
            kind: WorkspaceKind.EVENT,
            ...(input.managerId ? { managerId: input.managerId } : {}),
          },
          select: { id: true },
        });
        const event = await tx.event.create({
          data: {
            workspaceId: workspace.id,
            name: input.name,
            eventType: input.eventType,
            createdById: input.createdById,
            ...(input.description !== undefined
              ? { description: input.description }
              : {}),
            ...(input.startAt !== undefined ? { startAt: input.startAt } : {}),
            ...(input.endAt !== undefined ? { endAt: input.endAt } : {}),
            ...(input.location !== undefined
              ? { location: input.location }
              : {}),
            ...(input.organizerName !== undefined
              ? { organizerName: input.organizerName }
              : {}),
          },
          select: EVENT_SELECT,
        });
        return toRecord(event);
      });
    } catch (error) {
      if (isPrismaError(error, PRISMA_ERROR.foreignKeyViolation)) {
        return "manager_not_found";
      }
      throw error;
    }
  }

  async update(
    id: string,
    fields: UpdateEventFields,
  ): Promise<EventRecord | "not_found"> {
    if (!isUuid(id)) {
      return "not_found";
    }
    try {
      const updated = await this.db.event.update({
        where: { id },
        data: updateData(fields),
        select: EVENT_SELECT,
      });
      return toRecord(updated);
    } catch (error) {
      if (isPrismaError(error, PRISMA_ERROR.recordNotFound)) {
        return "not_found";
      }
      throw error;
    }
  }

  /**
   * A compare-and-swap: the write only applies when the row's status still
   * matches `expectedStatus` (the status the caller validated the move
   * against). Two concurrent transitions read the same stale status and
   * would otherwise both pass validation and both write, so an unconditional
   * update lets the later write silently win - including reopening a
   * terminal (Completed/Cancelled) record. `"status_changed"` tells the
   * caller its check is stale so it can re-validate against the status the
   * row now actually has.
   */
  async updateStatus(
    id: string,
    expectedStatus: EventStatus,
    status: EventStatus,
  ): Promise<EventRecord | "not_found" | "status_changed"> {
    if (!isUuid(id)) {
      return "not_found";
    }
    const { count } = await this.db.event.updateMany({
      where: { id, status: expectedStatus },
      data: { status },
    });
    const record = await this.findById(id);
    if (!record) {
      return "not_found";
    }
    return count === 0 ? "status_changed" : record;
  }

  async setBudget(
    id: string,
    amount: string | null,
    currency: string | null,
  ): Promise<EventRecord | "not_found"> {
    if (!isUuid(id)) {
      return "not_found";
    }
    try {
      const updated = await this.db.event.update({
        where: { id },
        data: { budgetAmount: amount, budgetCurrency: currency },
        select: EVENT_SELECT,
      });
      return toRecord(updated);
    } catch (error) {
      if (isPrismaError(error, PRISMA_ERROR.recordNotFound)) {
        return "not_found";
      }
      throw error;
    }
  }

  /**
   * Removes the event and then its connected workspace in one transaction. The
   * workspace FK is `ON DELETE RESTRICT`, so the event must go first.
   */
  async delete(
    id: string,
  ): Promise<"deleted" | "not_found" | "has_managed_files"> {
    if (!isUuid(id)) {
      return "not_found";
    }
    try {
      return await this.db.$transaction(async (tx) => {
        const event = await tx.event.findUnique({
          where: { id },
          select: { workspaceId: true },
        });
        if (!event) return "not_found";
        // A detached/rejected file remains for retention cleanup, but no
        // longer needs to retain an event workspace that is being removed.
        await tx.managedFile.updateMany({
          where: {
            intentWorkspaceId: event.workspaceId,
            state: "UNAVAILABLE",
          },
          data: { intentWorkspaceId: null },
        });
        await tx.event.delete({ where: { id } });
        await tx.workspace.delete({ where: { id: event.workspaceId } });
        return "deleted";
      });
    } catch (error) {
      if (isPrismaError(error, PRISMA_ERROR.recordNotFound)) {
        return "not_found";
      }
      if (isPrismaError(error, PRISMA_ERROR.foreignKeyViolation)) {
        return "has_managed_files";
      }
      throw error;
    }
  }
}
