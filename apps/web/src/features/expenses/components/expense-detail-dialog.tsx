"use client";

import { useEffect, useId, useState } from "react";
import { LoaderCircle, TriangleAlert } from "lucide-react";

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { WorkDialogContent as DialogContent } from "@/components/ui/work-dialog-content";
import { Label } from "@/components/ui/label";
import { ExpenseFilesPanel } from "@/features/files";

import { getExpense as defaultGetExpense } from "../api/expenses-gateway";
import { ExpenseFields, type ExpenseFieldValues } from "./expense-fields";
import type {
  EditExpenseValues,
  GetExpense,
  ReviewExpense,
  SubmitExpense,
  UpdateExpense,
} from "../lib/expenses-outcome";
import {
  amountSummary,
  canEditExpense,
  expenseCategoryLabel,
  expenseStatusLabel,
  expenseStatusVariant,
  type AssignableEvent,
  type AssignableSupplier,
  type Expense,
} from "../lib/expenses-types";

const ACTION_ERRORS: Record<string, string> = {
  invalid_transition: "That move is not allowed from the current status.",
  supplier_not_found:
    "That supplier no longer exists. Pick another or clear it.",
  not_found: "This expense no longer exists. Close this and refresh the list.",
  permission_denied: "You do not have permission to do that.",
  unexpected: "We could not save that change. Try again.",
};

function actionError(key: string): string {
  return ACTION_ERRORS[key] ?? ACTION_ERRORS.unexpected!;
}

function fieldsFromExpense(expense: Expense): ExpenseFieldValues {
  return {
    supplierId: expense.supplierId,
    category: expense.category,
    description: expense.description,
    plannedAmount: expense.plannedAmount ?? "",
    actualAmount: expense.actualAmount,
    currency: expense.currency,
  };
}

interface ExpenseDetailDialogProps {
  expenseId: string | null;
  onOpenChange: (open: boolean) => void;
  events: readonly AssignableEvent[];
  suppliers: readonly AssignableSupplier[];
  canUpdate: boolean;
  canSubmit: boolean;
  canApprove: boolean;
  canAttach: boolean;
  getExpense?: GetExpense;
  onUpdate: UpdateExpense;
  onSubmit: SubmitExpense;
  onReview: ReviewExpense;
  onChanged: (expense: Expense) => void;
}

export function ExpenseDetailDialog({
  expenseId,
  onOpenChange,
  ...bodyProps
}: ExpenseDetailDialogProps) {
  return (
    <Dialog
      open={expenseId !== null}
      onOpenChange={(open) => {
        if (!open) onOpenChange(false);
      }}
    >
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-2xl">
        {expenseId !== null ? (
          <ExpenseDetailBody
            key={expenseId}
            expenseId={expenseId}
            {...bodyProps}
          />
        ) : null}
      </DialogContent>
    </Dialog>
  );
}

type BodyProps = Omit<
  ExpenseDetailDialogProps,
  "expenseId" | "onOpenChange"
> & {
  expenseId: string;
};

function ExpenseDetailBody({
  expenseId,
  events,
  suppliers,
  canUpdate,
  canSubmit,
  canApprove,
  canAttach,
  getExpense = defaultGetExpense,
  onUpdate,
  onSubmit,
  onReview,
  onChanged,
}: BodyProps) {
  const ids = { note: useId() };

  const [status, setStatus] = useState<"loading" | "loaded" | "error">(
    "loading",
  );
  const [expense, setExpense] = useState<Expense | null>(null);
  const [fields, setFields] = useState<ExpenseFieldValues | null>(null);
  const [fieldErrors, setFieldErrors] = useState<
    Partial<Record<keyof EditExpenseValues, string>>
  >({});
  const [detailsError, setDetailsError] = useState<string | null>(null);
  const [detailsBusy, setDetailsBusy] = useState(false);

  const [submitError, setSubmitError] = useState<string | null>(null);
  const [submitBusy, setSubmitBusy] = useState(false);

  const [note, setNote] = useState("");
  const [reviewError, setReviewError] = useState<string | null>(null);
  const [reviewBusy, setReviewBusy] = useState(false);

  const [announcement, setAnnouncement] = useState("");

  useEffect(() => {
    let cancelled = false;
    void getExpense(expenseId).then((loaded) => {
      if (cancelled) return;
      if (!loaded) {
        setStatus("error");
        return;
      }
      setExpense(loaded);
      setFields(fieldsFromExpense(loaded));
      setStatus("loaded");
    });
    return () => {
      cancelled = true;
    };
  }, [expenseId, getExpense]);

  function apply(next: Expense) {
    setExpense(next);
    setFields(fieldsFromExpense(next));
    onChanged(next);
  }

  function setField<K extends keyof ExpenseFieldValues>(
    key: K,
    value: ExpenseFieldValues[K],
  ) {
    setFields((current) => (current ? { ...current, [key]: value } : current));
  }

  async function saveDetails() {
    if (!expense || !fields) return;
    const localErrors: Partial<Record<keyof EditExpenseValues, string>> = {};
    if (fields.description.trim() === "") {
      localErrors.description = "Enter a description.";
    }
    if (fields.actualAmount.trim() === "") {
      localErrors.actualAmount = "Enter the actual amount.";
    }
    if (fields.currency.trim().length !== 3) {
      localErrors.currency = "Use a 3-letter currency code.";
    }
    if (Object.keys(localErrors).length > 0) {
      setFieldErrors(localErrors);
      return;
    }

    setDetailsBusy(true);
    setDetailsError(null);
    setFieldErrors({});
    const outcome = await onUpdate(expense.id, fields);
    setDetailsBusy(false);

    if (outcome.status === "success") {
      apply(outcome.expense);
      setAnnouncement("Expense details saved.");
      return;
    }
    if (outcome.status === "field_errors") {
      setFieldErrors(outcome.fieldErrors);
      return;
    }
    setDetailsError(actionError(outcome.status));
  }

  async function runSubmit() {
    if (!expense) return;
    setSubmitBusy(true);
    setSubmitError(null);
    const outcome = await onSubmit(expense.id);
    setSubmitBusy(false);
    if (outcome.status === "success") {
      apply(outcome.expense);
      setAnnouncement("Expense submitted for approval.");
      return;
    }
    setSubmitError(actionError(outcome.status));
  }

  async function runReview(outcome: "APPROVED" | "REJECTED") {
    if (!expense) return;
    setReviewBusy(true);
    setReviewError(null);
    const result = await onReview(expense.id, outcome, note.trim() || null);
    setReviewBusy(false);
    if (result.status === "success") {
      apply(result.expense);
      setNote("");
      setAnnouncement(
        outcome === "APPROVED" ? "Expense approved." : "Expense rejected.",
      );
      return;
    }
    setReviewError(actionError(result.status));
  }

  if (status === "loading") {
    return (
      <div
        role="status"
        aria-live="polite"
        className="flex items-center justify-center gap-2 py-10 text-sm"
      >
        <LoaderCircle aria-hidden="true" className="size-4 animate-spin" />
        Loading expense…
      </div>
    );
  }

  if (status === "error" || !expense || !fields) {
    return (
      <Alert variant="destructive">
        <TriangleAlert aria-hidden="true" />
        <AlertTitle>We could not load this expense</AlertTitle>
        <AlertDescription>Try again in a moment.</AlertDescription>
      </Alert>
    );
  }

  const event = events.find((item) => item.id === expense.eventId);
  const editable = canUpdate && canEditExpense(expense.status);
  const submittable = canSubmit && canEditExpense(expense.status);
  const reviewable = canApprove && expense.status === "SUBMITTED";
  const sortedReviews = [...expense.reviews].sort(
    (a, b) =>
      new Date(b.reviewedAt).getTime() - new Date(a.reviewedAt).getTime(),
  );

  return (
    <>
      <DialogHeader>
        <div className="flex flex-wrap items-center gap-2">
          <DialogTitle>{expenseCategoryLabel(expense.category)}</DialogTitle>
          <Badge variant={expenseStatusVariant(expense.status)}>
            {expenseStatusLabel(expense.status)}
          </Badge>
        </div>
        <DialogDescription>
          {event
            ? event.name
            : expense.eventId === null
              ? "Production expense"
              : "Event"}{" "}
          · {amountSummary(expense.actualAmount, expense.currency)}
        </DialogDescription>
      </DialogHeader>

      {/* Details */}
      <form
        aria-label="Edit expense details"
        className="space-y-4"
        noValidate
        onSubmit={(submitEvent) => {
          submitEvent.preventDefault();
          void saveDetails();
        }}
      >
        <ExpenseFields
          values={fields}
          errors={fieldErrors}
          suppliers={suppliers}
          disabled={detailsBusy || !editable}
          onChange={setField}
        />
        {detailsError ? (
          <p className="text-destructive text-sm" role="alert">
            {detailsError}
          </p>
        ) : null}
        {editable ? (
          <Button
            type="submit"
            size="sm"
            disabled={detailsBusy}
            aria-busy={detailsBusy}
          >
            {detailsBusy ? "Saving…" : "Save details"}
          </Button>
        ) : (
          <p className="text-muted-foreground text-xs">
            {canUpdate
              ? "This expense can only be edited while it is a draft or rejected."
              : "You have read-only access to this expense's details."}
          </p>
        )}
      </form>

      {/* Submit for approval */}
      {canSubmit ? (
        <section className="border-border space-y-2 border-t pt-4">
          <p className="text-sm font-medium">Approval</p>
          {submittable ? (
            <Button
              type="button"
              size="sm"
              disabled={submitBusy}
              aria-busy={submitBusy}
              onClick={() => void runSubmit()}
            >
              {submitBusy ? "Submitting…" : "Submit for approval"}
            </Button>
          ) : (
            <p className="text-muted-foreground text-sm">
              Current status: {expenseStatusLabel(expense.status)}.
            </p>
          )}
          {submitError ? (
            <p className="text-destructive text-sm" role="alert">
              {submitError}
            </p>
          ) : null}
        </section>
      ) : null}

      {/* Review history */}
      <section className="border-border space-y-2 border-t pt-4">
        <p className="text-sm font-medium">Review history</p>
        {sortedReviews.length === 0 ? (
          <p className="text-muted-foreground text-sm">No decisions yet.</p>
        ) : (
          <ul className="space-y-2">
            {sortedReviews.map((review) => (
              <li key={review.id} className="text-sm">
                <Badge
                  variant={
                    review.outcome === "APPROVED" ? "secondary" : "destructive"
                  }
                >
                  {review.outcome === "APPROVED" ? "Approved" : "Rejected"}
                </Badge>{" "}
                <span className="text-muted-foreground">
                  {new Date(review.reviewedAt).toLocaleString()}
                </span>
                {review.note ? <p className="mt-1">{review.note}</p> : null}
              </li>
            ))}
          </ul>
        )}
      </section>

      {/* Super Admin approval action */}
      {reviewable ? (
        <section className="border-border space-y-2 border-t pt-4">
          <p className="text-sm font-medium">Decide</p>
          <div className="space-y-1">
            <Label htmlFor={ids.note}>Note (optional)</Label>
            <textarea
              id={ids.note}
              rows={2}
              value={note}
              disabled={reviewBusy}
              className="border-input placeholder:text-muted-foreground focus-visible:ring-ring/50 flex w-full rounded-md border bg-transparent px-3 py-2 text-sm shadow-xs focus-visible:ring-3 focus-visible:outline-none disabled:cursor-not-allowed disabled:opacity-50"
              onChange={(changeEvent) => setNote(changeEvent.target.value)}
            />
          </div>
          <div className="flex gap-2">
            <Button
              type="button"
              size="sm"
              disabled={reviewBusy}
              aria-busy={reviewBusy}
              onClick={() => void runReview("APPROVED")}
            >
              Approve
            </Button>
            <Button
              type="button"
              size="sm"
              variant="destructive"
              disabled={reviewBusy}
              aria-busy={reviewBusy}
              onClick={() => void runReview("REJECTED")}
            >
              Reject
            </Button>
          </div>
          {reviewError ? (
            <p className="text-destructive text-sm" role="alert">
              {reviewError}
            </p>
          ) : null}
        </section>
      ) : null}

      <ExpenseFilesPanel expenseId={expense.id} canRead canUpload={canAttach} />

      <p role="status" aria-live="polite" className="sr-only">
        {announcement}
      </p>
    </>
  );
}
