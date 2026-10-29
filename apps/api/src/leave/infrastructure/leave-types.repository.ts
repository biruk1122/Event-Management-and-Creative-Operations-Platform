import { Injectable } from "@nestjs/common";

import { DatabaseService } from "../../database/database.service.js";
import { Prisma } from "../../generated/prisma/client.js";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
function isUuid(value: string): boolean {
  return UUID.test(value);
}

export interface LeaveTypeRecord {
  id: string;
  name: string;
  description: string | null;
  isPaid: boolean;
  requiresDocumentation: boolean;
  requiresApproval: boolean;
  isActive: boolean;
  createdAt: Date;
}

const SELECT = {
  id: true,
  name: true,
  description: true,
  isPaid: true,
  requiresDocumentation: true,
  requiresApproval: true,
  isActive: true,
  createdAt: true,
} as const;

function isUniqueViolation(error: unknown): boolean {
  return (
    error instanceof Prisma.PrismaClientKnownRequestError &&
    error.code === "P2002"
  );
}

@Injectable()
export class LeaveTypesRepository {
  constructor(private readonly db: DatabaseService) {}

  async create(input: {
    name: string;
    description?: string;
    isPaid?: boolean;
    requiresDocumentation?: boolean;
    requiresApproval?: boolean;
    createdById: string;
  }): Promise<LeaveTypeRecord | "name_taken"> {
    try {
      return await this.db.leaveType.create({
        data: {
          name: input.name,
          createdById: input.createdById,
          ...(input.description !== undefined
            ? { description: input.description }
            : {}),
          ...(input.isPaid !== undefined ? { isPaid: input.isPaid } : {}),
          ...(input.requiresDocumentation !== undefined
            ? { requiresDocumentation: input.requiresDocumentation }
            : {}),
          ...(input.requiresApproval !== undefined
            ? { requiresApproval: input.requiresApproval }
            : {}),
        },
        select: SELECT,
      });
    } catch (error) {
      if (isUniqueViolation(error)) return "name_taken";
      throw error;
    }
  }

  async findById(id: string): Promise<LeaveTypeRecord | null> {
    if (!isUuid(id)) return null;
    return this.db.leaveType.findUnique({ where: { id }, select: SELECT });
  }

  async list(includeInactive: boolean): Promise<LeaveTypeRecord[]> {
    return this.db.leaveType.findMany({
      where: includeInactive ? {} : { isActive: true },
      select: SELECT,
      orderBy: { name: "asc" },
    });
  }

  async update(
    id: string,
    patch: {
      description?: string | null;
      isPaid?: boolean;
      requiresDocumentation?: boolean;
      requiresApproval?: boolean;
      isActive?: boolean;
    },
  ): Promise<LeaveTypeRecord> {
    return this.db.leaveType.update({
      where: { id },
      data: {
        ...(patch.description !== undefined
          ? { description: patch.description }
          : {}),
        ...(patch.isPaid !== undefined ? { isPaid: patch.isPaid } : {}),
        ...(patch.requiresDocumentation !== undefined
          ? { requiresDocumentation: patch.requiresDocumentation }
          : {}),
        ...(patch.requiresApproval !== undefined
          ? { requiresApproval: patch.requiresApproval }
          : {}),
        ...(patch.isActive !== undefined ? { isActive: patch.isActive } : {}),
      },
      select: SELECT,
    });
  }
}
