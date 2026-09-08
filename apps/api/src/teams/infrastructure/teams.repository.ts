import { Injectable } from "@nestjs/common";

import { Prisma } from "../../generated/prisma/client.js";
import { DatabaseService } from "../../database/database.service.js";

export interface TeamUserRecord {
  id: string;
  email: string;
  firstName: string | null;
  lastName: string | null;
}

export interface TeamDepartmentRecord {
  id: string;
  name: string;
}

export interface TeamRecord {
  id: string;
  name: string;
  description: string | null;
  department: TeamDepartmentRecord;
  manager: TeamUserRecord | null;
  members: TeamUserRecord[];
  deactivatedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface ListTeamsInput {
  search?: string;
  /** `true` = only active, `false` = only deactivated, omitted = all. */
  active?: boolean;
  /**
   * When set, restrict the result to teams in these departments. An empty
   * array yields no rows (a department-scoped caller with no department).
   */
  departmentIds?: string[];
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

const USER_SELECT = {
  id: true,
  email: true,
  firstName: true,
  lastName: true,
} as const;

const TEAM_SELECT = {
  id: true,
  name: true,
  description: true,
  deactivatedAt: true,
  createdAt: true,
  updatedAt: true,
  department: { select: { id: true, name: true } },
  manager: { select: USER_SELECT },
  members: { select: { user: { select: USER_SELECT } } },
} as const;

type RawTeam = Prisma.TeamGetPayload<{ select: typeof TEAM_SELECT }>;

/** Members are ordered here rather than in the query so `TEAM_SELECT` can stay
 * a literal (`as const`) that Prisma's payload types read directly. */
function byPerson(a: TeamUserRecord, b: TeamUserRecord): number {
  return (
    (a.lastName ?? "").localeCompare(b.lastName ?? "") ||
    (a.firstName ?? "").localeCompare(b.firstName ?? "") ||
    a.email.localeCompare(b.email)
  );
}

function toRecord(raw: RawTeam): TeamRecord {
  return {
    id: raw.id,
    name: raw.name,
    description: raw.description,
    department: raw.department,
    manager: raw.manager ?? null,
    members: raw.members.map((membership) => membership.user).sort(byPerson),
    deactivatedAt: raw.deactivatedAt,
    createdAt: raw.createdAt,
    updatedAt: raw.updatedAt,
  };
}

@Injectable()
export class TeamsRepository {
  constructor(private readonly db: DatabaseService) {}

  async list(
    input: ListTeamsInput,
  ): Promise<{ items: TeamRecord[]; total: number }> {
    const where: Prisma.TeamWhereInput = {
      ...(input.departmentIds
        ? { departmentId: { in: input.departmentIds } }
        : {}),
      ...(input.active === true ? { deactivatedAt: null } : {}),
      ...(input.active === false ? { deactivatedAt: { not: null } } : {}),
      ...(input.search
        ? {
            OR: [
              { name: { contains: input.search, mode: "insensitive" } },
              {
                description: { contains: input.search, mode: "insensitive" },
              },
            ],
          }
        : {}),
    };

    const [items, total] = await Promise.all([
      this.db.team.findMany({
        where,
        select: TEAM_SELECT,
        orderBy: [{ name: "asc" }],
        skip: (input.page - 1) * input.pageSize,
        take: input.pageSize,
      }),
      this.db.team.count({ where }),
    ]);

    return { items: items.map(toRecord), total };
  }

  async findById(id: string): Promise<TeamRecord | null> {
    const raw = await this.db.team.findUnique({
      where: { id },
      select: TEAM_SELECT,
    });
    return raw ? toRecord(raw) : null;
  }

  /** The department the user is an employee of, or null (also when no user). */
  async findUserDepartmentId(userId: string): Promise<string | null> {
    const user = await this.db.user.findUnique({
      where: { id: userId },
      select: { departmentId: true },
    });
    return user?.departmentId ?? null;
  }

  async departmentExists(id: string): Promise<boolean> {
    const department = await this.db.department.findUnique({
      where: { id },
      select: { id: true },
    });
    return department !== null;
  }

  /**
   * Returns the created record, or `"name_conflict"` (a team with that name is
   * already in the department) / `"manager_not_found"`. The caller checks the
   * department exists first, so a foreign-key violation here is the manager.
   */
  async create(input: {
    name: string;
    departmentId: string;
    description: string | null;
    managerId: string | null;
  }): Promise<TeamRecord | "name_conflict" | "manager_not_found"> {
    try {
      const created = await this.db.team.create({
        data: {
          name: input.name,
          departmentId: input.departmentId,
          description: input.description,
          managerId: input.managerId,
        },
        select: TEAM_SELECT,
      });
      return toRecord(created);
    } catch (error) {
      if (isPrismaError(error, PRISMA_ERROR.uniqueViolation)) {
        return "name_conflict";
      }
      if (isPrismaError(error, PRISMA_ERROR.foreignKeyViolation)) {
        return "manager_not_found";
      }
      throw error;
    }
  }

  /** Returns the updated record, or `"not_found"` / `"name_conflict"`. */
  async update(
    id: string,
    data: { name?: string; description?: string },
  ): Promise<TeamRecord | "not_found" | "name_conflict"> {
    try {
      const updated = await this.db.team.update({
        where: { id },
        data,
        select: TEAM_SELECT,
      });
      return toRecord(updated);
    } catch (error) {
      if (isPrismaError(error, PRISMA_ERROR.recordNotFound)) {
        return "not_found";
      }
      if (isPrismaError(error, PRISMA_ERROR.uniqueViolation)) {
        return "name_conflict";
      }
      throw error;
    }
  }

  /** Returns the updated record, or `"not_found"` / `"manager_not_found"`. */
  async setManager(
    id: string,
    managerId: string | null,
  ): Promise<TeamRecord | "not_found" | "manager_not_found"> {
    try {
      const updated = await this.db.team.update({
        where: { id },
        data: { managerId },
        select: TEAM_SELECT,
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

  /** Returns the updated record, or `"not_found"`. */
  async setDeactivated(
    id: string,
    deactivatedAt: Date | null,
  ): Promise<TeamRecord | "not_found"> {
    try {
      const updated = await this.db.team.update({
        where: { id },
        data: { deactivatedAt },
        select: TEAM_SELECT,
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
   * Removes the team only when it has no members. The count and the delete run
   * in one transaction so a concurrent membership cannot slip past the check.
   * Returns `"not_found"`, `"in_use"`, or `"deleted"`.
   */
  async deleteIfEmpty(id: string): Promise<"not_found" | "in_use" | "deleted"> {
    try {
      return await this.db.$transaction(async (tx) => {
        const members = await tx.teamMembership.count({
          where: { teamId: id },
        });
        if (members > 0) {
          return "in_use";
        }
        await tx.team.delete({ where: { id } });
        return "deleted";
      });
    } catch (error) {
      if (isPrismaError(error, PRISMA_ERROR.recordNotFound)) {
        return "not_found";
      }
      throw error;
    }
  }

  /**
   * Adds the user to the team. Idempotent: re-adding an existing member is a
   * no-op. Returns the team's refreshed record, or `"team_not_found"` /
   * `"user_not_found"`.
   */
  async addMember(
    teamId: string,
    userId: string,
  ): Promise<TeamRecord | "team_not_found" | "user_not_found"> {
    const team = await this.findById(teamId);
    if (!team) {
      return "team_not_found";
    }
    try {
      await this.db.teamMembership.create({ data: { teamId, userId } });
    } catch (error) {
      // Already a member: the PUT is idempotent, so treat it as success.
      if (isPrismaError(error, PRISMA_ERROR.uniqueViolation)) {
        return (await this.findById(teamId))!;
      }
      if (isPrismaError(error, PRISMA_ERROR.foreignKeyViolation)) {
        return "user_not_found";
      }
      throw error;
    }
    return (await this.findById(teamId))!;
  }

  /**
   * Removes the user from the team, but only if they are currently a member.
   * Returns the refreshed record, or `"team_not_found"` / `"user_not_found"` /
   * `"not_a_member"`.
   */
  async removeMember(
    teamId: string,
    userId: string,
  ): Promise<
    TeamRecord | "team_not_found" | "user_not_found" | "not_a_member"
  > {
    const team = await this.findById(teamId);
    if (!team) {
      return "team_not_found";
    }
    const user = await this.db.user.findUnique({
      where: { id: userId },
      select: { id: true },
    });
    if (!user) {
      return "user_not_found";
    }
    // `deleteMany` reports the row count and does not throw when there is
    // nothing to delete, so a concurrent removal is a no-op rather than a 500.
    const { count } = await this.db.teamMembership.deleteMany({
      where: { teamId, userId },
    });
    if (count === 0) {
      return "not_a_member";
    }
    return (await this.findById(teamId))!;
  }
}
