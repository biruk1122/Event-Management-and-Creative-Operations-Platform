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
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

import type {
  CreateLeaveRequestOutcome,
  LeaveRequestFormValues,
} from "../lib/leave-outcome";
import type { LeaveRequest, LeaveType } from "../lib/leave-types";

const FORM_ERRORS: Record<string, string> = {
  type_not_found: "That leave type no longer exists.",
  type_inactive: "That leave type is no longer active.",
  invalid_date_range: "The end date must be on or after the start date.",
  overlap: "This date range overlaps an existing pending or approved request.",
  insufficient_balance:
    "There isn't enough remaining balance for this leave type.",
  permission_denied: "You do not have permission to submit a leave request.",
  unexpected: "We could not submit the request. Try again.",
};

const EMPTY: LeaveRequestFormValues = {
  leaveTypeId: "",
  startDate: "",
  endDate: "",
  reason: "",
};

export interface CreateLeaveRequestDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  types: readonly LeaveType[];
  onCreate: (
    values: LeaveRequestFormValues,
  ) => Promise<CreateLeaveRequestOutcome>;
  onCreated: (request: LeaveRequest) => void;
}

export function CreateLeaveRequestDialog({
  open,
  onOpenChange,
  types,
  onCreate,
  onCreated,
}: CreateLeaveRequestDialogProps) {
  const typeId = useId();
  const startId = useId();
  const endId = useId();
  const reasonId = useId();

  const [values, setValues] = useState<LeaveRequestFormValues>(EMPTY);
  const [fieldErrors, setFieldErrors] = useState<
    Partial<Record<keyof LeaveRequestFormValues, string>>
  >({});
  const [formError, setFormError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  function set<K extends keyof LeaveRequestFormValues>(
    key: K,
    value: LeaveRequestFormValues[K],
  ) {
    setValues((current) => ({ ...current, [key]: value }));
  }

  function reset() {
    setValues(EMPTY);
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

    const localErrors: Partial<Record<keyof LeaveRequestFormValues, string>> =
      {};
    if (values.leaveTypeId === "")
      localErrors.leaveTypeId = "Choose a leave type.";
    if (values.startDate === "") localErrors.startDate = "Set a start date.";
    if (values.endDate === "") localErrors.endDate = "Set an end date.";
    if (
      values.startDate !== "" &&
      values.endDate !== "" &&
      values.endDate < values.startDate
    ) {
      localErrors.endDate = "The end date must be on or after the start date.";
    }
    if (Object.keys(localErrors).length > 0) {
      setFieldErrors(localErrors);
      return;
    }

    setSubmitting(true);
    setFieldErrors({});
    const outcome = await onCreate(values);
    setSubmitting(false);

    switch (outcome.status) {
      case "success":
        onCreated(outcome.request);
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
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Request leave</DialogTitle>
          <DialogDescription>
            Full-day leave only. The days requested are checked against your
            remaining, non-expired balance for the chosen type.
          </DialogDescription>
        </DialogHeader>

        <form
          aria-label="Request leave"
          className="space-y-4"
          noValidate
          onSubmit={(event) => void handleSubmit(event)}
        >
          {formError ? (
            <Alert variant="destructive" aria-live="assertive">
              <AlertTitle>{formError}</AlertTitle>
            </Alert>
          ) : null}

          <div className="space-y-2">
            <Label htmlFor={typeId}>Leave type</Label>
            <Select
              value={values.leaveTypeId}
              disabled={submitting}
              onValueChange={(value) => set("leaveTypeId", value)}
            >
              <SelectTrigger
                id={typeId}
                aria-invalid={Boolean(fieldErrors.leaveTypeId)}
              >
                <SelectValue placeholder="Choose a leave type" />
              </SelectTrigger>
              <SelectContent>
                {types.map((type) => (
                  <SelectItem key={type.id} value={type.id}>
                    {type.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {fieldErrors.leaveTypeId ? (
              <p className="text-destructive text-sm">
                {fieldErrors.leaveTypeId}
              </p>
            ) : null}
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor={startId}>Start date</Label>
              <Input
                id={startId}
                type="date"
                value={values.startDate}
                disabled={submitting}
                onChange={(event) => set("startDate", event.target.value)}
                aria-invalid={Boolean(fieldErrors.startDate)}
              />
              {fieldErrors.startDate ? (
                <p className="text-destructive text-sm">
                  {fieldErrors.startDate}
                </p>
              ) : null}
            </div>
            <div className="space-y-2">
              <Label htmlFor={endId}>End date</Label>
              <Input
                id={endId}
                type="date"
                value={values.endDate}
                disabled={submitting}
                onChange={(event) => set("endDate", event.target.value)}
                aria-invalid={Boolean(fieldErrors.endDate)}
              />
              {fieldErrors.endDate ? (
                <p className="text-destructive text-sm">
                  {fieldErrors.endDate}
                </p>
              ) : null}
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor={reasonId}>Reason (optional)</Label>
            <Textarea
              id={reasonId}
              value={values.reason}
              disabled={submitting}
              onChange={(event) => set("reason", event.target.value)}
            />
          </div>

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
              {submitting ? "Submitting…" : "Submit request"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
