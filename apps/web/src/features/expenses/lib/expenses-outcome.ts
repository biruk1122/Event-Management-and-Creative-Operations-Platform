import type {
  Expense,
  ExpenseCategory,
  ExpenseReviewOutcome,
} from "./expenses-types";

/** The fields the create form collects. */
export interface CreateExpenseValues {
  eventId: string;
  supplierId: string | null;
  category: ExpenseCategory;
  description: string;
  plannedAmount: string;
  actualAmount: string;
  currency: string;
}

/** The fields the edit form collects (the event is fixed at creation). */
export interface EditExpenseValues {
  supplierId: string | null;
  category: ExpenseCategory;
  description: string;
  plannedAmount: string;
  actualAmount: string;
  currency: string;
}

type FieldErrors<K extends string> = Partial<Record<K, string>>;

/** Result of `POST /expenses`. */
export type CreateExpenseOutcome =
  | { status: "success"; expense: Expense }
  | { status: "event_not_found" }
  | { status: "event_has_no_department" }
  | { status: "supplier_not_found" }
  | {
      status: "field_errors";
      fieldErrors: FieldErrors<keyof CreateExpenseValues>;
    }
  | { status: "permission_denied" }
  | { status: "unexpected" };

export type CreateExpense = (
  values: CreateExpenseValues,
) => Promise<CreateExpenseOutcome>;

/** Result of `PATCH /expenses/:id`. */
export type UpdateExpenseOutcome =
  | { status: "success"; expense: Expense }
  | { status: "invalid_transition" }
  | { status: "supplier_not_found" }
  | {
      status: "field_errors";
      fieldErrors: FieldErrors<keyof EditExpenseValues>;
    }
  | { status: "not_found" }
  | { status: "permission_denied" }
  | { status: "unexpected" };

export type UpdateExpense = (
  id: string,
  values: EditExpenseValues,
) => Promise<UpdateExpenseOutcome>;

/** Result of `POST /expenses/:id/submit`. */
export type SubmitExpenseOutcome =
  | { status: "success"; expense: Expense }
  | { status: "invalid_transition" }
  | { status: "not_found" }
  | { status: "permission_denied" }
  | { status: "unexpected" };

export type SubmitExpense = (id: string) => Promise<SubmitExpenseOutcome>;

/** Result of `POST /expenses/:id/reviews`. Super Admin only - `expense.approve`
 * is never granted to a Department Manager (EOM-01). */
export type ReviewExpenseOutcome =
  | { status: "success"; expense: Expense }
  | { status: "invalid_transition" }
  | { status: "not_found" }
  | { status: "permission_denied" }
  | { status: "unexpected" };

export type ReviewExpense = (
  id: string,
  outcome: ExpenseReviewOutcome,
  note: string | null,
) => Promise<ReviewExpenseOutcome>;

/** Loads one expense for the detail dialog; resolves `null` when it cannot. */
export type GetExpense = (id: string) => Promise<Expense | null>;
