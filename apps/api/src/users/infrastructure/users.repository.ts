import { Injectable } from "@nestjs/common";

import { Prisma } from "../../generated/prisma/client.js";
import { DatabaseService } from "../../database/database.service.js";

export type UserStatus = "ACTIVE" | "INACTIVE";

export interface UserRecord {
  id: string;
  email: string;
  firstName: string | null;
  lastName: string | null;
  phone: string | null;
  profileImage: string | null;
  status: UserStatus;
  deactivatedAt: Date | null;
  role: { id: string; name: string } | null;
  mustChangePassword: boolean;
  createdAt: Date;
  updatedAt: Date;
}

export interface CreateUserInput {
  email: string;
  firstName: string;
  lastName: string;
  phone: string | null;
  profileImage: string | null;
  passwordHash: string;
  roleId: string | null;
}

export interface ListUsersInput {
  status?: UserStatus;
  search?: string;
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
  phone: true,
  profileImage: true,
  status: true,
  deactivatedAt: true,
  createdAt: true,
  updatedAt: true,
  roleAssignment: { select: { role: { select: { id: true, name: true } } } },
  credential: { select: { mustChangePassword: true } },
} as const;

type RawUser = Prisma.UserGetPayload<{ select: typeof USER_SELECT }>;

function toRecord(raw: RawUser): UserRecord {
  return {
    id: raw.id,
    email: raw.email,
    firstName: raw.firstName,
    lastName: raw.lastName,
    phone: raw.phone,
    profileImage: raw.profileImage,
    status: raw.status,
    deactivatedAt: raw.deactivatedAt,
    role: raw.roleAssignment?.role ?? null,
    mustChangePassword: raw.credential?.mustChangePassword ?? false,
    createdAt: raw.createdAt,
    updatedAt: raw.updatedAt,
  };
}

@Injectable()
export class UsersRepository {
  constructor(private readonly db: DatabaseService) {}

  async list(
    input: ListUsersInput,
  ): Promise<{ items: UserRecord[]; total: number }> {
    const where: Prisma.UserWhereInput = {
      ...(input.status ? { status: input.status } : {}),
      ...(input.search
        ? {
            OR: [
              { email: { contains: input.search, mode: "insensitive" } },
              { firstName: { contains: input.search, mode: "insensitive" } },
              { lastName: { contains: input.search, mode: "insensitive" } },
            ],
          }
        : {}),
    };

    const [items, total] = await Promise.all([
      this.db.user.findMany({
        where,
        select: USER_SELECT,
        orderBy: [
          { lastName: "asc" },
          { firstName: "asc" },
          { createdAt: "asc" },
        ],
        skip: (input.page - 1) * input.pageSize,
        take: input.pageSize,
      }),
      this.db.user.count({ where }),
    ]);

    return { items: items.map(toRecord), total };
  }

  async findById(id: string): Promise<UserRecord | null> {
    const raw = await this.db.user.findUnique({
      where: { id },
      select: USER_SELECT,
    });
    return raw ? toRecord(raw) : null;
  }

  async roleExists(roleId: string): Promise<boolean> {
    const role = await this.db.role.findUnique({
      where: { id: roleId },
      select: { id: true },
    });
    return role !== null;
  }

  /**
   * Returns the created record, or `"email_conflict"` / `"role_not_found"`.
   * The nested `credential` and `roleAssignment` writes run in one implicit
   * transaction with the user insert.
   */
  async create(
    input: CreateUserInput,
  ): Promise<UserRecord | "email_conflict" | "role_not_found"> {
    try {
      const created = await this.db.user.create({
        data: {
          email: input.email,
          firstName: input.firstName,
          lastName: input.lastName,
          phone: input.phone,
          profileImage: input.profileImage,
          credential: {
            create: {
              passwordHash: input.passwordHash,
              mustChangePassword: true,
            },
          },
          ...(input.roleId
            ? { roleAssignment: { create: { roleId: input.roleId } } }
            : {}),
        },
        select: USER_SELECT,
      });
      return toRecord(created);
    } catch (error) {
      if (isPrismaError(error, PRISMA_ERROR.uniqueViolation)) {
        return "email_conflict";
      }
      if (isPrismaError(error, PRISMA_ERROR.foreignKeyViolation)) {
        return "role_not_found";
      }
      throw error;
    }
  }

  /** Returns the updated record, or `"not_found"` / `"email_conflict"`. */
  async update(
    id: string,
    data: {
      email?: string;
      firstName?: string;
      lastName?: string;
      phone?: string;
      profileImage?: string;
    },
  ): Promise<UserRecord | "not_found" | "email_conflict"> {
    try {
      const updated = await this.db.user.update({
        where: { id },
        data,
        select: USER_SELECT,
      });
      return toRecord(updated);
    } catch (error) {
      if (isPrismaError(error, PRISMA_ERROR.recordNotFound)) {
        return "not_found";
      }
      if (isPrismaError(error, PRISMA_ERROR.uniqueViolation)) {
        return "email_conflict";
      }
      throw error;
    }
  }

  /** Returns the updated record, or `"not_found"`. */
  async setStatus(
    id: string,
    status: UserStatus,
    deactivatedAt: Date | null,
  ): Promise<UserRecord | "not_found"> {
    try {
      const updated = await this.db.user.update({
        where: { id },
        data: { status, deactivatedAt },
        select: USER_SELECT,
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
   * Sets (`roleId`) or clears (`null`) the user's single role assignment.
   * Returns `"user_not_found"`, `"role_not_found"`, or the updated record.
   */
  async setRole(
    userId: string,
    roleId: string | null,
  ): Promise<UserRecord | "user_not_found" | "role_not_found"> {
    const user = await this.db.user.findUnique({
      where: { id: userId },
      select: { id: true },
    });
    if (!user) {
      return "user_not_found";
    }

    try {
      if (roleId === null) {
        await this.db.userRoleAssignment.deleteMany({ where: { userId } });
      } else {
        await this.db.userRoleAssignment.upsert({
          where: { userId },
          create: { userId, roleId },
          update: { roleId },
        });
      }
    } catch (error) {
      if (isPrismaError(error, PRISMA_ERROR.foreignKeyViolation)) {
        return "role_not_found";
      }
      throw error;
    }

    const updated = await this.db.user.findUnique({
      where: { id: userId },
      select: USER_SELECT,
    });
    return toRecord(updated as RawUser);
  }
}
