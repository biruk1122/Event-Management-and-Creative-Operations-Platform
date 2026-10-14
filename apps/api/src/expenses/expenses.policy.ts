import type { ExpenseStatus } from "../generated/prisma/client.js";

/** A draft or a rejected expense may be edited; a rejected edit returns to
 * DRAFT (mirrors `reports.policy.ts`'s `canEdit`/`CHANGES_REQUESTED` shape) -
 * so the reject -> edit -> resubmit cycle never loses the prior decision,
 * which stays readable in `reviews[]`. */
export function canEdit(status: ExpenseStatus): boolean {
  return status === "DRAFT" || status === "REJECTED";
}
