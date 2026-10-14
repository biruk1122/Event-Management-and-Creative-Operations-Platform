import { browserApi } from "@/lib/api/browser";
import { readCsrfToken } from "@/lib/api/csrf";
import { fieldErrorsOf, isProblemDetails } from "@/lib/api/problem-details";

import type {
  CreateExpense,
  CreateExpenseOutcome,
  CreateExpenseValues,
  EditExpenseValues,
  GetExpense,
  ReviewExpense,
  SubmitExpense,
  UpdateExpense,
  UpdateExpenseOutcome,
} from "../lib/expenses-outcome";
import type {
  AssignableEvent,
  AssignableSupplier,
  ExpenseCategory,
  ExpenseStatus,
  PaginatedExpenses,
} from "../lib/expenses-types";

/** Thrown by the read helpers when the API does not return a usable body. */
export class ExpensesRequestError extends Error {
  constructor(readonly status: number) {
    super(
      status === 401
        ? "Your session expired. Sign in again."
        : status === 403
          ? "You do not have access to this area."
          : status === 404
            ? "This expense no longer exists. Refresh the list."
            : "We could not load the data. Try again.",
    );
    this.name = "ExpensesRequestError";
  }
}

function headers() {
  const token = readCsrfToken();
  return token ? { "x-csrf-token": token } : {};
}

function createBody(values: CreateExpenseValues) {
  return {
    eventId: values.eventId,
    ...(values.supplierId ? { supplierId: values.supplierId } : {}),
    category: values.category,
    description: values.description.trim(),
    ...(values.plannedAmount.trim()
      ? { plannedAmount: Number(values.plannedAmount) }
      : {}),
    actualAmount: Number(values.actualAmount),
    currency: values.currency.trim().toUpperCase(),
  };
}

function updateBody(values: EditExpenseValues) {
  return {
    supplierId: values.supplierId,
    category: values.category,
    description: values.description.trim(),
    plannedAmount: values.plannedAmount.trim()
      ? Number(values.plannedAmount)
      : null,
    actualAmount: Number(values.actualAmount),
    currency: values.currency.trim().toUpperCase(),
  };
}

function createFailure(error: unknown, status: number): CreateExpenseOutcome {
  if (isProblemDetails(error)) {
    if (error.code === "EXPENSE_EVENT_NOT_FOUND")
      return { status: "event_not_found" };
    if (error.code === "EXPENSE_EVENT_HAS_NO_DEPARTMENT")
      return { status: "event_has_no_department" };
    if (error.code === "EXPENSE_SUPPLIER_NOT_FOUND")
      return { status: "supplier_not_found" };
    if (error.code === "VALIDATION_ERROR") {
      const fields = fieldErrorsOf(error);
      const fieldErrors: Partial<Record<keyof CreateExpenseValues, string>> =
        {};
      for (const key of [
        "eventId",
        "supplierId",
        "category",
        "description",
        "plannedAmount",
        "actualAmount",
        "currency",
      ] as const) {
        if (fields[key]) fieldErrors[key] = fields[key];
      }
      if (Object.keys(fieldErrors).length > 0) {
        return { status: "field_errors", fieldErrors };
      }
    }
  }
  if (status === 401 || status === 403) return { status: "permission_denied" };
  return { status: "unexpected" };
}

function updateFailure(error: unknown, status: number): UpdateExpenseOutcome {
  if (isProblemDetails(error)) {
    if (error.code === "EXPENSE_NOT_FOUND") return { status: "not_found" };
    if (error.code === "EXPENSE_INVALID_TRANSITION")
      return { status: "invalid_transition" };
    if (error.code === "EXPENSE_SUPPLIER_NOT_FOUND")
      return { status: "supplier_not_found" };
    if (error.code === "VALIDATION_ERROR") {
      const fields = fieldErrorsOf(error);
      const fieldErrors: Partial<Record<keyof EditExpenseValues, string>> = {};
      for (const key of [
        "supplierId",
        "category",
        "description",
        "plannedAmount",
        "actualAmount",
        "currency",
      ] as const) {
        if (fields[key]) fieldErrors[key] = fields[key];
      }
      if (Object.keys(fieldErrors).length > 0) {
        return { status: "field_errors", fieldErrors };
      }
    }
  }
  if (status === 401 || status === 403) return { status: "permission_denied" };
  return { status: "unexpected" };
}

export interface ListExpensesParams {
  status?: ExpenseStatus | null;
  category?: ExpenseCategory | null;
  eventId?: string | null;
  page?: number;
  pageSize?: number;
}

export async function listExpenses(
  params: ListExpensesParams,
  signal?: AbortSignal,
): Promise<PaginatedExpenses> {
  const query: Record<string, string | number> = {
    page: params.page ?? 1,
    pageSize: params.pageSize ?? 25,
  };
  if (params.status) query.status = params.status;
  if (params.category) query.category = params.category;
  if (params.eventId) query.eventId = params.eventId;

  const { data, response } = await browserApi.GET("/api/v1/expenses", {
    params: { query: query as never },
    ...(signal ? { signal } : {}),
    cache: "no-store",
  });
  if (!data) throw new ExpensesRequestError(response.status);
  return data;
}

/** Events the "event" control can offer, from the first page of `GET /api/v1/events`
 * (department-scoped server-side, so a manager only sees their own department's). */
export async function listAssignableEvents(
  signal?: AbortSignal,
): Promise<AssignableEvent[]> {
  const { data } = await browserApi.GET("/api/v1/events", {
    params: { query: { pageSize: 100 } as never },
    ...(signal ? { signal } : {}),
    cache: "no-store",
  });
  return (data?.items ?? []).map((event) => ({
    id: event.id,
    name: event.name,
  }));
}

/** Suppliers the "supplier" control can offer, from the first page of `GET /api/v1/suppliers`. */
export async function listAssignableSuppliers(
  signal?: AbortSignal,
): Promise<AssignableSupplier[]> {
  const { data } = await browserApi.GET("/api/v1/suppliers", {
    params: { query: { pageSize: 100 } as never },
    ...(signal ? { signal } : {}),
    cache: "no-store",
  });
  return (data?.items ?? []).map((supplier) => ({
    id: supplier.id,
    name: supplier.name,
  }));
}

/** Resolves `null` for any non-OK response so the detail dialog shows its error state. */
export const getExpense: GetExpense = async (id) => {
  const { data } = await browserApi.GET("/api/v1/expenses/{id}", {
    params: { path: { id } },
    cache: "no-store",
  });
  return data ?? null;
};

export const createExpense: CreateExpense = async (values) => {
  try {
    const { data, error, response } = await browserApi.POST(
      "/api/v1/expenses",
      { body: createBody(values), headers: headers() },
    );
    return data
      ? { status: "success", expense: data }
      : createFailure(error, response.status);
  } catch {
    return { status: "unexpected" };
  }
};

export const updateExpense: UpdateExpense = async (id, values) => {
  try {
    const { data, error, response } = await browserApi.PATCH(
      "/api/v1/expenses/{id}",
      {
        params: { path: { id } },
        body: updateBody(values),
        headers: headers(),
      },
    );
    return data
      ? { status: "success", expense: data }
      : updateFailure(error, response.status);
  } catch {
    return { status: "unexpected" };
  }
};

export const submitExpense: SubmitExpense = async (id) => {
  try {
    const { data, error, response } = await browserApi.POST(
      "/api/v1/expenses/{id}/submit",
      { params: { path: { id } }, headers: headers() },
    );
    if (data) return { status: "success", expense: data };
    if (isProblemDetails(error)) {
      if (error.code === "EXPENSE_NOT_FOUND") return { status: "not_found" };
      if (error.code === "EXPENSE_INVALID_TRANSITION")
        return { status: "invalid_transition" };
    }
    if (response.status === 401 || response.status === 403)
      return { status: "permission_denied" };
    return { status: "unexpected" };
  } catch {
    return { status: "unexpected" };
  }
};

export const reviewExpense: ReviewExpense = async (id, outcome, note) => {
  try {
    const { data, error, response } = await browserApi.POST(
      "/api/v1/expenses/{id}/reviews",
      {
        params: { path: { id } },
        body: { outcome, ...(note ? { note } : {}) },
        headers: headers(),
      },
    );
    if (data) return { status: "success", expense: data };
    if (isProblemDetails(error)) {
      if (error.code === "EXPENSE_NOT_FOUND") return { status: "not_found" };
      if (error.code === "EXPENSE_INVALID_TRANSITION")
        return { status: "invalid_transition" };
    }
    if (response.status === 401 || response.status === 403)
      return { status: "permission_denied" };
    return { status: "unexpected" };
  } catch {
    return { status: "unexpected" };
  }
};
