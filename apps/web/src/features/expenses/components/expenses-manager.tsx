"use client";

import { useEffect, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Plus } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  accessKey,
  type CurrentAccess,
} from "@/features/auth/api/access-queries";

import {
  ExpensesRequestError,
  listAssignableEvents,
  listAssignableSuppliers,
  listExpenses,
} from "../api/expenses-gateway";
import { expenseKeys, useExpensesMutations } from "../api/expenses-queries";
import { expenseAbilities } from "../lib/expense-access";
import type { ExpenseCategory, ExpenseStatus } from "../lib/expenses-types";
import { CreateExpenseDialog } from "./create-expense-dialog";
import { ExpenseDetailDialog } from "./expense-detail-dialog";
import { ExpensesFilters } from "./expenses-filters";
import { ExpensesTable } from "./expenses-table";

const PAGE_SIZE = 10;

export function ExpensesManager({ access }: { access: CurrentAccess }) {
  const keys = expenseKeys(access);
  const client = useQueryClient();
  const abilities = expenseAbilities(access);

  const [statusFilter, setStatusFilter] = useState<ExpenseStatus | null>(null);
  const [categoryFilter, setCategoryFilter] = useState<ExpenseCategory | null>(
    null,
  );
  const [eventFilter, setEventFilter] = useState<string | null>(null);
  const [page, setPage] = useState(1);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [createOpen, setCreateOpen] = useState(false);
  const [announcement, setAnnouncement] = useState("");

  const listParams = {
    status: statusFilter,
    category: categoryFilter,
    eventId: eventFilter,
    page,
    pageSize: PAGE_SIZE,
  };

  const listQuery = useQuery({
    queryKey: keys.list(listParams),
    queryFn: ({ signal }) => listExpenses(listParams, signal),
    retry: false,
    placeholderData: (previous) => previous,
    refetchOnWindowFocus: true,
  });

  // The event picker is needed to create an expense, and to filter the list;
  // always fetched, like Campaigns' related-event picker.
  const eventsQuery = useQuery({
    queryKey: keys.events,
    queryFn: ({ signal }) => listAssignableEvents(signal),
    retry: false,
    staleTime: 60_000,
  });

  const suppliersQuery = useQuery({
    queryKey: keys.suppliers,
    queryFn: ({ signal }) => listAssignableSuppliers(signal),
    retry: false,
    staleTime: 60_000,
    enabled: abilities.canCreate || abilities.canUpdate,
  });

  const mutations = useExpensesMutations(access);

  // A 401/403 on the list means the caller's authority changed under them;
  // re-check access so the screen can drop to its denied/expired state.
  useEffect(() => {
    const error = listQuery.error;
    if (
      error instanceof ExpensesRequestError &&
      (error.status === 401 || error.status === 403)
    ) {
      void client.invalidateQueries({ queryKey: accessKey });
    }
  }, [listQuery.error, client]);

  const data = listQuery.data;
  const total = data?.total ?? 0;
  const pageCount = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const currentPage = Math.min(page, pageCount);
  const rows = data?.items ?? [];
  const filtersActive =
    statusFilter !== null || categoryFilter !== null || eventFilter !== null;

  const events = eventsQuery.data ?? [];
  const suppliers = suppliersQuery.data ?? [];

  return (
    <div className="space-y-4">
      {listQuery.isError ? (
        <div role="alert" className="space-y-2">
          <p>{(listQuery.error as Error).message}</p>
          <Button variant="outline" onClick={() => void listQuery.refetch()}>
            Try again
          </Button>
        </div>
      ) : null}

      {listQuery.isPending ? (
        <p role="status">Loading expenses…</p>
      ) : listQuery.isError ? null : (
        <>
          <div
            data-work-toolbar
            className="flex flex-wrap items-center justify-between gap-3"
          >
            <p className="text-muted-foreground text-sm">
              {filtersActive
                ? `${total} matching expense${total === 1 ? "" : "s"}`
                : `${total} expense${total === 1 ? "" : "s"}`}
            </p>
            {abilities.canCreate ? (
              <Button type="button" onClick={() => setCreateOpen(true)}>
                <Plus aria-hidden="true" data-icon="inline-start" />
                New expense
              </Button>
            ) : null}
          </div>

          <ExpensesFilters
            status={statusFilter}
            category={categoryFilter}
            eventId={eventFilter}
            events={events}
            onStatusChange={(value) => {
              setStatusFilter(value);
              setPage(1);
            }}
            onCategoryChange={(value) => {
              setCategoryFilter(value);
              setPage(1);
            }}
            onEventChange={(value) => {
              setEventFilter(value);
              setPage(1);
            }}
          />

          <ExpensesTable
            expenses={rows}
            events={events}
            onSelect={setSelectedId}
            page={currentPage}
            pageCount={pageCount}
            onPageChange={setPage}
            filtered={filtersActive}
          />
        </>
      )}

      <p role="status" aria-live="polite" className="sr-only">
        {announcement}
      </p>

      {abilities.canCreate ? (
        <CreateExpenseDialog
          open={createOpen}
          onOpenChange={setCreateOpen}
          events={events}
          suppliers={suppliers}
          onCreate={mutations.create.mutateAsync}
          onCreated={() => {
            setStatusFilter(null);
            setCategoryFilter(null);
            setEventFilter(null);
            setPage(1);
            setAnnouncement("Expense created.");
            void listQuery.refetch();
          }}
        />
      ) : null}

      <ExpenseDetailDialog
        expenseId={selectedId}
        onOpenChange={(open) => {
          if (!open) setSelectedId(null);
        }}
        events={events}
        suppliers={suppliers}
        canUpdate={abilities.canUpdate}
        canSubmit={abilities.canSubmit}
        canApprove={abilities.canApprove}
        canAttach={abilities.canAttach}
        onUpdate={(id, values) => mutations.update.mutateAsync({ id, values })}
        onSubmit={mutations.submit.mutateAsync}
        onReview={(id, outcome, note) =>
          mutations.review.mutateAsync({ id, outcome, note })
        }
        onChanged={() => void listQuery.refetch()}
      />
    </div>
  );
}
