import { HttpException } from "@nestjs/common";
import { beforeEach, describe, expect, it, vi } from "vitest";

import type { PermissionScope } from "../src/generated/prisma/client.js";
import type { ExpenseRecord } from "../src/expenses/infrastructure/expenses.repository.js";
import { ExpensesService } from "../src/expenses/expenses.service.js";

const ACTOR = "actor-1";
const OTHER = "actor-2";

function makeExpense(overrides: Partial<ExpenseRecord> = {}): ExpenseRecord {
  return {
    id: "exp-1",
    eventId: "evt-1",
    departmentId: "dept-1",
    supplierId: null,
    category: "VENUE",
    description: "Hall rental",
    plannedAmount: null,
    actualAmount: { toFixed: () => "1200.00" } as never,
    currency: "USD",
    status: "DRAFT",
    createdById: ACTOR,
    submittedAt: null,
    reviewedAt: null,
    reviewerId: null,
    reviews: [],
    createdAt: new Date("2026-01-01T00:00:00.000Z"),
    updatedAt: new Date("2026-01-02T00:00:00.000Z"),
    ...overrides,
  };
}

async function expectCode(
  promise: Promise<unknown>,
  code: string,
): Promise<void> {
  await expect(promise).rejects.toBeInstanceOf(HttpException);
  await promise.catch((error: unknown) => {
    const response = (error as HttpException).getResponse() as {
      code?: string;
    };
    expect(response.code).toBe(code);
  });
}

describe("ExpensesService", () => {
  let repo: {
    findUserDepartmentId: ReturnType<typeof vi.fn>;
    findEventContext: ReturnType<typeof vi.fn>;
    supplierExists: ReturnType<typeof vi.fn>;
    findById: ReturnType<typeof vi.fn>;
    findVisibleById: ReturnType<typeof vi.fn>;
    list: ReturnType<typeof vi.fn>;
    create: ReturnType<typeof vi.fn>;
    updateDraft: ReturnType<typeof vi.fn>;
    submit: ReturnType<typeof vi.fn>;
    review: ReturnType<typeof vi.fn>;
  };
  let permissions: {
    getEffectiveGrants: ReturnType<typeof vi.fn>;
  };
  let service: ExpensesService;

  beforeEach(() => {
    repo = {
      findUserDepartmentId: vi.fn().mockResolvedValue(null),
      findEventContext: vi.fn().mockResolvedValue({ departmentId: "dept-1" }),
      supplierExists: vi.fn().mockResolvedValue(true),
      findById: vi.fn().mockResolvedValue(makeExpense()),
      findVisibleById: vi.fn(),
      list: vi.fn().mockResolvedValue({ items: [], total: 0 }),
      create: vi.fn().mockResolvedValue(makeExpense()),
      updateDraft: vi.fn().mockResolvedValue(makeExpense()),
      submit: vi.fn().mockResolvedValue(makeExpense({ status: "SUBMITTED" })),
      review: vi.fn().mockResolvedValue(makeExpense({ status: "APPROVED" })),
    };
    permissions = { getEffectiveGrants: vi.fn().mockResolvedValue([]) };
    service = new ExpensesService(repo as never, permissions as never);
  });

  function grantOnly(...allowed: [string, PermissionScope][]): void {
    permissions.getEffectiveGrants.mockResolvedValue(
      allowed.map(([permissionKey, scope]) => ({ permissionKey, scope })),
    );
  }

  describe("create", () => {
    it("is denied without expense.create", async () => {
      grantOnly();
      await expectCode(
        service.create(ACTOR, {
          eventId: "evt-1",
          category: "VENUE",
          description: "x",
          actualAmount: 10,
          currency: "USD",
        }),
        "PERMISSION_DENIED",
      );
    });

    it("404s when the event does not exist", async () => {
      grantOnly(["expense.create", "ORGANIZATION"]);
      repo.findEventContext.mockResolvedValue(null);
      await expectCode(
        service.create(ACTOR, {
          eventId: "missing",
          category: "VENUE",
          description: "x",
          actualAmount: 10,
          currency: "USD",
        }),
        "EXPENSE_EVENT_NOT_FOUND",
      );
    });

    it("rejects an event with no department", async () => {
      grantOnly(["expense.create", "ORGANIZATION"]);
      repo.findEventContext.mockResolvedValue({ departmentId: null });
      await expectCode(
        service.create(ACTOR, {
          eventId: "evt-1",
          category: "VENUE",
          description: "x",
          actualAmount: 10,
          currency: "USD",
        }),
        "EXPENSE_EVENT_HAS_NO_DEPARTMENT",
      );
    });

    it("denies a department-scoped caller whose department does not match the event's", async () => {
      grantOnly(["expense.create", "DEPARTMENT"]);
      repo.findUserDepartmentId.mockResolvedValue("dept-2");
      repo.findEventContext.mockResolvedValue({ departmentId: "dept-1" });
      await expectCode(
        service.create(ACTOR, {
          eventId: "evt-1",
          category: "VENUE",
          description: "x",
          actualAmount: 10,
          currency: "USD",
        }),
        "PERMISSION_DENIED",
      );
      expect(repo.create).not.toHaveBeenCalled();
    });

    it("succeeds for a department-scoped caller matching the event's department", async () => {
      grantOnly(["expense.create", "DEPARTMENT"]);
      repo.findUserDepartmentId.mockResolvedValue("dept-1");
      await expect(
        service.create(ACTOR, {
          eventId: "evt-1",
          category: "VENUE",
          description: "x",
          actualAmount: 10,
          currency: "USD",
        }),
      ).resolves.toBeDefined();
      expect(repo.create).toHaveBeenCalledWith(
        "dept-1",
        expect.objectContaining({ eventId: "evt-1", createdById: ACTOR }),
      );
    });

    it("404s when the supplier does not exist", async () => {
      grantOnly(["expense.create", "ORGANIZATION"]);
      repo.supplierExists.mockResolvedValue(false);
      await expectCode(
        service.create(ACTOR, {
          eventId: "evt-1",
          supplierId: "ghost",
          category: "VENUE",
          description: "x",
          actualAmount: 10,
          currency: "USD",
        }),
        "EXPENSE_SUPPLIER_NOT_FOUND",
      );
    });
  });

  describe("update", () => {
    it("allows editing a DRAFT expense", async () => {
      grantOnly(["expense.update", "ORGANIZATION"]);
      repo.findById.mockResolvedValue(makeExpense({ status: "DRAFT" }));
      await expect(
        service.update(ACTOR, "exp-1", { description: "Updated" }),
      ).resolves.toBeDefined();
    });

    it("allows editing a REJECTED expense (reject -> edit -> resubmit)", async () => {
      grantOnly(["expense.update", "ORGANIZATION"]);
      repo.findById.mockResolvedValue(makeExpense({ status: "REJECTED" }));
      await expect(
        service.update(ACTOR, "exp-1", { description: "Updated" }),
      ).resolves.toBeDefined();
    });

    it("rejects editing a SUBMITTED expense", async () => {
      grantOnly(["expense.update", "ORGANIZATION"]);
      repo.findById.mockResolvedValue(makeExpense({ status: "SUBMITTED" }));
      await expectCode(
        service.update(ACTOR, "exp-1", { description: "Updated" }),
        "EXPENSE_INVALID_TRANSITION",
      );
    });

    it("rejects editing an APPROVED expense", async () => {
      grantOnly(["expense.update", "ORGANIZATION"]);
      repo.findById.mockResolvedValue(makeExpense({ status: "APPROVED" }));
      await expectCode(
        service.update(ACTOR, "exp-1", { description: "Updated" }),
        "EXPENSE_INVALID_TRANSITION",
      );
    });
  });

  describe("submit", () => {
    it("submits a DRAFT expense", async () => {
      grantOnly(["expense.submit", "ORGANIZATION"]);
      repo.findById.mockResolvedValue(makeExpense({ status: "DRAFT" }));
      await expect(
        service.submit(ACTOR, "exp-1", "req-1"),
      ).resolves.toMatchObject({ status: "SUBMITTED" });
    });

    it("rejects submitting a non-DRAFT expense", async () => {
      grantOnly(["expense.submit", "ORGANIZATION"]);
      repo.findById.mockResolvedValue(makeExpense({ status: "SUBMITTED" }));
      await expectCode(
        service.submit(ACTOR, "exp-1", "req-1"),
        "EXPENSE_INVALID_TRANSITION",
      );
    });
  });

  describe("review", () => {
    it("requires expense.approve", async () => {
      grantOnly();
      repo.findById.mockResolvedValue(
        makeExpense({ status: "SUBMITTED", createdById: OTHER }),
      );
      await expectCode(
        service.review(ACTOR, "exp-1", { outcome: "APPROVED" }, "req-1"),
        "PERMISSION_DENIED",
      );
    });

    it("rejects reviewing a non-SUBMITTED expense", async () => {
      grantOnly(["expense.approve", "ORGANIZATION"]);
      repo.findById.mockResolvedValue(
        makeExpense({ status: "DRAFT", createdById: OTHER }),
      );
      await expectCode(
        service.review(ACTOR, "exp-1", { outcome: "APPROVED" }, "req-1"),
        "EXPENSE_INVALID_TRANSITION",
      );
    });

    it("blocks the approver from reviewing their own submitted expense (separation of duties)", async () => {
      grantOnly(["expense.approve", "ORGANIZATION"]);
      repo.findById.mockResolvedValue(
        makeExpense({ status: "SUBMITTED", createdById: ACTOR }),
      );
      await expectCode(
        service.review(ACTOR, "exp-1", { outcome: "APPROVED" }, "req-1"),
        "PERMISSION_DENIED",
      );
      expect(repo.review).not.toHaveBeenCalled();
    });

    it("approves a submitted expense from a different author", async () => {
      grantOnly(["expense.approve", "ORGANIZATION"]);
      repo.findById.mockResolvedValue(
        makeExpense({ status: "SUBMITTED", createdById: OTHER }),
      );
      await expect(
        service.review(ACTOR, "exp-1", { outcome: "APPROVED" }, "req-1"),
      ).resolves.toMatchObject({ status: "APPROVED" });
    });
  });

  describe("department isolation", () => {
    it("get is denied for a department-scoped caller on another department's expense", async () => {
      grantOnly(["expense.read", "DEPARTMENT"]);
      repo.findUserDepartmentId.mockResolvedValue("dept-1");
      repo.findById.mockResolvedValue(makeExpense({ departmentId: "dept-2" }));
      await expectCode(service.get(ACTOR, "exp-1"), "PERMISSION_DENIED");
    });

    it("get succeeds for a department-scoped caller on their own department's expense", async () => {
      grantOnly(["expense.read", "DEPARTMENT"]);
      repo.findUserDepartmentId.mockResolvedValue("dept-1");
      repo.findById.mockResolvedValue(makeExpense({ departmentId: "dept-1" }));
      await expect(service.get(ACTOR, "exp-1")).resolves.toBeDefined();
    });
  });
});
