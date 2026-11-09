"use client";

import { useId, useState, type FormEvent } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Plus } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  ProgressBar,
  type ProgressBarTone,
} from "@/components/ui/progress-bar";
import {
  useCurrentAccess,
  type CurrentAccess,
} from "@/features/auth/api/access-queries";
import {
  listCampaignActivities,
  setCampaignBudget,
} from "@/features/campaigns/api/campaigns-gateway";
import {
  listAssignableSuppliers,
  listExpenses,
} from "@/features/expenses/api/expenses-gateway";
import { useExpensesMutations } from "@/features/expenses/api/expenses-queries";
import { CreateExpenseDialog } from "@/features/expenses/components/create-expense-dialog";
import { ExpenseDetailDialog } from "@/features/expenses/components/expense-detail-dialog";
import { expenseAbilities } from "@/features/expenses/lib/expense-access";
import { expenseStatusLabel } from "@/features/expenses/lib/expenses-types";
import { partnerStatusLabel } from "@/features/partners/lib/partners-types";

import {
  listPromotionBudgetSummaries,
  type CampaignBudgetSummary,
} from "../api/budget-gateway";

/** "12,500.00 ETB". */
export function money(amount: string | null, currency: string | null): string {
  if (amount === null) return "Not set";
  const value = Number(amount).toLocaleString("en", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
  return currency ? `${value} ${currency}` : value;
}

function tone(summary: CampaignBudgetSummary): ProgressBarTone {
  if (summary.overBudget) return "danger";
  if ((summary.utilizationPercent ?? 0) >= 90) return "attention";
  return "active";
}

function utilization(summary: CampaignBudgetSummary): string {
  if (summary.allocated === null) return "No budget set";
  return `${money(summary.spent, summary.currency)} of ${money(summary.allocated, summary.currency)} (${summary.utilizationPercent ?? 0}%)`;
}

/**
 * The Promotion workspace's Budget section (EVE-233): each campaign's budget
 * against what it has spent, its expenses, and its partnerships. Spending is
 * what was submitted or approved; partnership values are commitments, shown
 * apart and never added to spending.
 */
export function PromotionBudgetView({
  readOnly = false,
}: {
  readOnly?: boolean;
}) {
  const access = useCurrentAccess();
  if (access.isPending) return <p role="status">Checking permissions…</p>;
  if (!access.data) return <p role="alert">Your session expired.</p>;
  return <BudgetManager access={access.data} readOnly={readOnly} />;
}

function BudgetManager({
  access,
  readOnly,
}: {
  access: CurrentAccess;
  readOnly: boolean;
}) {
  const baseKey = ["expenses", access.userId, "campaign-budget"] as const;
  const summaries = useQuery({
    queryKey: [...baseKey, "summaries"],
    queryFn: ({ signal }) => listPromotionBudgetSummaries(signal),
    retry: false,
  });
  const [selectedId, setSelectedId] = useState<string | null>(null);

  if (summaries.isPending)
    return <p role="status">Loading campaign budgets…</p>;
  if (summaries.isError)
    return (
      <div role="alert" className="space-y-2 text-sm">
        <p>{summaries.error.message}</p>
        <Button
          variant="outline"
          size="sm"
          onClick={() => void summaries.refetch()}
        >
          Try again
        </Button>
      </div>
    );

  const items = summaries.data;
  if (items.length === 0)
    return (
      <p className="text-muted-foreground rounded-xl border border-dashed px-4 py-8 text-center text-sm">
        There are no promotion campaigns yet.
      </p>
    );
  const selected =
    items.find((item) => item.campaignId === selectedId) ?? items[0]!;

  return (
    <section aria-label="Campaign budgets" className="space-y-4">
      <BudgetOverview items={items} />
      <div className="grid gap-4 lg:grid-cols-[minmax(0,2fr)_minmax(0,3fr)]">
        <ul aria-label="Campaigns" className="divide-y rounded-xl border">
          {items.map((item) => (
            <li key={item.campaignId}>
              <button
                type="button"
                aria-current={
                  item.campaignId === selected.campaignId ? "true" : undefined
                }
                className="hover:bg-muted/50 aria-[current=true]:bg-muted focus-visible:ring-ring/50 w-full space-y-1.5 px-3 py-2 text-left focus-visible:ring-3 focus-visible:outline-none"
                onClick={() => setSelectedId(item.campaignId)}
              >
                <span className="block text-sm font-medium break-words">
                  {item.campaignName}
                </span>
                <ProgressBar
                  label={`${item.campaignName} budget used`}
                  percent={
                    item.utilizationPercent === null
                      ? null
                      : Math.min(item.utilizationPercent, 100)
                  }
                  summary={utilization(item)}
                  tone={tone(item)}
                />
              </button>
            </li>
          ))}
        </ul>
        <CampaignBudgetDetail
          key={selected.campaignId}
          access={access}
          summary={selected}
          readOnly={readOnly}
          onChanged={() => void summaries.refetch()}
        />
      </div>
    </section>
  );
}

/** Totals across campaigns, only when they share one currency. */
function BudgetOverview({ items }: { items: CampaignBudgetSummary[] }) {
  const currencies = new Set(
    items.map((item) => item.currency).filter(Boolean),
  );
  if (currencies.size !== 1) return null;
  const currency = [...currencies][0]!;
  const sum = (pick: (item: CampaignBudgetSummary) => string | null) =>
    items
      .reduce(
        (total, item) => total + Math.round(Number(pick(item) ?? 0) * 100),
        0,
      )
      .toString();
  const cents = (value: string) => (Number(value) / 100).toFixed(2);
  const allocated = cents(sum((item) => item.allocated));
  const spent = cents(sum((item) => item.spent));
  const remaining = (Number(allocated) - Number(spent)).toFixed(2);
  return (
    <section aria-label="All promotion campaigns">
      <dl className="grid gap-x-6 gap-y-1 rounded-xl border px-4 py-3 text-sm sm:grid-cols-3">
        <div>
          <dt className="text-muted-foreground">Allocated</dt>
          <dd className="font-medium">{money(allocated, currency)}</dd>
        </div>
        <div>
          <dt className="text-muted-foreground">Spent</dt>
          <dd className="font-medium">{money(spent, currency)}</dd>
        </div>
        <div>
          <dt className="text-muted-foreground">Remaining</dt>
          <dd className="font-medium">{money(remaining, currency)}</dd>
        </div>
      </dl>
    </section>
  );
}

function CampaignBudgetDetail({
  access,
  summary,
  readOnly,
  onChanged,
}: {
  access: CurrentAccess;
  summary: CampaignBudgetSummary;
  readOnly: boolean;
  onChanged: () => void;
}) {
  const client = useQueryClient();
  const abilities = expenseAbilities(access);
  const canCreate = !readOnly && abilities.canCreate;
  const canSetBudget =
    !readOnly &&
    access.grants.some(
      (grant) => grant.permissionKey === "campaign.budget.update",
    );
  const baseKey = ["expenses", access.userId, "campaign-budget"] as const;
  const expenses = useQuery({
    queryKey: [...baseKey, "expenses", summary.campaignId],
    queryFn: ({ signal }) =>
      listExpenses({ campaignId: summary.campaignId, pageSize: 100 }, signal),
    retry: false,
  });
  const activities = useQuery({
    queryKey: [...baseKey, "activities", summary.campaignId],
    queryFn: async ({ signal }) =>
      (await listCampaignActivities(summary.campaignId, signal)) ?? [],
    retry: false,
  });
  const suppliers = useQuery({
    queryKey: [...baseKey, "suppliers"],
    queryFn: ({ signal }) => listAssignableSuppliers(signal),
    enabled: canCreate,
    retry: false,
    staleTime: 60_000,
  });
  const mutations = useExpensesMutations(access);
  const [createOpen, setCreateOpen] = useState(false);
  const [openExpenseId, setOpenExpenseId] = useState<string | null>(null);
  const activityOptions = (activities.data ?? []).map((activity) => ({
    id: activity.id,
    name: activity.name,
  }));
  const refresh = () => {
    onChanged();
    void client.invalidateQueries({ queryKey: baseKey });
  };

  const figures: [string, string][] = [
    ["Allocated", money(summary.allocated, summary.currency)],
    ["Approved", money(summary.approved, summary.currency)],
    ["Awaiting approval", money(summary.pending, summary.currency)],
    [
      "Remaining",
      summary.remaining === null
        ? "No budget set"
        : money(summary.remaining, summary.currency),
    ],
  ];

  return (
    <article
      aria-label={`${summary.campaignName} budget`}
      className="min-w-0 space-y-5 rounded-xl border p-4"
    >
      <header className="space-y-3">
        <h3 className="text-base font-semibold break-words">
          {summary.campaignName}
        </h3>
        <dl className="grid grid-cols-2 gap-x-6 gap-y-2 text-sm sm:grid-cols-4">
          {figures.map(([label, value]) => (
            <div key={label}>
              <dt className="text-muted-foreground">{label}</dt>
              <dd className="font-medium">{value}</dd>
            </div>
          ))}
        </dl>
        {summary.overBudget ? (
          <p role="status" className="text-destructive text-sm font-medium">
            Spending is over the allocated budget.
          </p>
        ) : null}
        {summary.otherCurrencyExpenseCount > 0 ? (
          <p className="text-muted-foreground text-xs">
            {summary.otherCurrencyExpenseCount} expense(s) in another currency
            are not included in these totals.
          </p>
        ) : null}
        {canSetBudget ? (
          <SetBudgetForm summary={summary} onSaved={refresh} />
        ) : null}
      </header>

      {summary.byActivity.length > 0 ? (
        <section aria-label="Spending by activity" className="space-y-1">
          <h4 className="text-sm font-medium">Spending by activity</h4>
          <ul className="text-sm">
            {summary.byActivity.map((line) => (
              <li
                key={line.campaignActivityId ?? "campaign"}
                className="flex justify-between gap-2 py-0.5"
              >
                <span className="min-w-0 break-words">
                  {line.activityName ?? "The campaign as a whole"}
                </span>
                <span className="shrink-0">
                  {money(line.spent, summary.currency)}
                </span>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      <section aria-label="Partnerships" className="space-y-1">
        <h4 className="text-sm font-medium">Partnerships</h4>
        {summary.partnerships.length === 0 ? (
          <p className="text-muted-foreground text-sm">
            No partnerships for this campaign.
          </p>
        ) : (
          <>
            <ul className="text-sm">
              {summary.partnerships.map((partner) => (
                <li
                  key={partner.id}
                  className="flex flex-wrap justify-between gap-2 py-0.5"
                >
                  <span className="min-w-0 break-words">
                    {partner.partnershipName ?? partner.organizationName} ·{" "}
                    {partnerStatusLabel(partner.status as never)}
                  </span>
                  <span className="shrink-0">
                    {partner.agreedValueAmount
                      ? money(
                          partner.agreedValueAmount,
                          partner.agreedValueCurrency,
                        )
                      : "No agreed value"}
                  </span>
                </li>
              ))}
            </ul>
            <p className="text-muted-foreground text-xs">
              Committed partnership value:{" "}
              {money(summary.committedPartnershipValue, summary.currency)}. A
              commitment from partners, not spending.
            </p>
          </>
        )}
      </section>

      <section aria-label="Expenses" className="space-y-2">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h4 className="text-sm font-medium">Expenses</h4>
          {canCreate ? (
            <Button type="button" size="sm" onClick={() => setCreateOpen(true)}>
              <Plus aria-hidden="true" />
              New expense
            </Button>
          ) : null}
        </div>
        {expenses.isPending ? (
          <p role="status" className="text-muted-foreground text-sm">
            Loading expenses…
          </p>
        ) : expenses.isError ? (
          <p role="alert" className="text-sm">
            Expenses could not be loaded.
          </p>
        ) : expenses.data.items.length === 0 ? (
          <p className="text-muted-foreground text-sm">No expenses yet.</p>
        ) : (
          <ul className="divide-y rounded-lg border">
            {expenses.data.items.map((expense) => (
              <li key={expense.id}>
                <button
                  type="button"
                  className="hover:bg-muted/50 focus-visible:ring-ring/50 flex w-full flex-wrap items-center justify-between gap-2 px-3 py-2 text-left text-sm focus-visible:ring-3 focus-visible:outline-none"
                  onClick={() => setOpenExpenseId(expense.id)}
                >
                  <span className="min-w-0 break-words">
                    {expense.title ?? expense.description}
                    <span className="text-muted-foreground">
                      {" "}
                      · {expenseStatusLabel(expense.status)}
                      {expense.expenseDate ? ` · ${expense.expenseDate}` : ""}
                    </span>
                  </span>
                  <span className="shrink-0 font-medium">
                    {money(expense.actualAmount, expense.currency)}
                  </span>
                </button>
              </li>
            ))}
          </ul>
        )}
      </section>

      {canCreate ? (
        <CreateExpenseDialog
          open={createOpen}
          onOpenChange={setCreateOpen}
          events={[]}
          suppliers={suppliers.data ?? []}
          campaignId={summary.campaignId}
          activities={activityOptions}
          {...(summary.currency ? { defaultCurrency: summary.currency } : {})}
          onCreate={mutations.create.mutateAsync}
          onCreated={refresh}
        />
      ) : null}
      <ExpenseDetailDialog
        expenseId={openExpenseId}
        onOpenChange={(open) => {
          if (!open) setOpenExpenseId(null);
        }}
        events={[]}
        suppliers={suppliers.data ?? []}
        activities={activityOptions}
        canUpdate={!readOnly && abilities.canUpdate}
        canSubmit={!readOnly && abilities.canSubmit}
        canApprove={!readOnly && abilities.canApprove}
        canAttach={!readOnly && abilities.canAttach}
        onUpdate={(id, values) => mutations.update.mutateAsync({ id, values })}
        onSubmit={mutations.submit.mutateAsync}
        onReview={(id, outcome, note) =>
          mutations.review.mutateAsync({ id, outcome, note })
        }
        onChanged={refresh}
      />
    </article>
  );
}

function SetBudgetForm({
  summary,
  onSaved,
}: {
  summary: CampaignBudgetSummary;
  onSaved: () => void;
}) {
  const id = useId();
  const [amount, setAmount] = useState(summary.allocated ?? "");
  const [currency, setCurrency] = useState(summary.currency ?? "ETB");
  const [message, setMessage] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  async function save(event: FormEvent) {
    event.preventDefault();
    if (!amount.trim() || !/^[A-Z]{3}$/.test(currency)) {
      setMessage("Enter an amount and a three-letter currency.");
      return;
    }
    setSaving(true);
    const outcome = await setCampaignBudget(
      summary.campaignId,
      Number(amount),
      currency,
    );
    setSaving(false);
    if (outcome.status === "success") {
      setMessage("Budget saved.");
      onSaved();
    } else {
      setMessage("The budget could not be saved. Try again.");
    }
  }

  return (
    <form
      aria-label="Set campaign budget"
      className="flex flex-wrap items-end gap-2"
      onSubmit={(event) => void save(event)}
    >
      <div className="space-y-1">
        <Label htmlFor={`${id}-amount`}>Budget</Label>
        <Input
          id={`${id}-amount`}
          type="number"
          min="0"
          step="0.01"
          inputMode="decimal"
          className="w-36"
          value={amount}
          onChange={(event) => setAmount(event.target.value)}
        />
      </div>
      <div className="space-y-1">
        <Label htmlFor={`${id}-currency`}>Currency</Label>
        <Input
          id={`${id}-currency`}
          className="w-20"
          maxLength={3}
          value={currency}
          onChange={(event) => setCurrency(event.target.value.toUpperCase())}
        />
      </div>
      <Button type="submit" size="sm" variant="outline" disabled={saving}>
        {saving ? "Saving…" : "Save budget"}
      </Button>
      {message ? (
        <p role="status" className="w-full text-sm">
          {message}
        </p>
      ) : null}
    </form>
  );
}
