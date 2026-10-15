"use client";

import { useId, useState, type FormEvent } from "react";

import { Alert, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { WorkDialogContent as DialogContent } from "@/components/ui/work-dialog-content";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

import { ExpenseFields, type ExpenseFieldValues } from "./expense-fields";
import type {
  CreateExpense,
  CreateExpenseValues,
} from "../lib/expenses-outcome";
import type {
  AssignableEvent,
  AssignableSupplier,
  Expense,
} from "../lib/expenses-types";

const FORM_ERRORS: Record<string, string> = {
  event_not_found: "That event no longer exists. Pick another.",
  event_has_no_department:
    "That event has no department and cannot carry expenses yet.",
  production_not_found: "That production no longer exists.",
  production_has_no_department:
    "That production has no department and cannot carry expenses yet.",
  owner_required: "Pick an event or a production for this expense.",
  supplier_not_found:
    "That supplier no longer exists. Pick another or clear it.",
  permission_denied: "You do not have permission to create an expense.",
  unexpected: "We could not create the expense. Try again.",
};

const EMPTY_FIELDS: ExpenseFieldValues = {
  supplierId: null,
  category: "MISCELLANEOUS",
  description: "",
  plannedAmount: "",
  actualAmount: "",
  currency: "USD",
};

interface CreateExpenseDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  events: readonly AssignableEvent[];
  suppliers: readonly AssignableSupplier[];
  onCreate: CreateExpense;
  onCreated: (expense: Expense) => void;
  /** When set, this expense is recorded directly against a production (no
   * linked event required) and the event picker is hidden - lets a
   * production with no linked event still record its own spend. */
  productionId?: string;
}

export function CreateExpenseDialog({
  open,
  onOpenChange,
  events,
  suppliers,
  onCreate,
  onCreated,
  productionId,
}: CreateExpenseDialogProps) {
  const eventId = useId();

  const [values, setValues] = useState<ExpenseFieldValues>(EMPTY_FIELDS);
  const [eventValue, setEventValue] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<
    Partial<Record<keyof CreateExpenseValues, string>>
  >({});
  const [formError, setFormError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  function reset() {
    setValues(EMPTY_FIELDS);
    setEventValue(null);
    setFieldErrors({});
    setFormError(null);
  }

  function close() {
    reset();
    onOpenChange(false);
  }

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    setFormError(null);

    const localErrors: Partial<Record<keyof CreateExpenseValues, string>> = {};
    if (!productionId && eventValue === null) {
      localErrors.eventId = "Pick an event.";
    }
    if (values.description.trim() === "") {
      localErrors.description = "Enter a description.";
    }
    if (values.actualAmount.trim() === "") {
      localErrors.actualAmount = "Enter the actual amount.";
    }
    if (values.currency.trim().length !== 3) {
      localErrors.currency = "Use a 3-letter currency code.";
    }
    if (Object.keys(localErrors).length > 0) {
      setFieldErrors(localErrors);
      return;
    }

    setSubmitting(true);
    setFieldErrors({});
    const outcome = await onCreate({
      ...values,
      eventId: productionId ? null : eventValue,
      productionId: productionId ?? null,
    });
    setSubmitting(false);

    switch (outcome.status) {
      case "success":
        onCreated(outcome.expense);
        close();
        return;
      case "field_errors":
        setFieldErrors(outcome.fieldErrors);
        return;
      default:
        setFormError(FORM_ERRORS[outcome.status] ?? FORM_ERRORS.unexpected!);
    }
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!next) reset();
        onOpenChange(next);
      }}
    >
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>New expense</DialogTitle>
          <DialogDescription>
            {productionId
              ? "Record what this production cost. It starts as a draft - submit it for approval when it is ready."
              : "Pick the event this expense belongs to, then record what it cost. It starts as a draft - submit it for approval when it is ready."}
          </DialogDescription>
        </DialogHeader>

        <form
          aria-label="Create expense"
          className="space-y-4"
          noValidate
          onSubmit={(event) => void handleSubmit(event)}
        >
          {formError ? (
            <Alert variant="destructive" aria-live="assertive">
              <AlertTitle>{formError}</AlertTitle>
            </Alert>
          ) : null}

          {productionId ? null : (
            <div className="space-y-2">
              <Label htmlFor={eventId}>Event</Label>
              <Select
                value={eventValue ?? ""}
                disabled={submitting}
                onValueChange={(value) => setEventValue(value)}
              >
                <SelectTrigger
                  id={eventId}
                  aria-invalid={fieldErrors.eventId ? true : undefined}
                  aria-describedby={
                    fieldErrors.eventId ? `${eventId}-error` : undefined
                  }
                >
                  <SelectValue placeholder="Choose an event…" />
                </SelectTrigger>
                <SelectContent>
                  {events.map((event) => (
                    <SelectItem key={event.id} value={event.id}>
                      {event.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {fieldErrors.eventId ? (
                <p id={`${eventId}-error`} className="text-destructive text-sm">
                  {fieldErrors.eventId}
                </p>
              ) : null}
            </div>
          )}

          <ExpenseFields
            values={values}
            errors={fieldErrors}
            suppliers={suppliers}
            disabled={submitting}
            onChange={(key, value) =>
              setValues((current) => ({ ...current, [key]: value }))
            }
          />

          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={close}
              disabled={submitting}
            >
              Cancel
            </Button>
            <Button type="submit" disabled={submitting} aria-busy={submitting}>
              {submitting ? "Creating…" : "Create expense"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
