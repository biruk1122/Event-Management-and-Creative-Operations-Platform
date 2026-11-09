import { describe, expect, it } from "vitest";

import { computeBudgetFigures } from "../src/campaigns/campaign-budget.domain.js";
import { Prisma } from "../src/generated/prisma/client.js";

const d = (value: string) => new Prisma.Decimal(value);

describe("campaign budget figures (EVE-233)", () => {
  it("counts approved and submitted spending exactly, and nothing else", () => {
    const figures = computeBudgetFigures({
      budgetAmount: d("1000.00"),
      budgetCurrency: "ETB",
      expenses: [
        {
          status: "APPROVED",
          currency: "ETB",
          amount: d("100.10"),
          count: 2,
          campaignActivityId: "a",
        },
        {
          status: "SUBMITTED",
          currency: "ETB",
          amount: d("200.20"),
          count: 1,
          campaignActivityId: null,
        },
        {
          status: "DRAFT",
          currency: "ETB",
          amount: d("999.00"),
          count: 1,
          campaignActivityId: null,
        },
        {
          status: "REJECTED",
          currency: "ETB",
          amount: d("999.00"),
          count: 1,
          campaignActivityId: "a",
        },
      ],
      partnerships: [],
    });
    expect(figures).toMatchObject({
      currency: "ETB",
      allocated: "1000.00",
      approved: "100.10",
      pending: "200.20",
      spent: "300.30",
      remaining: "699.70",
      utilizationPercent: 30,
      overBudget: false,
      otherCurrencyExpenseCount: 0,
    });
    expect(figures.byActivity).toEqual([
      { campaignActivityId: null, spent: "200.20" },
      { campaignActivityId: "a", spent: "100.10" },
    ]);
  });

  it("avoids floating point drift on cents", () => {
    const figures = computeBudgetFigures({
      budgetAmount: d("0.30"),
      budgetCurrency: "USD",
      expenses: [
        {
          status: "APPROVED",
          currency: "USD",
          amount: d("0.10"),
          count: 1,
          campaignActivityId: null,
        },
        {
          status: "APPROVED",
          currency: "USD",
          amount: d("0.20"),
          count: 1,
          campaignActivityId: "b",
        },
      ],
      partnerships: [],
    });
    expect(figures.spent).toBe("0.30");
    expect(figures.remaining).toBe("0.00");
    expect(figures.utilizationPercent).toBe(100);
  });

  it("flags overspending and leaves other currencies out of the totals", () => {
    const figures = computeBudgetFigures({
      budgetAmount: d("100.00"),
      budgetCurrency: "ETB",
      expenses: [
        {
          status: "APPROVED",
          currency: "ETB",
          amount: d("150.00"),
          count: 1,
          campaignActivityId: null,
        },
        {
          status: "APPROVED",
          currency: "USD",
          amount: d("10.00"),
          count: 3,
          campaignActivityId: null,
        },
      ],
      partnerships: [],
    });
    expect(figures.remaining).toBe("-50.00");
    expect(figures.overBudget).toBe(true);
    expect(figures.utilizationPercent).toBe(150);
    expect(figures.otherCurrencyExpenseCount).toBe(3);
  });

  it("never adds a partnership's agreed value to spending", () => {
    const figures = computeBudgetFigures({
      budgetAmount: d("1000.00"),
      budgetCurrency: "ETB",
      expenses: [],
      partnerships: [
        { status: "COMMITTED", amount: d("500.00"), currency: "ETB" },
        { status: "COMPLETED", amount: d("250.00"), currency: "ETB" },
        { status: "IN_DISCUSSION", amount: d("9000.00"), currency: "ETB" },
        { status: "COMMITTED", amount: d("40.00"), currency: "USD" },
      ],
    });
    expect(figures.spent).toBe("0.00");
    expect(figures.remaining).toBe("1000.00");
    expect(figures.committedPartnershipValue).toBe("750.00");
    expect(figures.otherCurrencyPartnershipCount).toBe(1);
  });

  it("has no remaining or utilization without a budget", () => {
    const figures = computeBudgetFigures({
      budgetAmount: null,
      budgetCurrency: null,
      expenses: [
        {
          status: "APPROVED",
          currency: "ETB",
          amount: d("80.00"),
          count: 1,
          campaignActivityId: null,
        },
      ],
      partnerships: [],
    });
    expect(figures).toMatchObject({
      currency: "ETB",
      allocated: null,
      spent: "80.00",
      remaining: null,
      utilizationPercent: null,
      overBudget: false,
    });
  });
});
