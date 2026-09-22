import { Injectable } from "@nestjs/common";

import { Prisma, WorkspaceKind } from "../../generated/prisma/client.js";
import { DatabaseService } from "../../database/database.service.js";

export interface WorkspaceUserRecord {
  id: string;
  email: string;
  firstName: string | null;
  lastName: string | null;
}

export interface WorkspaceTeamRecord {
  id: string;
  name: string;
}

export interface WorkspaceRecord {
  id: string;
  kind: WorkspaceKind;
  manager: WorkspaceUserRecord | null;
  teams: WorkspaceTeamRecord[];
  participants: WorkspaceUserRecord[];
  createdAt: Date;
  updatedAt: Date;
}

export interface ListWorkspacesInput {
  kind: WorkspaceKind;
  managerId?: string;
  page: number;
  pageSize: number;
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
 * The `:id`, `:teamId`, and `:userId` path segments arrive as raw strings. A
 * value that is not a UUID cannot match any row, and handing it to a `@db.Uuid`
 * column makes the driver raise `22P02`, which would surface as a 500. Treating
 * it as "no such row" keeps those routes returning a clean not-found.
 */
function isUuid(value: string): boolean {
  return UUID_PATTERN.test(value);
}

const USER_SELECT = {
  id: true,
  email: true,
  firstName: true,
  lastName: true,
} as const;

const WORKSPACE_SELECT = {
  id: true,
  kind: true,
  createdAt: true,
  updatedAt: true,
  manager: { select: USER_SELECT },
  teams: { select: { team: { select: { id: true, name: true } } } },
  participants: { select: { user: { select: USER_SELECT } } },
} as const;

type RawWorkspace = Prisma.WorkspaceGetPayload<{
  select: typeof WORKSPACE_SELECT;
}>;

/** Ordered here, not in the query, so `WORKSPACE_SELECT` stays a literal that
 * Prisma's payload types read directly. */
function byPerson(a: WorkspaceUserRecord, b: WorkspaceUserRecord): number {
  return (
    (a.lastName ?? "").localeCompare(b.lastName ?? "") ||
    (a.firstName ?? "").localeCompare(b.firstName ?? "") ||
    a.email.localeCompare(b.email)
  );
}

function byName(a: WorkspaceTeamRecord, b: WorkspaceTeamRecord): number {
  return a.name.localeCompare(b.name);
}

function toRecord(raw: RawWorkspace): WorkspaceRecord {
  return {
    id: raw.id,
    kind: raw.kind,
    manager: raw.manager ?? null,
    teams: raw.teams.map((assignment) => assignment.team).sort(byName),
    participants: raw.participants
      .map((participation) => participation.user)
      .sort(byPerson),
    createdAt: raw.createdAt,
    updatedAt: raw.updatedAt,
  };
}

@Injectable()
export class WorkspacesRepository {
  constructor(private readonly db: DatabaseService) {}

  async list(
    input: ListWorkspacesInput,
  ): Promise<{ items: WorkspaceRecord[]; total: number }> {
    const where: Prisma.WorkspaceWhereInput = {
      kind: input.kind,
      ...(input.managerId ? { managerId: input.managerId } : {}),
    };

    const [items, total] = await Promise.all([
      this.db.workspace.findMany({
        where,
        select: WORKSPACE_SELECT,
        // `id` (uuidv7) is the tiebreaker so pagination stays deterministic
        // when two workspaces share a `created_at` value.
        orderBy: [{ createdAt: "asc" }, { id: "asc" }],
        skip: (input.page - 1) * input.pageSize,
        take: input.pageSize,
      }),
      this.db.workspace.count({ where }),
    ]);

    return { items: items.map(toRecord), total };
  }

  async findById(id: string): Promise<WorkspaceRecord | null> {
    if (!isUuid(id)) {
      return null;
    }
    const raw = await this.db.workspace.findUnique({
      where: { id },
      select: WORKSPACE_SELECT,
    });
    return raw ? toRecord(raw) : null;
  }

  async userExists(id: string): Promise<boolean> {
    if (!isUuid(id)) {
      return false;
    }
    const user = await this.db.user.findUnique({
      where: { id },
      select: { id: true },
    });
    return user !== null;
  }

  /**
   * Returns the created record, or `"manager_not_found"`. The only foreign key
   * that can fail here is the optional manager.
   */
  async create(input: {
    kind: WorkspaceKind;
    managerId: string | null;
  }): Promise<WorkspaceRecord | "manager_not_found"> {
    try {
      const created = await this.db.workspace.create({
        data: { kind: input.kind, managerId: input.managerId },
        select: WORKSPACE_SELECT,
      });
      return toRecord(created);
    } catch (error) {
      if (isPrismaError(error, PRISMA_ERROR.foreignKeyViolation)) {
        return "manager_not_found";
      }
      throw error;
    }
  }

  /** Returns the updated record, or `"not_found"` / `"manager_not_found"`. */
  async setManager(
    id: string,
    managerId: string | null,
  ): Promise<WorkspaceRecord | "not_found" | "manager_not_found"> {
    try {
      const updated = await this.db.workspace.update({
        where: { id },
        data: { managerId },
        select: WORKSPACE_SELECT,
      });
      return toRecord(updated);
    } catch (error) {
      if (isPrismaError(error, PRISMA_ERROR.recordNotFound)) {
        return "not_found";
      }
      if (isPrismaError(error, PRISMA_ERROR.foreignKeyViolation)) {
        return "manager_not_found";
      }
      throw error;
    }
  }

  /**
   * Removes the root. Its team and participant rows cascade, but an event,
   * project, campaign, task, meeting, or conversation may still reference
   * this workspace through an `ON DELETE RESTRICT` foreign key - deleting
   * those happens through their own routes, not this one, so a restrict
   * violation here is reported as `"in_use"` rather than left to surface as
   * an unhandled database error.
   */
  async delete(id: string): Promise<"not_found" | "deleted" | "in_use"> {
    try {
      await this.db.workspace.delete({ where: { id } });
      return "deleted";
    } catch (error) {
      if (isPrismaError(error, PRISMA_ERROR.recordNotFound)) {
        return "not_found";
      }
      if (isPrismaError(error, PRISMA_ERROR.foreignKeyViolation)) {
        return "in_use";
      }
      throw error;
    }
  }

  /**
   * Assigns the team. Idempotent: re-assigning is a no-op. Returns the
   * workspace's refreshed record, or `"workspace_not_found"` /
   * `"team_not_found"`.
   */
  async assignTeam(
    workspaceId: string,
    teamId: string,
  ): Promise<WorkspaceRecord | "workspace_not_found" | "team_not_found"> {
    const workspace = await this.findById(workspaceId);
    if (!workspace) {
      return "workspace_not_found";
    }
    if (!isUuid(teamId)) {
      return "team_not_found";
    }
    try {
      await this.db.workspaceTeam.create({ data: { workspaceId, teamId } });
    } catch (error) {
      if (isPrismaError(error, PRISMA_ERROR.uniqueViolation)) {
        return (await this.findById(workspaceId))!;
      }
      if (isPrismaError(error, PRISMA_ERROR.foreignKeyViolation)) {
        return "team_not_found";
      }
      throw error;
    }
    return (await this.findById(workspaceId))!;
  }

  /**
   * Unassigns the team, only if it is currently assigned. Returns the refreshed
   * record, or `"workspace_not_found"` / `"not_assigned"`.
   */
  async unassignTeam(
    workspaceId: string,
    teamId: string,
  ): Promise<WorkspaceRecord | "workspace_not_found" | "not_assigned"> {
    const workspace = await this.findById(workspaceId);
    if (!workspace) {
      return "workspace_not_found";
    }
    if (!isUuid(teamId)) {
      return "not_assigned";
    }
    // `deleteMany` reports the row count and does not throw on zero rows, so a
    // concurrent removal is a no-op rather than a 500.
    const { count } = await this.db.workspaceTeam.deleteMany({
      where: { workspaceId, teamId },
    });
    if (count === 0) {
      return "not_assigned";
    }
    return (await this.findById(workspaceId))!;
  }

  /**
   * Adds the participant. Idempotent. Returns the refreshed record, or
   * `"workspace_not_found"` / `"user_not_found"`.
   */
  async addParticipant(
    workspaceId: string,
    userId: string,
  ): Promise<WorkspaceRecord | "workspace_not_found" | "user_not_found"> {
    const workspace = await this.findById(workspaceId);
    if (!workspace) {
      return "workspace_not_found";
    }
    if (!isUuid(userId)) {
      return "user_not_found";
    }
    try {
      await this.db.workspaceParticipant.create({
        data: { workspaceId, userId },
      });
    } catch (error) {
      if (isPrismaError(error, PRISMA_ERROR.uniqueViolation)) {
        return (await this.findById(workspaceId))!;
      }
      if (isPrismaError(error, PRISMA_ERROR.foreignKeyViolation)) {
        return "user_not_found";
      }
      throw error;
    }
    return (await this.findById(workspaceId))!;
  }

  /**
   * Removes the participant, only if they are one. Returns the refreshed
   * record, or `"workspace_not_found"` / `"not_a_participant"`.
   */
  async removeParticipant(
    workspaceId: string,
    userId: string,
  ): Promise<WorkspaceRecord | "workspace_not_found" | "not_a_participant"> {
    const workspace = await this.findById(workspaceId);
    if (!workspace) {
      return "workspace_not_found";
    }
    if (!isUuid(userId)) {
      return "not_a_participant";
    }
    const { count } = await this.db.workspaceParticipant.deleteMany({
      where: { workspaceId, userId },
    });
    if (count === 0) {
      return "not_a_participant";
    }
    return (await this.findById(workspaceId))!;
  }
}
