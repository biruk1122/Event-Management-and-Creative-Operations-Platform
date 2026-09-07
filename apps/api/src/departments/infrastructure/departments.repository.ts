import { Injectable } from "@nestjs/common";

import { Prisma } from "../../generated/prisma/client.js";
import { DatabaseService } from "../../database/database.service.js";

export interface DepartmentManagerRecord {
  id: string;
  email: string;
  firstName: string | null;
  lastName: string | null;
}

export interface DepartmentRecord {
  id: string;
  name: string;
  description: string | null;
  manager: DepartmentManagerRecord | null;
  employeeCount: number;
  deactivatedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface ListDepartmentsInput {
  search?: string;
  /** `true` = only active, `false` = only deactivated, omitted = all. */
  active?: boolean;
  /** When set, restrict the result to these ids (scoped visibility). */
  ids?: string[];
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

const DEPARTMENT_SELECT = {
  id: true,
  name: true,
  description: true,
  deactivatedAt: true,
  createdAt: true,
  updatedAt: true,
  manager: {
    select: { id: true, email: true, firstName: true, lastName: true },
  },
  _count: { select: { employees: true } },
} as const;

type RawDepartment = Prisma.DepartmentGetPayload<{
  select: typeof DEPARTMENT_SELECT;
}>;

function toRecord(raw: RawDepartment): DepartmentRecord {
  return {
    id: raw.id,
    name: raw.name,
    description: raw.description,
    manager: raw.manager ?? null,
    employeeCount: raw._count.employees,
    deactivatedAt: raw.deactivatedAt,
    createdAt: raw.createdAt,
    updatedAt: raw.updatedAt,
  };
}

@Injectable()
export class DepartmentsRepository {
  constructor(private readonly db: DatabaseService) {}

  async list(
    input: ListDepartmentsInput,
  ): Promise<{ items: DepartmentRecord[]; total: number }> {
    const where: Prisma.DepartmentWhereInput = {
      ...(input.ids ? { id: { in: input.ids } } : {}),
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
      this.db.department.findMany({
        where,
        select: DEPARTMENT_SELECT,
        orderBy: [{ name: "asc" }],
        skip: (input.page - 1) * input.pageSize,
        take: input.pageSize,
      }),
      this.db.department.count({ where }),
    ]);

    return { items: items.map(toRecord), total };
  }

  async findById(id: string): Promise<DepartmentRecord | null> {
    const raw = await this.db.department.findUnique({
      where: { id },
      select: DEPARTMENT_SELECT,
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

  /** Returns the created record, or `"name_conflict"` / `"manager_not_found"`. */
  async create(input: {
    name: string;
    description: string | null;
    managerId: string | null;
  }): Promise<DepartmentRecord | "name_conflict" | "manager_not_found"> {
    try {
      const created = await this.db.department.create({
        data: {
          name: input.name,
          description: input.description,
          managerId: input.managerId,
        },
        select: DEPARTMENT_SELECT,
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
  ): Promise<DepartmentRecord | "not_found" | "name_conflict"> {
    try {
      const updated = await this.db.department.update({
        where: { id },
        data,
        select: DEPARTMENT_SELECT,
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
  ): Promise<DepartmentRecord | "not_found" | "manager_not_found"> {
    try {
      const updated = await this.db.department.update({
        where: { id },
        data: { managerId },
        select: DEPARTMENT_SELECT,
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
  ): Promise<DepartmentRecord | "not_found"> {
    try {
      const updated = await this.db.department.update({
        where: { id },
        data: { deactivatedAt },
        select: DEPARTMENT_SELECT,
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
   * Removes the department only when it has no employees. The count and the
   * delete run in one transaction so a concurrent assignment cannot slip a
   * member past the check. Returns `"not_found"`, `"in_use"`, or `"deleted"`.
   */
  async deleteIfEmpty(id: string): Promise<"not_found" | "in_use" | "deleted"> {
    try {
      return await this.db.$transaction(async (tx) => {
        const employees = await tx.user.count({ where: { departmentId: id } });
        if (employees > 0) {
          return "in_use";
        }
        await tx.department.delete({ where: { id } });
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
   * Assigns the user to the department (moving them if they were elsewhere).
   * Returns the department's refreshed record, or `"department_not_found"` /
   * `"user_not_found"`.
   */
  async assignEmployee(
    departmentId: string,
    userId: string,
  ): Promise<DepartmentRecord | "department_not_found" | "user_not_found"> {
    const department = await this.findById(departmentId);
    if (!department) {
      return "department_not_found";
    }
    try {
      await this.db.user.update({
        where: { id: userId },
        data: { departmentId },
      });
    } catch (error) {
      if (isPrismaError(error, PRISMA_ERROR.recordNotFound)) {
        return "user_not_found";
      }
      // The department was removed between the check above and this write.
      if (isPrismaError(error, PRISMA_ERROR.foreignKeyViolation)) {
        return "department_not_found";
      }
      throw error;
    }
    return (await this.findById(departmentId))!;
  }

  /**
   * Clears the user's department, but only if they are currently a member of
   * this one. Returns the refreshed record, or `"department_not_found"` /
   * `"user_not_found"` / `"not_a_member"`.
   */
  async removeEmployee(
    departmentId: string,
    userId: string,
  ): Promise<
    | DepartmentRecord
    | "department_not_found"
    | "user_not_found"
    | "not_a_member"
  > {
    const department = await this.findById(departmentId);
    if (!department) {
      return "department_not_found";
    }
    const user = await this.db.user.findUnique({
      where: { id: userId },
      select: { departmentId: true },
    });
    if (!user) {
      return "user_not_found";
    }
    if (user.departmentId !== departmentId) {
      return "not_a_member";
    }
    await this.db.user.update({
      where: { id: userId },
      data: { departmentId: null },
    });
    return (await this.findById(departmentId))!;
  }
}
