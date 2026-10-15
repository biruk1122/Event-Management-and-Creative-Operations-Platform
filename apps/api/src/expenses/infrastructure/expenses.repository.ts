import { Injectable } from "@nestjs/common";

import {
  AuditActorKind,
  AuditOutcome,
  OutboxActorKind,
  Prisma,
  type ExpenseCategory,
  type ExpenseReviewOutcome,
  type ExpenseStatus,
} from "../../generated/prisma/client.js";
import { AuditWriterService } from "../../audit/audit-writer.service.js";
import { DatabaseService } from "../../database/database.service.js";
import { OutboxWriterService } from "../../outbox/outbox-writer.service.js";
import {
  expenseConcurrentChange,
  expenseInvalidTransition,
} from "../expenses.errors.js";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const include = {
  reviews: {
    orderBy: [{ reviewedAt: "asc" }, { id: "asc" }],
    select: {
      id: true,
      reviewerId: true,
      outcome: true,
      note: true,
      reviewedAt: true,
    },
  },
} satisfies Prisma.ExpenseInclude;

export type ExpenseRecord = Prisma.ExpenseGetPayload<{
  include: typeof include;
}>;

export interface ExpenseVisibility {
  organization: boolean;
  departmentId?: string;
  selfUserId?: string;
}

export interface ListExpensesInput {
  visibility: ExpenseVisibility;
  eventId?: string;
  productionId?: string;
  status?: ExpenseStatus;
  category?: ExpenseCategory;
  departmentId?: string;
  supplierId?: string;
  page: number;
  pageSize: number;
}

export interface CreateExpenseInput {
  eventId?: string;
  productionId?: string;
  supplierId?: string;
  category: ExpenseCategory;
  description: string;
  plannedAmount?: string;
  actualAmount: string;
  currency: string;
  createdById: string;
}

export interface UpdateExpenseFields {
  supplierId?: string | null;
  category?: ExpenseCategory;
  description?: string;
  plannedAmount?: string | null;
  actualAmount?: string;
  currency?: string;
}

function visibleWhere(visibility: ExpenseVisibility): Prisma.ExpenseWhereInput {
  if (visibility.organization) return {};
  const or: Prisma.ExpenseWhereInput[] = [];
  if (visibility.departmentId)
    or.push({ departmentId: visibility.departmentId });
  if (visibility.selfUserId) or.push({ createdById: visibility.selfUserId });
  return or.length ? { OR: or } : { id: { in: [] } };
}

function isUuid(value: string): boolean {
  return UUID.test(value);
}

function updateData(
  fields: UpdateExpenseFields,
): Prisma.ExpenseUncheckedUpdateManyInput {
  const data: Prisma.ExpenseUncheckedUpdateManyInput = {};
  if (fields.supplierId !== undefined) data.supplierId = fields.supplierId;
  if (fields.category !== undefined) data.category = fields.category;
  if (fields.description !== undefined) data.description = fields.description;
  if (fields.plannedAmount !== undefined)
    data.plannedAmount = fields.plannedAmount;
  if (fields.actualAmount !== undefined)
    data.actualAmount = fields.actualAmount;
  if (fields.currency !== undefined) data.currency = fields.currency;
  return data;
}

@Injectable()
export class ExpensesRepository {
  constructor(
    private readonly db: DatabaseService,
    private readonly audit: AuditWriterService,
    private readonly outbox: OutboxWriterService,
  ) {}

  async findUserDepartmentId(userId: string): Promise<string | null> {
    if (!isUuid(userId)) return null;
    const user = await this.db.user.findUnique({
      where: { id: userId },
      select: { departmentId: true },
    });
    return user?.departmentId ?? null;
  }

  /** The event's id must exist and carry a department for an expense to be
   * attached to it (EOM-01: expenses always have a concrete department). */
  async findEventContext(
    eventId: string,
  ): Promise<{ departmentId: string | null } | null> {
    if (!isUuid(eventId)) return null;
    return this.db.event.findUnique({
      where: { id: eventId },
      select: { departmentId: true },
    });
  }

  /** Same shape as `findEventContext`, for a direct production-owned
   * expense (a production with no linked event). */
  async findProductionContext(
    productionId: string,
  ): Promise<{ departmentId: string | null } | null> {
    if (!isUuid(productionId)) return null;
    return this.db.production.findUnique({
      where: { id: productionId },
      select: { departmentId: true },
    });
  }

  async supplierExists(id: string): Promise<boolean> {
    if (!isUuid(id)) return false;
    return (await this.db.supplier.count({ where: { id } })) === 1;
  }

  async findById(id: string): Promise<ExpenseRecord | null> {
    if (!isUuid(id)) return null;
    return this.db.expense.findUnique({ where: { id }, include });
  }

  async findVisibleById(
    id: string,
    visibility: ExpenseVisibility,
  ): Promise<ExpenseRecord | null> {
    if (!isUuid(id)) return null;
    return this.db.expense.findFirst({
      where: { AND: [{ id }, visibleWhere(visibility)] },
      include,
    });
  }

  /** `SELECT ... FOR UPDATE` + a re-check against the current visibility,
   * inside the caller's open transaction - the same concurrency-safe
   * attachment-finalization lock `tasks.repository.ts` uses, so a finalize
   * can never race a concurrent department reassignment past the caller's
   * earlier authorization check. */
  async lockAttachmentAccess(
    tx: Prisma.TransactionClient,
    expenseId: string,
    visibility: ExpenseVisibility,
  ): Promise<"visible" | "forbidden" | "not_found"> {
    if (!isUuid(expenseId)) return "not_found";
    const locked = await tx.$queryRaw<Array<{ id: string }>>(
      Prisma.sql`SELECT id FROM expenses WHERE id = ${expenseId}::uuid FOR UPDATE`,
    );
    if (locked.length !== 1) return "not_found";
    const visible = await tx.expense.count({
      where: { AND: [{ id: expenseId }, visibleWhere(visibility)] },
    });
    return visible === 1 ? "visible" : "forbidden";
  }

  async createAttachment(
    tx: Prisma.TransactionClient,
    input: { expenseId: string; fileId: string; attachedById: string },
  ): Promise<void> {
    await tx.expenseAttachment.create({
      data: {
        attachedById: input.attachedById,
        managedFileId: input.fileId,
        expenseId: input.expenseId,
      },
    });
  }

  async hasAttachment(expenseId: string, fileId: string): Promise<boolean> {
    if (!isUuid(expenseId) || !isUuid(fileId)) return false;
    return (
      (await this.db.expenseAttachment.count({
        where: { expenseId, managedFileId: fileId },
      })) === 1
    );
  }

  async listAttachmentFileIds(
    expenseId: string,
    page: number,
    pageSize: number,
  ): Promise<{ fileIds: string[]; total: number }> {
    if (!isUuid(expenseId)) return { fileIds: [], total: 0 };
    const where: Prisma.ExpenseAttachmentWhereInput = { expenseId };
    const [attachments, total] = await Promise.all([
      this.db.expenseAttachment.findMany({
        where,
        select: { managedFileId: true },
        orderBy: [{ createdAt: "desc" }, { id: "desc" }],
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
      this.db.expenseAttachment.count({ where }),
    ]);
    return {
      fileIds: attachments.map(({ managedFileId }) => managedFileId),
      total,
    };
  }

  async list(
    input: ListExpensesInput,
  ): Promise<{ items: ExpenseRecord[]; total: number }> {
    const where: Prisma.ExpenseWhereInput = {
      ...visibleWhere(input.visibility),
      ...(input.eventId ? { eventId: input.eventId } : {}),
      ...(input.productionId ? { productionId: input.productionId } : {}),
      ...(input.status ? { status: input.status } : {}),
      ...(input.category ? { category: input.category } : {}),
      ...(input.departmentId ? { departmentId: input.departmentId } : {}),
      ...(input.supplierId ? { supplierId: input.supplierId } : {}),
    };
    const [items, total] = await this.db.$transaction([
      this.db.expense.findMany({
        where,
        include,
        orderBy: [{ createdAt: "desc" }, { id: "desc" }],
        skip: (input.page - 1) * input.pageSize,
        take: input.pageSize,
      }),
      this.db.expense.count({ where }),
    ]);
    return { items, total };
  }

  async create(
    departmentId: string,
    data: CreateExpenseInput,
  ): Promise<ExpenseRecord> {
    return this.db.expense.create({
      data: {
        ...(data.eventId ? { eventId: data.eventId } : {}),
        ...(data.productionId ? { productionId: data.productionId } : {}),
        departmentId,
        ...(data.supplierId ? { supplierId: data.supplierId } : {}),
        category: data.category,
        description: data.description,
        ...(data.plannedAmount !== undefined
          ? { plannedAmount: data.plannedAmount }
          : {}),
        actualAmount: data.actualAmount,
        currency: data.currency,
        createdById: data.createdById,
      },
      include,
    });
  }

  /** Edits a draft or rejected expense; a rejected edit returns to DRAFT and
   * clears the prior decision's fields on the row (the decision itself stays
   * forever in `reviews[]` - see `ExpenseReview`). */
  async updateDraft(
    id: string,
    expectedUpdatedAt: Date,
    fields: UpdateExpenseFields,
  ): Promise<ExpenseRecord> {
    const changed = await this.db.expense.updateMany({
      where: {
        id,
        updatedAt: expectedUpdatedAt,
        status: { in: ["DRAFT", "REJECTED"] },
      },
      data: {
        ...updateData(fields),
        status: "DRAFT",
        submittedAt: null,
        reviewedAt: null,
        reviewerId: null,
        updatedAt: new Date(),
      },
    });
    if (changed.count !== 1) throw expenseConcurrentChange();
    return this.db.expense.findUniqueOrThrow({ where: { id }, include });
  }

  async submit(
    id: string,
    expectedUpdatedAt: Date,
    actorId: string,
    requestId: string,
  ): Promise<ExpenseRecord> {
    return this.db.$transaction(async (tx) => {
      const changed = await tx.expense.updateMany({
        where: { id, updatedAt: expectedUpdatedAt, status: "DRAFT" },
        data: {
          status: "SUBMITTED",
          submittedAt: new Date(),
          reviewedAt: null,
          reviewerId: null,
          updatedAt: new Date(),
        },
      });
      if (changed.count !== 1) throw expenseConcurrentChange();
      const expense = await tx.expense.findUniqueOrThrow({
        where: { id },
        include,
      });
      await this.audit.append(tx, {
        action: "expense.submitted",
        actorKind: AuditActorKind.USER,
        actorUserId: actorId,
        requestId,
        resourceType: "expense",
        resourceId: id,
        outcome: AuditOutcome.SUCCEEDED,
      });
      await this.outbox.append(tx, {
        name: "expense.submitted",
        version: 1,
        actorKind: OutboxActorKind.USER,
        actorUserId: actorId,
        correlationId: requestId,
        resourceType: "expense",
        resourceId: id,
        payload: { eventId: expense.eventId },
        consumers: [{ consumerName: "notifications", consumerVersion: 1 }],
      });
      return expense;
    });
  }

  async review(
    id: string,
    expectedUpdatedAt: Date,
    reviewerId: string,
    outcome: ExpenseReviewOutcome,
    requestId: string,
    note?: string,
  ): Promise<ExpenseRecord> {
    return this.db.$transaction(async (tx) => {
      const reviewedAt = new Date();
      const changed = await tx.expense.updateMany({
        where: { id, updatedAt: expectedUpdatedAt, status: "SUBMITTED" },
        data: {
          status: outcome,
          reviewerId,
          reviewedAt,
          updatedAt: reviewedAt,
        },
      });
      if (changed.count !== 1) throw expenseInvalidTransition();
      const review = await tx.expenseReview.create({
        data: {
          expenseId: id,
          reviewerId,
          outcome,
          ...(note ? { note } : {}),
          reviewedAt,
        },
      });
      await this.audit.append(tx, {
        action:
          outcome === "APPROVED"
            ? "expense.review.approved"
            : "expense.review.rejected",
        actorKind: AuditActorKind.USER,
        actorUserId: reviewerId,
        requestId,
        resourceType: "expense",
        resourceId: id,
        outcome: AuditOutcome.SUCCEEDED,
      });
      const expense = await tx.expense.findUniqueOrThrow({
        where: { id },
        include,
      });
      await this.outbox.append(tx, {
        name: "expense.reviewed",
        version: 1,
        actorKind: OutboxActorKind.USER,
        actorUserId: reviewerId,
        correlationId: requestId,
        resourceType: "expense",
        resourceId: id,
        payload: { outcome, reviewId: review.id },
        consumers: [{ consumerName: "notifications", consumerVersion: 1 }],
      });
      return expense;
    });
  }
}
