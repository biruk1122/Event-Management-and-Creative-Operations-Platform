"use client";

import { useMutation, useQueryClient } from "@tanstack/react-query";

import {
  accessKey,
  type CurrentAccess,
} from "@/features/auth/api/access-queries";

import * as gateway from "./expenses-gateway";
import type { EditExpenseValues } from "../lib/expenses-outcome";
import type { ExpenseReviewOutcome } from "../lib/expenses-types";

/**
 * Query keys namespaced by the acting user and a signature of their grants, so
 * a permission change never serves cache written under the old authority.
 */
export function expenseKeys(access: CurrentAccess) {
  const scope = [
    ...new Set(access.grants.map((g) => `${g.permissionKey}:${g.scope}`)),
  ]
    .sort()
    .join(",");
  const all = ["expenses", access.userId, scope] as const;
  return {
    all,
    list: (params: Record<string, unknown>) =>
      [...all, "list", params] as const,
    detail: (id: string) => [...all, "expense", id] as const,
    events: [...all, "assignable-events"] as const,
    suppliers: [...all, "assignable-suppliers"] as const,
  };
}

export function useExpensesMutations(access: CurrentAccess) {
  const client = useQueryClient();
  const reconcile = async () => {
    await client.invalidateQueries({ queryKey: ["expenses", access.userId] });
    await client.invalidateQueries({ queryKey: accessKey });
  };

  const create = useMutation({
    mutationFn: gateway.createExpense,
    onSettled: reconcile,
  });
  const update = useMutation({
    mutationFn: ({ id, values }: { id: string; values: EditExpenseValues }) =>
      gateway.updateExpense(id, values),
    onSettled: reconcile,
  });
  const submit = useMutation({
    mutationFn: gateway.submitExpense,
    onSettled: reconcile,
  });
  const review = useMutation({
    mutationFn: ({
      id,
      outcome,
      note,
    }: {
      id: string;
      outcome: ExpenseReviewOutcome;
      note: string | null;
    }) => gateway.reviewExpense(id, outcome, note),
    onSettled: reconcile,
  });

  return { create, update, submit, review };
}
