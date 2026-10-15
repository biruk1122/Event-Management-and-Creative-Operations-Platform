import { beforeEach, describe, expect, it, vi } from "vitest";

import { createExpense } from "./expenses-gateway";
import type { CreateExpenseValues } from "../lib/expenses-outcome";

const { get, post } = vi.hoisted(() => ({ get: vi.fn(), post: vi.fn() }));
vi.mock("@/lib/api/browser", () => ({
  browserApi: { GET: get, POST: post },
}));
vi.mock("@/lib/api/csrf", () => ({ readCsrfToken: () => "test-csrf" }));

const BASE_VALUES: CreateExpenseValues = {
  eventId: null,
  productionId: null,
  supplierId: null,
  category: "VENUE",
  description: "Rehearsal space",
  plannedAmount: "",
  actualAmount: "500",
  currency: "usd",
};

beforeEach(() => vi.resetAllMocks());

describe("expenses API gateway - direct production expenses", () => {
  it("sends productionId (and omits eventId) when creating against a production", async () => {
    post.mockResolvedValue({
      data: { id: "exp-1", eventId: null, productionId: "prod-1" },
      error: undefined,
      response: { status: 201, ok: true },
    });
    const outcome = await createExpense({
      ...BASE_VALUES,
      productionId: "prod-1",
    });
    expect(outcome.status).toBe("success");
    expect(post).toHaveBeenCalledWith(
      "/api/v1/expenses",
      expect.objectContaining({
        body: expect.not.objectContaining({ eventId: expect.anything() }),
      }),
    );
    expect(post).toHaveBeenCalledWith(
      "/api/v1/expenses",
      expect.objectContaining({
        body: expect.objectContaining({ productionId: "prod-1" }),
      }),
    );
  });

  it("maps EXPENSE_PRODUCTION_NOT_FOUND to a typed outcome", async () => {
    post.mockResolvedValue({
      data: undefined,
      error: { code: "EXPENSE_PRODUCTION_NOT_FOUND", status: 404 },
      response: { status: 404, ok: false },
    });
    const outcome = await createExpense({
      ...BASE_VALUES,
      productionId: "missing",
    });
    expect(outcome.status).toBe("production_not_found");
  });

  it("maps EXPENSE_OWNER_REQUIRED to a typed outcome", async () => {
    post.mockResolvedValue({
      data: undefined,
      error: { code: "EXPENSE_OWNER_REQUIRED", status: 400 },
      response: { status: 400, ok: false },
    });
    const outcome = await createExpense(BASE_VALUES);
    expect(outcome.status).toBe("owner_required");
  });
});
