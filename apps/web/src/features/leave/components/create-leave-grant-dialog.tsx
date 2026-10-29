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
  CreateLeaveGrantOutcome,
  LeaveGrantFormValues,
} from "../lib/leave-outcome";
import type { LeaveGrant, LeaveType } from "../lib/leave-types";

const FORM_ERRORS: Record<string, string> = {
  employee_not_found: "That employee is no longer active.",
  type_not_found: "That leave type no longer exists.",
  type_inactive: "That leave type is no longer active.",
  permission_denied: "You do not have permission to grant leave.",
  unexpected: "We could not create the grant. Try again.",
};

const EMPTY: LeaveGrantFormValues = {
  leaveTypeId: "",
  grantedDays: "",
  note: "",
};

export interface CreateLeaveGrantDialogProps {
  open: boolean;
  employeeName: string;
  types: readonly LeaveType[];
  onOpenChange: (open: boolean) => void;
  onCreate: (values: LeaveGrantFormValues) => Promise<CreateLeaveGrantOutcome>;
  onCreated: (grant: LeaveGrant) => void;
}

export function CreateLeaveGrantDialog({
  open,
  employeeName,
  types,
  onOpenChange,
  onCreate,
  onCreated,
}: CreateLeaveGrantDialogProps) {
  const typeId = useId();
  const daysId = useId();
  const noteId = useId();

  const [values, setValues] = useState<LeaveGrantFormValues>(EMPTY);
  const [fieldErrors, setFieldErrors] = useState<
    Partial<Record<keyof LeaveGrantFormValues, string>>
  >({});
  const [formError, setFormError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  function set<K extends keyof LeaveGrantFormValues>(
    key: K,
    value: LeaveGrantFormValues[K],
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

    const localErrors: Partial<Record<keyof LeaveGrantFormValues, string>> = {};
    if (values.leaveTypeId === "")
      localErrors.leaveTypeId = "Choose a leave type.";
    const days = Number(values.grantedDays);
    if (
      values.grantedDays.trim() === "" ||
      Number.isNaN(days) ||
      days < 1 ||
      days > 365
    ) {
      localErrors.grantedDays = "Enter a number of days between 1 and 365.";
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
        onCreated(outcome.grant);
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
          <DialogTitle>Grant leave balance</DialogTitle>
          <DialogDescription>
            {employeeName} · the grant is valid for exactly two years from
            today.
          </DialogDescription>
        </DialogHeader>

        <form
          aria-label="Grant leave balance"
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

          <div className="space-y-2">
            <Label htmlFor={daysId}>Days granted</Label>
            <Input
              id={daysId}
              inputMode="numeric"
              value={values.grantedDays}
              disabled={submitting}
              onChange={(event) => set("grantedDays", event.target.value)}
              aria-invalid={Boolean(fieldErrors.grantedDays)}
            />
            {fieldErrors.grantedDays ? (
              <p className="text-destructive text-sm">
                {fieldErrors.grantedDays}
              </p>
            ) : null}
          </div>

          <div className="space-y-2">
            <Label htmlFor={noteId}>Note (optional)</Label>
            <Textarea
              id={noteId}
              value={values.note}
              disabled={submitting}
              onChange={(event) => set("note", event.target.value)}
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
              {submitting ? "Granting…" : "Grant leave"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
