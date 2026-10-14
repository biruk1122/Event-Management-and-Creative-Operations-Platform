import { Injectable } from "@nestjs/common";

import { PermissionsService } from "../common/security/permissions.service.js";
import { permissionDenied } from "../common/security/security.errors.js";
import type { CreateExpenseDto } from "./dto/create-expense.dto.js";
import type { ListExpensesQueryDto } from "./dto/list-expenses-query.dto.js";
import type { ReviewExpenseDto } from "./dto/review-expense.dto.js";
import type { UpdateExpenseDto } from "./dto/update-expense.dto.js";
import type {
  ExpenseResponse,
  PaginatedExpensesResponse,
} from "./expenses.contracts.js";
import {
  expenseEventHasNoDepartment,
  expenseEventNotFound,
  expenseInvalidTransition,
  expenseNotFound,
  expenseSupplierNotFound,
} from "./expenses.errors.js";
import { canEdit } from "./expenses.policy.js";
import {
  ExpensesRepository,
  type ExpenseRecord,
  type ExpenseVisibility,
  type UpdateExpenseFields,
} from "./infrastructure/expenses.repository.js";

function toResponse(expense: ExpenseRecord): ExpenseResponse {
  return {
    id: expense.id,
    eventId: expense.eventId,
    departmentId: expense.departmentId,
    supplierId: expense.supplierId,
    category: expense.category,
    description: expense.description,
    plannedAmount:
      expense.plannedAmount === null ? null : expense.plannedAmount.toFixed(2),
    actualAmount: expense.actualAmount.toFixed(2),
    currency: expense.currency.trim(),
    status: expense.status,
    createdById: expense.createdById,
    submittedAt: expense.submittedAt?.toISOString() ?? null,
    reviewedAt: expense.reviewedAt?.toISOString() ?? null,
    reviewerId: expense.reviewerId,
    reviews: expense.reviews.map((review) => ({
      id: review.id,
      reviewerId: review.reviewerId,
      outcome: review.outcome,
      note: review.note,
      reviewedAt: review.reviewedAt.toISOString(),
    })),
    createdAt: expense.createdAt.toISOString(),
    updatedAt: expense.updatedAt.toISOString(),
  };
}

@Injectable()
export class ExpensesService {
  constructor(
    private readonly repo: ExpensesRepository,
    private readonly permissions: PermissionsService,
  ) {}

  private async visibility(
    userId: string,
    key: string,
  ): Promise<ExpenseVisibility> {
    const grants = await this.permissions.getEffectiveGrants(userId);
    const organization = grants.some(
      (g) => g.permissionKey === key && g.scope === "ORGANIZATION",
    );
    const department = grants.some(
      (g) => g.permissionKey === key && g.scope === "DEPARTMENT",
    );
    const self = grants.some(
      (g) => g.permissionKey === key && g.scope === "SELF",
    );
    if (!organization && !department && !self) throw permissionDenied();
    const departmentId = department
      ? await this.repo.findUserDepartmentId(userId)
      : null;
    return {
      organization,
      ...(departmentId ? { departmentId } : {}),
      ...(self ? { selfUserId: userId } : {}),
    };
  }

  private authorized(
    expense: ExpenseRecord,
    visibility: ExpenseVisibility,
  ): boolean {
    return (
      visibility.organization ||
      (!!visibility.departmentId &&
        expense.departmentId === visibility.departmentId) ||
      (!!visibility.selfUserId && expense.createdById === visibility.selfUserId)
    );
  }

  private async load(
    userId: string,
    id: string,
    key: string,
  ): Promise<ExpenseRecord> {
    const visibility = await this.visibility(userId, key);
    const expense = await this.repo.findById(id);
    if (!expense) {
      if (!visibility.organization) throw permissionDenied();
      throw expenseNotFound();
    }
    if (!this.authorized(expense, visibility)) throw permissionDenied();
    return expense;
  }

  async list(
    userId: string,
    query: ListExpensesQueryDto,
  ): Promise<PaginatedExpensesResponse> {
    const visibility = await this.visibility(userId, "expense.read");
    const result = await this.repo.list({
      visibility,
      ...(query.eventId ? { eventId: query.eventId } : {}),
      ...(query.status ? { status: query.status } : {}),
      ...(query.category ? { category: query.category } : {}),
      ...(query.departmentId ? { departmentId: query.departmentId } : {}),
      ...(query.supplierId ? { supplierId: query.supplierId } : {}),
      page: query.page,
      pageSize: query.pageSize,
    });
    return {
      items: result.items.map(toResponse),
      page: query.page,
      pageSize: query.pageSize,
      total: result.total,
    };
  }

  async get(userId: string, id: string): Promise<ExpenseResponse> {
    return toResponse(await this.load(userId, id, "expense.read"));
  }

  async create(
    userId: string,
    dto: CreateExpenseDto,
  ): Promise<ExpenseResponse> {
    const event = await this.repo.findEventContext(dto.eventId);
    if (!event) throw expenseEventNotFound();
    if (!event.departmentId) throw expenseEventHasNoDepartment();
    const visibility = await this.visibility(userId, "expense.create");
    if (
      !visibility.organization &&
      !(
        visibility.departmentId &&
        visibility.departmentId === event.departmentId
      )
    )
      throw permissionDenied();
    if (dto.supplierId && !(await this.repo.supplierExists(dto.supplierId)))
      throw expenseSupplierNotFound();
    return toResponse(
      await this.repo.create(event.departmentId, {
        eventId: dto.eventId,
        ...(dto.supplierId ? { supplierId: dto.supplierId } : {}),
        category: dto.category,
        description: dto.description.trim(),
        ...(dto.plannedAmount !== undefined
          ? { plannedAmount: dto.plannedAmount.toFixed(2) }
          : {}),
        actualAmount: dto.actualAmount.toFixed(2),
        currency: dto.currency,
        createdById: userId,
      }),
    );
  }

  async update(
    userId: string,
    id: string,
    dto: UpdateExpenseDto,
  ): Promise<ExpenseResponse> {
    const expense = await this.load(userId, id, "expense.update");
    if (!canEdit(expense.status)) throw expenseInvalidTransition();
    if (dto.supplierId && !(await this.repo.supplierExists(dto.supplierId)))
      throw expenseSupplierNotFound();
    const fields: UpdateExpenseFields = {
      ...(dto.supplierId !== undefined ? { supplierId: dto.supplierId } : {}),
      ...(dto.category !== undefined ? { category: dto.category } : {}),
      ...(dto.description !== undefined
        ? { description: dto.description.trim() }
        : {}),
      ...(dto.plannedAmount !== undefined
        ? {
            plannedAmount:
              dto.plannedAmount === null ? null : dto.plannedAmount.toFixed(2),
          }
        : {}),
      ...(dto.actualAmount !== undefined
        ? { actualAmount: dto.actualAmount.toFixed(2) }
        : {}),
      ...(dto.currency !== undefined ? { currency: dto.currency } : {}),
    };
    return toResponse(
      await this.repo.updateDraft(id, expense.updatedAt, fields),
    );
  }

  async submit(
    userId: string,
    id: string,
    requestId: string,
  ): Promise<ExpenseResponse> {
    const expense = await this.load(userId, id, "expense.submit");
    if (expense.status !== "DRAFT") throw expenseInvalidTransition();
    return toResponse(
      await this.repo.submit(id, expense.updatedAt, userId, requestId),
    );
  }

  async review(
    userId: string,
    id: string,
    dto: ReviewExpenseDto,
    requestId: string,
  ): Promise<ExpenseResponse> {
    const expense = await this.load(userId, id, "expense.approve");
    if (expense.status !== "SUBMITTED") throw expenseInvalidTransition();
    // Separation of duties: the approver may never be the submitter, even for
    // the organization-scoped Super Admin grant that also holds `expense.create`.
    if (expense.createdById === userId) throw permissionDenied();
    return toResponse(
      await this.repo.review(
        id,
        expense.updatedAt,
        userId,
        dto.outcome,
        requestId,
        dto.note,
      ),
    );
  }
}
