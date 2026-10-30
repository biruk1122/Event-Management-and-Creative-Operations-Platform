/** Exactly two calendar years after `grantedAt` - calendar-accurate (not a
 * fixed 730-day count), per the user's own locked-in policy: "the leave
 * only works for two years after that it will be cancelled." */
export function twoYearsLater(grantedAt: Date): Date {
  const expiry = new Date(grantedAt);
  expiry.setUTCFullYear(expiry.getUTCFullYear() + 2);
  return expiry;
}

export interface GrantBalance {
  grantId: string;
  remaining: number;
}

export interface ConsumptionInstruction {
  grantId: string;
  amountDays: number;
}

/**
 * FIFO consumption plan: draws from the oldest non-expired grant first, so
 * each grant's own independent two-year clock is respected rather than
 * pooling every grant into one undifferentiated balance. `grants` must
 * already be filtered to non-expired and sorted oldest-first by
 * `grantedAt` - this function trusts that ordering, it does not re-sort.
 */
export function planConsumption(
  grants: readonly GrantBalance[],
  daysToConsume: number,
): ConsumptionInstruction[] | "insufficient_balance" {
  let remaining = daysToConsume;
  const plan: ConsumptionInstruction[] = [];
  for (const grant of grants) {
    if (remaining <= 0) break;
    if (grant.remaining <= 0) continue;
    const take = Math.min(grant.remaining, remaining);
    plan.push({ grantId: grant.grantId, amountDays: -take });
    remaining -= take;
  }
  if (remaining > 0) return "insufficient_balance";
  return plan;
}

/** Inclusive full-day span, matching the "full-day only for v1" policy. */
export function inclusiveDaySpan(startDate: Date, endDate: Date): number {
  const MS_PER_DAY = 86_400_000;
  return Math.round((endDate.getTime() - startDate.getTime()) / MS_PER_DAY) + 1;
}
