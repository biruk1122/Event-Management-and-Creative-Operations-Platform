import { Injectable } from "@nestjs/common";

import type { Prisma } from "../generated/prisma/client.js";
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
  expenseActivityOutsideCampaign,
  expenseCampaignHasNoDepartment,
  expenseCampaignNotFound,
  expenseEventHasNoDepartment,
  expenseEventNotFound,
  expenseInvalidTransition,
  expenseNotFound,
  expenseOwnerRequired,
  expenseProductionHasNoDepartment,
  expenseProductionNotFound,
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
    productionId: expense.productionId,
    campaignId: expense.campaignId,
    campaignActivityId: expense.campaignActivityId,
    title: expense.title,
    expenseDate: expense.expenseDate
      ? expense.expenseDate.toISOString().slice(0, 10)
      : null,
    updatedById: expense.updatedById,
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
    // Read-only oversight (EVE-229): `expense.read` only, so submitting,
    // editing and approving keep their own-department and approval rules.
    const overseenDepartmentIds = organization
      ? []
      : await this.permissions.overseenDepartmentIdsFor(userId, key);
    return {
      organization,
      ...(departmentId ? { departmentId } : {}),
      ...(overseenDepartmentIds.length > 0 ? { overseenDepartmentIds } : {}),
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
      (visibility.overseenDepartmentIds ?? []).includes(expense.departmentId) ||
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
      ...(query.productionId ? { productionId: query.productionId } : {}),
      ...(query.campaignId ? { campaignId: query.campaignId } : {}),
      ...(query.campaignActivityId
        ? { campaignActivityId: query.campaignActivityId }
        : {}),
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
    if (!dto.eventId && !dto.productionId && !dto.campaignId)
      throw expenseOwnerRequired();
    if (dto.campaignActivityId && !dto.campaignId)
      throw expenseActivityOutsideCampaign();
    const event = dto.eventId
      ? await this.repo.findEventContext(dto.eventId)
      : null;
    if (dto.eventId && !event) throw expenseEventNotFound();
    if (event && !event.departmentId) throw expenseEventHasNoDepartment();
    const production = dto.productionId
      ? await this.repo.findProductionContext(dto.productionId)
      : null;
    if (dto.productionId && !production) throw expenseProductionNotFound();
    if (production && !production.departmentId)
      throw expenseProductionHasNoDepartment();
    // When both are given, the event's department is the one of record
    // (matches `findEventContext`'s pre-existing precedence); otherwise
    // whichever side was provided decides it.
    const campaign = dto.campaignId
      ? await this.repo.findCampaignContext(dto.campaignId)
      : null;
    if (dto.campaignId && !campaign) throw expenseCampaignNotFound();
    if (
      dto.campaignId &&
      dto.campaignActivityId &&
      !(await this.repo.activityBelongsToCampaign(
        dto.campaignActivityId,
        dto.campaignId,
      ))
    )
      throw expenseActivityOutsideCampaign();
    // EVE-233: with neither an event nor a production, the campaign's
    // department is the one of record.
    const departmentId =
      event?.departmentId ?? production?.departmentId ?? campaign?.departmentId;
    if (!departmentId) {
      if (event) throw expenseEventHasNoDepartment();
      if (production) throw expenseProductionHasNoDepartment();
      throw expenseCampaignHasNoDepartment();
    }
    const visibility = await this.visibility(userId, "expense.create");
    if (
      !visibility.organization &&
      !(visibility.departmentId && visibility.departmentId === departmentId)
    )
      throw permissionDenied();
    if (dto.supplierId && !(await this.repo.supplierExists(dto.supplierId)))
      throw expenseSupplierNotFound();
    return toResponse(
      await this.repo.create(departmentId, {
        ...(dto.eventId ? { eventId: dto.eventId } : {}),
        ...(dto.productionId ? { productionId: dto.productionId } : {}),
        ...(dto.campaignId ? { campaignId: dto.campaignId } : {}),
        ...(dto.campaignActivityId
          ? { campaignActivityId: dto.campaignActivityId }
          : {}),
        ...(dto.title ? { title: dto.title.trim() } : {}),
        ...(dto.expenseDate ? { expenseDate: new Date(dto.expenseDate) } : {}),
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
    if (
      dto.campaignActivityId &&
      (!expense.campaignId ||
        !(await this.repo.activityBelongsToCampaign(
          dto.campaignActivityId,
          expense.campaignId,
        )))
    )
      throw expenseActivityOutsideCampaign();
    const fields: UpdateExpenseFields = {
      updatedById: userId,
      ...(dto.supplierId !== undefined ? { supplierId: dto.supplierId } : {}),
      ...(dto.campaignActivityId !== undefined
        ? { campaignActivityId: dto.campaignActivityId }
        : {}),
      ...(dto.title !== undefined
        ? { title: dto.title === null ? null : dto.title.trim() }
        : {}),
      ...(dto.expenseDate !== undefined
        ? {
            expenseDate:
              dto.expenseDate === null ? null : new Date(dto.expenseDate),
          }
        : {}),
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

  /** Internal authorization boundary reused by the explicit expense-file
   * surface (mirrors `TasksService.authorize`). */
  async authorize(
    actingUserId: string,
    expenseId: string,
    permissionKey: string,
  ): Promise<ExpenseRecord> {
    return this.load(actingUserId, expenseId, permissionKey);
  }

  /** Rechecks expense attachment scope while the shared unit of work is
   * open (mirrors `TasksService.lockAttachmentFinalization`). */
  async lockAttachmentFinalization(
    tx: Prisma.TransactionClient,
    input: { actingUserId: string; expenseId: string },
  ): Promise<void> {
    const visibility = await this.visibility(
      input.actingUserId,
      "expense.attachment.create",
    );
    const access = await this.repo.lockAttachmentAccess(
      tx,
      input.expenseId,
      visibility,
    );
    if (access === "forbidden" || access === "not_found") {
      if (access === "forbidden" || !visibility.organization)
        throw permissionDenied();
      throw expenseNotFound();
    }
  }

  /** Persists only the expense-owned attachment association. */
  async recordAttachment(
    tx: Prisma.TransactionClient,
    input: { actingUserId: string; expenseId: string; fileId: string },
  ): Promise<void> {
    await this.repo.createAttachment(tx, {
      attachedById: input.actingUserId,
      expenseId: input.expenseId,
      fileId: input.fileId,
    });
  }

  async listAttachmentFileIds(
    actingUserId: string,
    expenseId: string,
    pageNumber: number,
    pageSize: number,
  ): Promise<{ fileIds: string[]; total: number }> {
    await this.authorize(actingUserId, expenseId, "expense.read");
    return this.repo.listAttachmentFileIds(expenseId, pageNumber, pageSize);
  }

  async readAttachmentContext(
    actingUserId: string,
    expenseId: string,
    fileId: string,
  ): Promise<Record<string, never> | null> {
    await this.authorize(actingUserId, expenseId, "expense.read");
    return (await this.repo.hasAttachment(expenseId, fileId)) ? {} : null;
  }
}
