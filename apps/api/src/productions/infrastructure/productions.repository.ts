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
  eventId: true,
  departmentId: true,
  budgetAmount: true,
  budgetCurrency: true,
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
  eventId?: string | null;
}
export interface ProductionVisibility {
  organization: boolean;
  departmentId?: string;
}
export interface ProductionBudgetSummary {
  plannedAmount: string | null;
  currency: string | null;
  actualApproved: string;
  actualPending: string;
  linkedEventId: string | null;
}
function visibleWhere(
  visibility: ProductionVisibility,
): Prisma.ProductionWhereInput {
  if (visibility.organization) return {};
  if (visibility.departmentId)
    return { departmentId: visibility.departmentId };
  return { id: { in: [] } };
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
    eventId: raw.eventId,
    departmentId: raw.departmentId,
    budgetAmount:
      raw.budgetAmount === null ? null : raw.budgetAmount.toFixed(2),
    budgetCurrency: raw.budgetCurrency,
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
  async eventExists(id: string): Promise<boolean> {
    if (!UUID.test(id)) return false;
    return (await this.db.event.count({ where: { id } })) === 1;
  }
  async departmentExists(id: string): Promise<boolean> {
    if (!UUID.test(id)) return false;
    return (await this.db.department.count({ where: { id } })) === 1;
  }
  async findUserDepartmentId(userId: string): Promise<string | null> {
    if (!UUID.test(userId)) return null;
    const user = await this.db.user.findUnique({
      where: { id: userId },
      select: { departmentId: true },
    });
    return user?.departmentId ?? null;
  }
  /** Narrow, read-only cross-department coordination (EOM-01): the
   * productions soft-linked to one event, for an event the caller can
   * already read. No pagination - this is a small supporting list, not the
   * module's primary listing surface. */
  async listByEventId(eventId: string): Promise<ProductionRecord[]> {
    if (!UUID.test(eventId)) return [];
    const items = await this.db.production.findMany({
      where: { eventId },
      select: SELECT,
      orderBy: [{ createdAt: "asc" }, { id: "asc" }],
    });
    return items.map(toRecord);
  }
  async list(input: {
    visibility: ProductionVisibility;
    page: number;
    pageSize: number;
    status?: ProductionStatus;
    search?: string;
    departmentId?: string;
  }) {
    const where: Prisma.ProductionWhereInput = {
      AND: [
        visibleWhere(input.visibility),
        {
          ...(input.status ? { status: input.status } : {}),
          ...(input.departmentId ? { departmentId: input.departmentId } : {}),
          ...(input.search
            ? { name: { contains: input.search, mode: "insensitive" } }
            : {}),
        },
      ],
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
  async findVisibleById(
    id: string,
    visibility: ProductionVisibility,
  ): Promise<ProductionRecord | null> {
    if (!UUID.test(id)) return null;
    const raw = await this.db.production.findFirst({
      where: { AND: [{ id }, visibleWhere(visibility)] },
      select: SELECT,
    });
    return raw ? toRecord(raw) : null;
  }
  /**
   * Planned-vs-actual for one production, mirroring
   * `events.repository.ts#budgetSummary`'s separate-approved/pending shape:
   * actual/pending are summed from every `Expense` row that is either
   * linked directly to this production (`productionId`) or to its linked
   * event (`eventId`), so a production with no linked event can still
   * record and see its own spend, and a production with both a direct
   * expense and a linked event's expenses sees the combined total without
   * double-counting (an expense can only ever match one side of the OR - it
   * carries at most one of `eventId`/`productionId` set to this
   * production's own ids). `linkedEventId` is `null` when the production has
   * no linked event; that no longer makes budget tracking unavailable, it
   * only means the summary cannot also roll up that event's own expenses.
   */
  async budgetSummary(id: string): Promise<ProductionBudgetSummary | null> {
    if (!UUID.test(id)) return null;
    const production = await this.db.production.findUnique({
      where: { id },
      select: { budgetAmount: true, budgetCurrency: true, eventId: true },
    });
    if (!production) return null;
    const or: Prisma.ExpenseWhereInput[] = [{ productionId: id }];
    if (production.eventId) or.push({ eventId: production.eventId });
    const sums = await this.db.expense.groupBy({
      by: ["status"],
      where: { OR: or, status: { in: ["APPROVED", "SUBMITTED"] } },
      _sum: { actualAmount: true },
    });
    const approved = sums.find((row) => row.status === "APPROVED");
    const pending = sums.find((row) => row.status === "SUBMITTED");
    return {
      plannedAmount:
        production.budgetAmount === null
          ? null
          : production.budgetAmount.toFixed(2),
      currency:
        production.budgetCurrency === null
          ? null
          : production.budgetCurrency.trim(),
      actualApproved: approved?._sum.actualAmount?.toFixed(2) ?? "0.00",
      actualPending: pending?._sum.actualAmount?.toFixed(2) ?? "0.00",
      linkedEventId: production.eventId,
    };
  }
  async setBudget(
    id: string,
    amount: string | null,
    currency: string | null,
  ): Promise<ProductionRecord | "not_found"> {
    if (!UUID.test(id)) return "not_found";
    try {
      return toRecord(
        await this.db.production.update({
          where: { id },
          data: { budgetAmount: amount, budgetCurrency: currency },
          select: SELECT,
        }),
      );
    } catch (error) {
      if (prismaError(error, "P2025")) return "not_found";
      throw error;
    }
  }
  async create(input: {
    name: string;
    productionType: string;
    description?: string;
    startAt?: Date;
    endAt?: Date;
    deadlineAt?: Date;
    managerId?: string;
    eventId?: string;
    departmentId?: string;
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
            ...(input.eventId ? { eventId: input.eventId } : {}),
            ...(input.departmentId
              ? { departmentId: input.departmentId }
              : {}),
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
