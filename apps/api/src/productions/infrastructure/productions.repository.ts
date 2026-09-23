import { Injectable } from "@nestjs/common";
import {
  Prisma,
  WorkspaceKind,
  type ProductionStatus,
} from "../../generated/prisma/client.js";
import { DatabaseService } from "../../database/database.service.js";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const PERSON = {
  id: true,
  email: true,
  firstName: true,
  lastName: true,
} as const;
const SELECT = {
  id: true,
  workspaceId: true,
  name: true,
  productionType: true,
  description: true,
  startAt: true,
  endAt: true,
  deadlineAt: true,
  status: true,
  createdAt: true,
  updatedAt: true,
  createdBy: { select: PERSON },
  workspace: {
    select: {
      manager: { select: PERSON },
      teams: { select: { team: { select: { id: true, name: true } } } },
      participants: { select: { user: { select: PERSON } } },
    },
  },
  talents: {
    select: {
      id: true,
      role: true,
      talent: { select: { id: true, fullName: true, type: true } },
    },
  },
} as const;
type Raw = Prisma.ProductionGetPayload<{ select: typeof SELECT }>;
export type ProductionRecord = ReturnType<typeof toRecord>;
export interface ProductionFields {
  name?: string;
  productionType?: string;
  description?: string | null;
  startAt?: Date | null;
  endAt?: Date | null;
  deadlineAt?: Date | null;
}
function toRecord(raw: Raw) {
  return {
    id: raw.id,
    workspaceId: raw.workspaceId,
    name: raw.name,
    productionType: raw.productionType,
    description: raw.description,
    startAt: raw.startAt,
    endAt: raw.endAt,
    deadlineAt: raw.deadlineAt,
    status: raw.status,
    createdAt: raw.createdAt,
    updatedAt: raw.updatedAt,
    createdBy: raw.createdBy,
    manager: raw.workspace.manager,
    teams: raw.workspace.teams
      .map((item) => item.team)
      .sort((a, b) => a.name.localeCompare(b.name)),
    participants: raw.workspace.participants
      .map((item) => item.user)
      .sort((a, b) => a.email.localeCompare(b.email)),
    talents: raw.talents.sort((a, b) =>
      a.talent.fullName.localeCompare(b.talent.fullName),
    ),
  };
}
function prismaError(error: unknown, code: string) {
  return (
    error instanceof Prisma.PrismaClientKnownRequestError && error.code === code
  );
}

@Injectable()
export class ProductionsRepository {
  constructor(private readonly db: DatabaseService) {}
  async list(input: {
    page: number;
    pageSize: number;
    status?: ProductionStatus;
    search?: string;
  }) {
    const where: Prisma.ProductionWhereInput = {
      ...(input.status ? { status: input.status } : {}),
      ...(input.search
        ? { name: { contains: input.search, mode: "insensitive" } }
        : {}),
    };
    const [items, total] = await Promise.all([
      this.db.production.findMany({
        where,
        select: SELECT,
        orderBy: [{ createdAt: "asc" }, { id: "asc" }],
        skip: (input.page - 1) * input.pageSize,
        take: input.pageSize,
      }),
      this.db.production.count({ where }),
    ]);
    return { items: items.map(toRecord), total };
  }
  async findById(id: string): Promise<ProductionRecord | null> {
    if (!UUID.test(id)) return null;
    const raw = await this.db.production.findUnique({
      where: { id },
      select: SELECT,
    });
    return raw ? toRecord(raw) : null;
  }
  async create(input: {
    name: string;
    productionType: string;
    description?: string;
    startAt?: Date;
    endAt?: Date;
    deadlineAt?: Date;
    managerId?: string;
    createdById: string;
  }): Promise<ProductionRecord | "manager_not_found"> {
    try {
      return await this.db.$transaction(async (tx) => {
        const workspace = await tx.workspace.create({
          data: {
            kind: WorkspaceKind.PRODUCTION,
            ...(input.managerId ? { managerId: input.managerId } : {}),
          },
          select: { id: true },
        });
        const raw = await tx.production.create({
          data: {
            workspaceId: workspace.id,
            name: input.name,
            productionType: input.productionType,
            createdById: input.createdById,
            ...(input.description !== undefined
              ? { description: input.description }
              : {}),
            ...(input.startAt ? { startAt: input.startAt } : {}),
            ...(input.endAt ? { endAt: input.endAt } : {}),
            ...(input.deadlineAt ? { deadlineAt: input.deadlineAt } : {}),
          },
          select: SELECT,
        });
        return toRecord(raw);
      });
    } catch (error) {
      if (prismaError(error, "P2003")) return "manager_not_found";
      throw error;
    }
  }
  async update(
    id: string,
    fields: ProductionFields,
  ): Promise<ProductionRecord | null> {
    if (!UUID.test(id)) return null;
    try {
      return toRecord(
        await this.db.production.update({
          where: { id },
          data: fields,
          select: SELECT,
        }),
      );
    } catch (error) {
      if (prismaError(error, "P2025")) return null;
      throw error;
    }
  }
  async updateStatus(
    id: string,
    expected: ProductionStatus,
    status: ProductionStatus,
  ): Promise<ProductionRecord | "not_found" | "status_changed"> {
    if (!UUID.test(id)) return "not_found";
    const changed = await this.db.production.updateMany({
      where: { id, status: expected },
      data: { status },
    });
    const record = await this.findById(id);
    if (!record) return "not_found";
    return changed.count ? record : "status_changed";
  }
  async assignTalent(
    productionId: string,
    talentId: string,
    role: string,
  ): Promise<"assigned" | "talent_not_found" | "already_assigned"> {
    if (!UUID.test(productionId) || !UUID.test(talentId))
      return "talent_not_found";
    try {
      await this.db.productionTalent.create({
        data: { productionId, talentId, role },
      });
      return "assigned";
    } catch (error) {
      if (prismaError(error, "P2002")) return "already_assigned";
      if (prismaError(error, "P2003")) return "talent_not_found";
      throw error;
    }
  }
  async unassignTalent(productionId: string, talentId: string) {
    if (!UUID.test(productionId) || !UUID.test(talentId)) return false;
    return (
      (
        await this.db.productionTalent.deleteMany({
          where: { productionId, talentId },
        })
      ).count === 1
    );
  }
  async delete(id: string): Promise<"deleted" | "not_found" | "in_use"> {
    if (!UUID.test(id)) return "not_found";
    try {
      return await this.db.$transaction(async (tx) => {
        const row = await tx.production.findUnique({
          where: { id },
          select: { workspaceId: true },
        });
        if (!row) return "not_found";
        await tx.managedFile.updateMany({
          where: { intentWorkspaceId: row.workspaceId, state: "UNAVAILABLE" },
          data: { intentWorkspaceId: null },
        });
        await tx.production.delete({ where: { id } });
        await tx.workspace.delete({ where: { id: row.workspaceId } });
        return "deleted";
      });
    } catch (error) {
      if (prismaError(error, "P2025")) return "not_found";
      if (prismaError(error, "P2003")) return "in_use";
      throw error;
    }
  }
}
