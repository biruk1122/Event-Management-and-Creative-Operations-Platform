import { Injectable } from "@nestjs/common";

import {
  Prisma,
  WorkspaceKind,
  type ProjectStatus,
} from "../../generated/prisma/client.js";
import { DatabaseService } from "../../database/database.service.js";

export interface ProjectPersonRecord {
  id: string;
  email: string;
  firstName: string | null;
  lastName: string | null;
}

export interface ProjectTeamRecord {
  id: string;
  name: string;
}

/**
 * The project's own columns plus the composition of its connected workspace
 * read through the 1:1 relation - the manager, assigned teams, and assigned
 * participants that WSP-01 anchors on the workspace.
 */
export interface ProjectRecord {
  id: string;
  workspaceId: string;
  name: string;
  description: string | null;
  status: ProjectStatus;
  startAt: Date | null;
  endAt: Date | null;
  eventId: string | null;
  manager: ProjectPersonRecord | null;
  teams: ProjectTeamRecord[];
  participants: ProjectPersonRecord[];
  createdBy: ProjectPersonRecord | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface ListProjectsInput {
  status?: ProjectStatus;
  eventId?: string;
  managerId?: string;
  search?: string;
  startingAfter?: Date;
  startingBefore?: Date;
  page: number;
  pageSize: number;
}

export interface CreateProjectInput {
  name: string;
  description?: string;
  startAt?: Date;
  endAt?: Date;
  eventId?: string;
  managerId?: string;
  createdById: string;
}

export interface UpdateProjectFields {
  name?: string;
  description?: string | null;
  startAt?: Date | null;
  endAt?: Date | null;
  eventId?: string | null;
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

const PROJECT_SELECT = {
  id: true,
  workspaceId: true,
  name: true,
  description: true,
  status: true,
  startAt: true,
  endAt: true,
  eventId: true,
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

type RawProject = Prisma.ProjectGetPayload<{ select: typeof PROJECT_SELECT }>;

function byName(a: ProjectTeamRecord, b: ProjectTeamRecord): number {
  return a.name.localeCompare(b.name);
}

function byPerson(a: ProjectPersonRecord, b: ProjectPersonRecord): number {
  return (
    (a.lastName ?? "").localeCompare(b.lastName ?? "") ||
    (a.firstName ?? "").localeCompare(b.firstName ?? "") ||
    a.email.localeCompare(b.email)
  );
}

function toRecord(raw: RawProject): ProjectRecord {
  return {
    id: raw.id,
    workspaceId: raw.workspaceId,
    name: raw.name,
    description: raw.description,
    status: raw.status,
    startAt: raw.startAt,
    endAt: raw.endAt,
    eventId: raw.eventId,
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
function updateData(fields: UpdateProjectFields): Prisma.ProjectUpdateInput {
  const data: Prisma.ProjectUpdateInput = {};
  if (fields.name !== undefined) data.name = fields.name;
  if (fields.description !== undefined) data.description = fields.description;
  if (fields.startAt !== undefined) data.startAt = fields.startAt;
  if (fields.endAt !== undefined) data.endAt = fields.endAt;
  if (fields.eventId !== undefined) {
    data.event = fields.eventId
      ? { connect: { id: fields.eventId } }
      : { disconnect: true };
  }
  return data;
}

@Injectable()
export class ProjectsRepository {
  constructor(private readonly db: DatabaseService) {}

  async list(
    input: ListProjectsInput,
  ): Promise<{ items: ProjectRecord[]; total: number }> {
    const startAt =
      input.startingAfter || input.startingBefore
        ? {
            ...(input.startingAfter ? { gte: input.startingAfter } : {}),
            ...(input.startingBefore ? { lte: input.startingBefore } : {}),
          }
        : undefined;

    const where: Prisma.ProjectWhereInput = {
      ...(input.status ? { status: input.status } : {}),
      ...(input.eventId ? { eventId: input.eventId } : {}),
      ...(input.managerId ? { workspace: { managerId: input.managerId } } : {}),
      ...(input.search
        ? { name: { contains: input.search, mode: "insensitive" } }
        : {}),
      ...(startAt ? { startAt } : {}),
    };

    const [items, total] = await Promise.all([
      this.db.project.findMany({
        where,
        select: PROJECT_SELECT,
        // `id` (uuidv7) is the tiebreaker so pagination stays deterministic
        // when two projects share a `created_at` value.
        orderBy: [{ createdAt: "asc" }, { id: "asc" }],
        skip: (input.page - 1) * input.pageSize,
        take: input.pageSize,
      }),
      this.db.project.count({ where }),
    ]);

    return { items: items.map(toRecord), total };
  }

  async findById(id: string): Promise<ProjectRecord | null> {
    if (!isUuid(id)) {
      return null;
    }
    const raw = await this.db.project.findUnique({
      where: { id },
      select: PROJECT_SELECT,
    });
    return raw ? toRecord(raw) : null;
  }

  private async eventExists(id: string): Promise<boolean> {
    if (!isUuid(id)) {
      return false;
    }
    const event = await this.db.event.findUnique({
      where: { id },
      select: { id: true },
    });
    return event !== null;
  }

  /**
   * Creates the connected workspace (`kind = PROJECT`) and the project
   * together in one transaction - the pairing PRJ-01 assigned to this slice.
   * The optional `eventId` is resolved before the transaction, rather than
   * caught from the transaction's own foreign-key violation, because the
   * workspace's `managerId` FK and the project's `eventId` FK could otherwise
   * both fail in the same statement with no reliable way to tell them apart.
   */
  async create(
    input: CreateProjectInput,
  ): Promise<ProjectRecord | "manager_not_found" | "event_not_found"> {
    if (input.eventId && !(await this.eventExists(input.eventId))) {
      return "event_not_found";
    }
    try {
      return await this.db.$transaction(async (tx) => {
        const workspace = await tx.workspace.create({
          data: {
            kind: WorkspaceKind.PROJECT,
            ...(input.managerId ? { managerId: input.managerId } : {}),
          },
          select: { id: true },
        });
        const project = await tx.project.create({
          data: {
            workspaceId: workspace.id,
            name: input.name,
            createdById: input.createdById,
            ...(input.description !== undefined
              ? { description: input.description }
              : {}),
            ...(input.startAt !== undefined ? { startAt: input.startAt } : {}),
            ...(input.endAt !== undefined ? { endAt: input.endAt } : {}),
            ...(input.eventId ? { eventId: input.eventId } : {}),
          },
          select: PROJECT_SELECT,
        });
        return toRecord(project);
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
    fields: UpdateProjectFields,
  ): Promise<ProjectRecord | "not_found" | "event_not_found"> {
    if (!isUuid(id)) {
      return "not_found";
    }
    if (
      fields.eventId !== undefined &&
      fields.eventId !== null &&
      !(await this.eventExists(fields.eventId))
    ) {
      return "event_not_found";
    }
    try {
      const updated = await this.db.project.update({
        where: { id },
        data: updateData(fields),
        select: PROJECT_SELECT,
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
    expectedStatus: ProjectStatus,
    status: ProjectStatus,
  ): Promise<ProjectRecord | "not_found" | "status_changed"> {
    if (!isUuid(id)) {
      return "not_found";
    }
    const { count } = await this.db.project.updateMany({
      where: { id, status: expectedStatus },
      data: { status },
    });
    const record = await this.findById(id);
    if (!record) {
      return "not_found";
    }
    return count === 0 ? "status_changed" : record;
  }

  /**
   * Removes the project and then its connected workspace in one transaction.
   * The workspace FK is `ON DELETE RESTRICT`, so the project must go first;
   * an attached managed file also `RESTRICT`s the workspace delete, reported
   * as `"has_managed_files"` (the same accounting `EventsRepository` does).
   */
  async delete(
    id: string,
  ): Promise<"deleted" | "not_found" | "has_managed_files"> {
    if (!isUuid(id)) {
      return "not_found";
    }
    try {
      return await this.db.$transaction(async (tx) => {
        const project = await tx.project.findUnique({
          where: { id },
          select: { workspaceId: true },
        });
        if (!project) return "not_found";
        // A detached/rejected file remains for retention cleanup, but no
        // longer needs to retain a project workspace that is being removed.
        await tx.managedFile.updateMany({
          where: {
            intentWorkspaceId: project.workspaceId,
            state: "UNAVAILABLE",
          },
          data: { intentWorkspaceId: null },
        });
        await tx.project.delete({ where: { id } });
        await tx.workspace.delete({ where: { id: project.workspaceId } });
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
