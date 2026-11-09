import { Prisma } from "../generated/prisma/client.js";

/**
 * Campaign budget arithmetic (EVE-233), kept apart from persistence so it can
 * be tested on its own.
 *
 * - Spent is what was submitted for approval or approved. Drafts are not
 *   spending yet, and rejected expenses never were.
 * - Only expenses in the budget's currency are added up; others are counted
 *   so the screen can say some were left out. Nothing is converted.
 * - A partnership's agreed value is a commitment, reported separately, and is
 *   never added to spending.
 */

export interface ExpenseSum {
  status: "DRAFT" | "SUBMITTED" | "APPROVED" | "REJECTED";
  currency: string;
  amount: Prisma.Decimal;
  count: number;
  campaignActivityId: string | null;
}

export interface PartnershipValue {
  status: string;
  amount: Prisma.Decimal | null;
  currency: string | null;
}

export interface BudgetFigures {
  currency: string | null;
  allocated: string | null;
  approved: string;
  pending: string;
  spent: string;
  remaining: string | null;
  utilizationPercent: number | null;
  overBudget: boolean;
  otherCurrencyExpenseCount: number;
  byActivity: { campaignActivityId: string | null; spent: string }[];
  committedPartnershipValue: string;
  otherCurrencyPartnershipCount: number;
}

/** Partnerships whose value is agreed, not just proposed. */
const COMMITTED_PARTNER_STATUSES = new Set(["COMMITTED", "COMPLETED"]);

const ZERO = new Prisma.Decimal(0);

export function computeBudgetFigures(input: {
  budgetAmount: Prisma.Decimal | null;
  budgetCurrency: string | null;
  expenses: readonly ExpenseSum[];
  partnerships: readonly PartnershipValue[];
}): BudgetFigures {
  const counted = input.expenses.filter(
    (row) => row.status === "APPROVED" || row.status === "SUBMITTED",
  );
  // Without a budget, the expenses' own currency is used when they all share
  // one; with several currencies and no budget, nothing can be added up.
  const currencies = new Set(counted.map((row) => row.currency.trim()));
  const currency =
    input.budgetCurrency?.trim() ??
    (currencies.size === 1 ? [...currencies][0]! : null);

  let approved = ZERO;
  let pending = ZERO;
  let otherCurrencyExpenseCount = 0;
  const byActivity = new Map<string | null, Prisma.Decimal>();
  for (const row of counted) {
    if (currency === null || row.currency.trim() !== currency) {
      otherCurrencyExpenseCount += row.count;
      continue;
    }
    if (row.status === "APPROVED") approved = approved.plus(row.amount);
    else pending = pending.plus(row.amount);
    byActivity.set(
      row.campaignActivityId,
      (byActivity.get(row.campaignActivityId) ?? ZERO).plus(row.amount),
    );
  }
  const spent = approved.plus(pending);

  const allocated =
    input.budgetAmount === null ? null : new Prisma.Decimal(input.budgetAmount);
  const remaining = allocated === null ? null : allocated.minus(spent);
  const utilizationPercent =
    allocated === null || allocated.isZero()
      ? null
      : spent.dividedBy(allocated).times(100).toDecimalPlaces(1).toNumber();

  let committed = ZERO;
  let otherCurrencyPartnershipCount = 0;
  for (const partner of input.partnerships) {
    if (!COMMITTED_PARTNER_STATUSES.has(partner.status)) continue;
    if (partner.amount === null) continue;
    if (currency === null || partner.currency?.trim() !== currency) {
      otherCurrencyPartnershipCount += 1;
      continue;
    }
    committed = committed.plus(partner.amount);
  }

  return {
    currency,
    allocated: allocated === null ? null : allocated.toFixed(2),
    approved: approved.toFixed(2),
    pending: pending.toFixed(2),
    spent: spent.toFixed(2),
    remaining: remaining === null ? null : remaining.toFixed(2),
    utilizationPercent,
    overBudget: remaining !== null && remaining.isNegative(),
    otherCurrencyExpenseCount,
    byActivity: [...byActivity.entries()]
      .map(([campaignActivityId, amount]) => ({
        campaignActivityId,
        spent: amount.toFixed(2),
      }))
      .sort((a, b) =>
        (a.campaignActivityId ?? "").localeCompare(b.campaignActivityId ?? ""),
      ),
    committedPartnershipValue: committed.toFixed(2),
    otherCurrencyPartnershipCount,
  };
}
