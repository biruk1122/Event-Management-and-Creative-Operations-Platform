import type { CurrentAccess } from "@/features/auth/api/access-queries";

/**
 * Expense authorization mirrors `ExpensesService`: the backend resolves
 * scope server-side - organization scope sees every expense, department
 * scope sees only the caller's own department's (EOM-01). `expense.approve`
 * is deliberately never granted at department scope in the catalog (Super
 * Admin only, by company policy), so `canApprove` checks organization scope
 * only; every other key accepts either.
 */
type Grant = CurrentAccess["grants"][number];

function holdsAny(grants: readonly Grant[], key: string): boolean {
  return grants.some(
    (grant) =>
      grant.permissionKey === key &&
      (grant.scope === "ORGANIZATION" || grant.scope === "DEPARTMENT"),
  );
}

function holdsOrg(grants: readonly Grant[], key: string): boolean {
  return grants.some(
    (grant) => grant.permissionKey === key && grant.scope === "ORGANIZATION",
  );
}

/** Whether the caller may read expenses at all. */
export function canReadExpenses(access: CurrentAccess): boolean {
  return holdsAny(access.grants, "expense.read");
}

export interface ExpenseAbilities {
  canCreate: boolean;
  canUpdate: boolean;
  canSubmit: boolean;
  canApprove: boolean;
  canAttach: boolean;
}

export function expenseAbilities(access: CurrentAccess): ExpenseAbilities {
  return {
    canCreate: holdsAny(access.grants, "expense.create"),
    canUpdate: holdsAny(access.grants, "expense.update"),
    canSubmit: holdsAny(access.grants, "expense.submit"),
    canApprove: holdsOrg(access.grants, "expense.approve"),
    canAttach: holdsAny(access.grants, "expense.attachment.create"),
  };
}
