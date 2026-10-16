"use client";

import { useId, useState, type FormEvent } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import type { CurrentAccess } from "@/features/auth/api/access-queries";
import { CreateExpenseDialog } from "@/features/expenses/components/create-expense-dialog";
import { expenseAbilities } from "@/features/expenses/lib/expense-access";
import {
  createExpense,
  listAssignableSuppliers,
} from "@/features/expenses/api/expenses-gateway";

import { getProductionBudgetSummary } from "../api/productions-gateway";
import { useProductionMutations } from "../api/productions-queries";

export function ProductionBudgetPanel({
  access,
  productionId,
  canUpdate,
}: {
  access: CurrentAccess;
  productionId: string;
  canUpdate: boolean;
}) {
  const id = useId();
  const client = useQueryClient();
  const mutations = useProductionMutations(access);
  const [editing, setEditing] = useState(false);
  const [amount, setAmount] = useState("");
  const [currency, setCurrency] = useState("USD");
  const [error, setError] = useState<string | null>(null);
  const [expenseDialogOpen, setExpenseDialogOpen] = useState(false);
  const canCreateExpense = expenseAbilities(access).canCreate;

  const query = useQuery({
    queryKey: ["production-budget-summary", productionId],
    queryFn: ({ signal }) => getProductionBudgetSummary(productionId, signal),
    retry: false,
  });

  const suppliersQuery = useQuery({
    queryKey: ["production-expense-suppliers"],
    queryFn: ({ signal }) => listAssignableSuppliers(signal),
    retry: false,
    staleTime: 60_000,
    enabled: canCreateExpense,
  });

  if (query.isPending) {
    return (
      <p role="status" className="text-muted-foreground text-sm">
        Loading budget…
      </p>
    );
  }
  if (query.isError) {
    return (
      <p role="alert" className="text-destructive text-sm">
        The budget could not be loaded.
      </p>
    );
  }

  const summary = query.data;
  const planned = summary.plannedAmount ? Number(summary.plannedAmount) : null;
  const approved = Number(summary.actualApproved);
  const remaining = planned !== null ? planned - approved : null;
  const overBudget = remaining !== null && remaining < 0;

  async function submit(event: FormEvent) {
    event.preventDefault();
    const parsed = amount.trim() ? Number(amount) : null;
    if (amount.trim() && (Number.isNaN(parsed) || parsed! < 0)) {
      setError("Enter a non-negative amount.");
      return;
    }
    if (parsed !== null && currency.trim().length !== 3) {
      setError("Use a 3-letter currency code.");
      return;
    }
    setError(null);
    try {
      await mutations.setBudget.mutateAsync({
        id: productionId,
        amount: parsed,
        currency: parsed !== null ? currency.trim().toUpperCase() : null,
      });
      await client.invalidateQueries({
        queryKey: ["production-budget-summary", productionId],
      });
      setEditing(false);
    } catch {
      setError("The budget could not be saved. Try again.");
    }
  }

  return (
    <div className="space-y-4">
      <div className="grid gap-3 sm:grid-cols-2">
        <div className="bg-muted/40 rounded-lg border p-3">
          <p className="text-muted-foreground text-xs">Planned budget</p>
          <p className="text-lg font-semibold">
            {summary.plannedAmount && summary.currency
              ? `${summary.plannedAmount} ${summary.currency}`
              : "Not set"}
          </p>
        </div>
        <div className="bg-muted/40 rounded-lg border p-3">
          <p className="text-muted-foreground text-xs">Approved spend</p>
          <p className="text-lg font-semibold">
            {summary.actualApproved} {summary.currency ?? ""}
          </p>
        </div>
        <div className="bg-muted/40 rounded-lg border p-3">
          <p className="text-muted-foreground text-xs">Pending approval</p>
          <p className="text-lg font-semibold">
            {summary.actualPending} {summary.currency ?? ""}
          </p>
        </div>
        <div
          className={`rounded-lg border p-3 ${overBudget ? "bg-destructive/10 border-destructive" : "bg-muted/40"}`}
        >
          <p className="text-muted-foreground text-xs">Remaining</p>
          <p
            className={`text-lg font-semibold ${overBudget ? "text-destructive" : ""}`}
          >
            {remaining !== null
              ? `${remaining.toFixed(2)} ${summary.currency ?? ""}`
              : "Not set"}
          </p>
          {overBudget ? (
            <p className="text-destructive mt-1 text-xs">Over budget</p>
          ) : null}
        </div>
      </div>
      {summary.linkedEventId === null ? (
        <p className="text-muted-foreground text-sm">
          This production has no linked event. Approved and pending spend above
          reflects only expenses recorded directly against this production.
        </p>
      ) : null}

      {canCreateExpense ? (
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={() => setExpenseDialogOpen(true)}
        >
          Add expense
        </Button>
      ) : null}

      {canUpdate ? (
        editing ? (
          <form
            onSubmit={(event) => void submit(event)}
            className="bg-muted/40 flex flex-wrap items-end gap-2 rounded-lg border p-3"
          >
            {error ? (
              <p className="text-destructive basis-full text-sm">{error}</p>
            ) : null}
            <div className="space-y-1">
              <Label htmlFor={`${id}-amount`}>Amount</Label>
              <Input
                id={`${id}-amount`}
                type="number"
                min="0"
                step="0.01"
                value={amount}
                onChange={(event) => setAmount(event.target.value)}
                className="w-32"
              />
            </div>
            <div className="space-y-1">
              <Label htmlFor={`${id}-currency`}>Currency</Label>
              <Input
                id={`${id}-currency`}
                value={currency}
                maxLength={3}
                onChange={(event) => setCurrency(event.target.value)}
                className="w-20 uppercase"
              />
            </div>
            <Button
              type="submit"
              size="sm"
              disabled={mutations.setBudget.isPending}
            >
              Save
            </Button>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => setEditing(false)}
            >
              Cancel
            </Button>
          </form>
        ) : (
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => {
              setAmount(summary.plannedAmount ?? "");
              setCurrency(summary.currency ?? "USD");
              setEditing(true);
            }}
          >
            {summary.plannedAmount ? "Change budget" : "Set budget"}
          </Button>
        )
      ) : null}

      {canCreateExpense ? (
        <CreateExpenseDialog
          open={expenseDialogOpen}
          onOpenChange={setExpenseDialogOpen}
          events={[]}
          suppliers={suppliersQuery.data ?? []}
          productionId={productionId}
          onCreate={createExpense}
          onCreated={() => {
            void client.invalidateQueries({
              queryKey: ["production-budget-summary", productionId],
            });
          }}
        />
      ) : null}
    </div>
  );
}
