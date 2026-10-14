import type { components } from "@event-platform/api-client";

export type Expense = components["schemas"]["ExpenseResponse"];
export type ExpenseReview = components["schemas"]["ExpenseReviewSummary"];
export type PaginatedExpenses =
  components["schemas"]["PaginatedExpensesResponse"];

export type ExpenseCategory = Expense["category"];
export type ExpenseStatus = Expense["status"];
export type ExpenseReviewOutcome = ExpenseReview["outcome"];

/** The event the "event" control can offer, from `GET /api/v1/events`
 * (already department-scoped server-side, so a manager only sees their own). */
export interface AssignableEvent {
  id: string;
  name: string;
}

/** The supplier choices the "supplier" control can offer. */
export interface AssignableSupplier {
  id: string;
  name: string;
}

export const EXPENSE_CATEGORIES: readonly ExpenseCategory[] = [
  "VENUE",
  "CATERING",
  "TALENT_FEES",
  "MARKETING_MATERIALS",
  "LOGISTICS",
  "EQUIPMENT",
  "STAFFING",
  "MISCELLANEOUS",
];

export const EXPENSE_CATEGORY_LABELS: Record<ExpenseCategory, string> = {
  VENUE: "Venue",
  CATERING: "Catering",
  TALENT_FEES: "Talent fees",
  MARKETING_MATERIALS: "Marketing materials",
  LOGISTICS: "Logistics",
  EQUIPMENT: "Equipment",
  STAFFING: "Staffing",
  MISCELLANEOUS: "Miscellaneous",
};

export const EXPENSE_STATUSES: readonly ExpenseStatus[] = [
  "DRAFT",
  "SUBMITTED",
  "APPROVED",
  "REJECTED",
];

export const EXPENSE_STATUS_LABELS: Record<ExpenseStatus, string> = {
  DRAFT: "Draft",
  SUBMITTED: "Pending approval",
  APPROVED: "Approved",
  REJECTED: "Rejected",
};

export function expenseCategoryLabel(category: ExpenseCategory): string {
  return EXPENSE_CATEGORY_LABELS[category];
}

export function expenseStatusLabel(status: ExpenseStatus): string {
  return EXPENSE_STATUS_LABELS[status];
}

export function expenseStatusVariant(status: ExpenseStatus) {
  if (status === "REJECTED") return "destructive" as const;
  if (status === "SUBMITTED") return "default" as const;
  if (status === "APPROVED") return "secondary" as const;
  return "outline" as const;
}

/** A draft or a rejected expense may be edited and (re)submitted - mirrors
 * the backend's `canEdit` policy exactly (EOM-01). */
export function canEditExpense(status: ExpenseStatus): boolean {
  return status === "DRAFT" || status === "REJECTED";
}

/** Formats an amount with its currency, or a dash when unset. */
export function amountSummary(amount: string | null, currency: string): string {
  if (amount === null) return "—";
  return `${amount} ${currency}`;
}
