import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";

import {
  amountSummary,
  expenseCategoryLabel,
  expenseStatusLabel,
  expenseStatusVariant,
  type AssignableEvent,
  type Expense,
} from "../lib/expenses-types";

interface ExpensesTableProps {
  expenses: readonly Expense[];
  events: readonly AssignableEvent[];
  onSelect: (id: string) => void;
  page: number;
  pageCount: number;
  onPageChange: (page: number) => void;
  /** Shown when a filter is active and nothing matched. */
  filtered: boolean;
}

function eventName(events: readonly AssignableEvent[], eventId: string | null) {
  if (eventId === null) return "Production expense";
  return events.find((event) => event.id === eventId)?.name ?? "Unknown event";
}

export function ExpensesTable({
  expenses,
  events,
  onSelect,
  page,
  pageCount,
  onPageChange,
  filtered,
}: ExpensesTableProps) {
  if (expenses.length === 0) {
    return (
      <div className="border-border rounded-xl border border-dashed py-12 text-center">
        <p className="text-sm font-medium">
          {filtered ? "No expenses match these filters" : "No expenses yet"}
        </p>
        <p className="text-muted-foreground mt-1 text-sm">
          {filtered
            ? "Clear the filters or adjust your search."
            : "Use the New expense button above to create the first one."}
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Tablet and desktop: a data table. */}
      <div className="border-border hidden overflow-x-auto rounded-xl border sm:block">
        <table className="w-full text-left text-sm">
          <thead className="text-muted-foreground border-border border-b text-xs">
            <tr>
              <th scope="col" className="px-4 py-3 font-medium">
                Description
              </th>
              <th scope="col" className="px-4 py-3 font-medium">
                Category
              </th>
              <th scope="col" className="px-4 py-3 font-medium">
                Event
              </th>
              <th scope="col" className="px-4 py-3 font-medium">
                Amount
              </th>
              <th scope="col" className="px-4 py-3 font-medium">
                Status
              </th>
            </tr>
          </thead>
          <tbody className="divide-border divide-y">
            {expenses.map((expense) => (
              <tr key={expense.id} className="hover:bg-muted/50">
                <th scope="row" className="px-4 py-3 font-normal">
                  <button
                    type="button"
                    className="focus-visible:ring-ring/50 rounded text-sm font-medium underline-offset-4 hover:underline focus-visible:ring-3 focus-visible:outline-none"
                    onClick={() => onSelect(expense.id)}
                  >
                    {expense.description}
                  </button>
                </th>
                <td className="text-muted-foreground px-4 py-3">
                  {expenseCategoryLabel(expense.category)}
                </td>
                <td className="text-muted-foreground px-4 py-3">
                  {eventName(events, expense.eventId)}
                </td>
                <td className="text-muted-foreground px-4 py-3">
                  {amountSummary(expense.actualAmount, expense.currency)}
                </td>
                <td className="px-4 py-3">
                  <Badge variant={expenseStatusVariant(expense.status)}>
                    {expenseStatusLabel(expense.status)}
                  </Badge>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Mobile: a stacked card list. */}
      <ul className="space-y-3 sm:hidden">
        {expenses.map((expense) => (
          <li key={expense.id} className="border-border rounded-xl border p-4">
            <button
              type="button"
              className="focus-visible:ring-ring/50 block w-full rounded text-left focus-visible:ring-3 focus-visible:outline-none"
              onClick={() => onSelect(expense.id)}
            >
              <span className="flex flex-wrap items-center gap-2 text-sm font-medium">
                {expense.description}
                <Badge variant={expenseStatusVariant(expense.status)}>
                  {expenseStatusLabel(expense.status)}
                </Badge>
              </span>
              <span className="text-muted-foreground mt-1 block text-sm">
                {expenseCategoryLabel(expense.category)} ·{" "}
                {eventName(events, expense.eventId)}
              </span>
              <span className="text-muted-foreground mt-1 block text-sm">
                {amountSummary(expense.actualAmount, expense.currency)}
              </span>
            </button>
          </li>
        ))}
      </ul>

      {pageCount > 1 ? (
        <nav
          aria-label="Expenses pagination"
          className="flex items-center justify-between gap-3"
        >
          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={page <= 1}
            onClick={() => onPageChange(page - 1)}
          >
            Previous
          </Button>
          <span className="text-muted-foreground text-sm">
            Page {page} of {pageCount}
          </span>
          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={page >= pageCount}
            onClick={() => onPageChange(page + 1)}
          >
            Next
          </Button>
        </nav>
      ) : null}
    </div>
  );
}
