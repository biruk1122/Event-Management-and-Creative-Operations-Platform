"use client";

import { useId, useState, type FormEvent } from "react";

import { Alert, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
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

import type { CreateLeaveTypeOutcome, LeaveTypeFormValues } from "../lib/leave-outcome";
import type { LeaveType } from "../lib/leave-types";

const FORM_ERRORS: Record<string, string> = {
  name_taken: "A leave type with that name already exists.",
  permission_denied: "You do not have permission to create leave types.",
  unexpected: "We could not create the leave type. Try again.",
};

const EMPTY: LeaveTypeFormValues = {
  name: "",
  description: "",
  isPaid: true,
  requiresDocumentation: false,
  requiresApproval: true,
};

export interface CreateLeaveTypeDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onCreate: (values: LeaveTypeFormValues) => Promise<CreateLeaveTypeOutcome>;
  onCreated: (type: LeaveType) => void;
}

export function CreateLeaveTypeDialog({
  open,
  onOpenChange,
  onCreate,
  onCreated,
}: CreateLeaveTypeDialogProps) {
  const nameId = useId();
  const descriptionId = useId();
  const isPaidId = useId();
  const requiresDocumentationId = useId();
  const requiresApprovalId = useId();

  const [values, setValues] = useState<LeaveTypeFormValues>(EMPTY);
  const [fieldErrors, setFieldErrors] = useState<
    Partial<Record<keyof LeaveTypeFormValues, string>>
  >({});
  const [formError, setFormError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  function set<K extends keyof LeaveTypeFormValues>(key: K, value: LeaveTypeFormValues[K]) {
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

    if (values.name.trim() === "") {
      setFieldErrors({ name: "Enter a name." });
      return;
    }

    setSubmitting(true);
    setFieldErrors({});
    const outcome = await onCreate(values);
    setSubmitting(false);

    switch (outcome.status) {
      case "success":
        onCreated(outcome.type);
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
          <DialogTitle>New leave type</DialogTitle>
          <DialogDescription>
            Define a leave category employees can request against once HR
            grants a balance for it.
          </DialogDescription>
        </DialogHeader>

        <form
          aria-label="Create leave type"
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
            <Label htmlFor={nameId}>Name</Label>
            <Input
              id={nameId}
              value={values.name}
              disabled={submitting}
              onChange={(event) => set("name", event.target.value)}
              aria-invalid={Boolean(fieldErrors.name)}
            />
            {fieldErrors.name ? (
              <p className="text-destructive text-sm">{fieldErrors.name}</p>
            ) : null}
          </div>

          <div className="space-y-2">
            <Label htmlFor={descriptionId}>Description (optional)</Label>
            <Textarea
              id={descriptionId}
              value={values.description}
              disabled={submitting}
              onChange={(event) => set("description", event.target.value)}
            />
          </div>

          <div className="space-y-3">
            <label htmlFor={isPaidId} className="flex items-center gap-2 text-sm">
              <Checkbox
                id={isPaidId}
                checked={values.isPaid}
                disabled={submitting}
                onCheckedChange={(checked) => set("isPaid", checked === true)}
              />
              Paid
            </label>
            <label
              htmlFor={requiresDocumentationId}
              className="flex items-center gap-2 text-sm"
            >
              <Checkbox
                id={requiresDocumentationId}
                checked={values.requiresDocumentation}
                disabled={submitting}
                onCheckedChange={(checked) =>
                  set("requiresDocumentation", checked === true)
                }
              />
              Requires supporting documentation
            </label>
            <label htmlFor={requiresApprovalId} className="flex items-center gap-2 text-sm">
              <Checkbox
                id={requiresApprovalId}
                checked={values.requiresApproval}
                disabled={submitting}
                onCheckedChange={(checked) => set("requiresApproval", checked === true)}
              />
              Requires approval
            </label>
          </div>

          <DialogFooter>
            <Button type="button" variant="outline" onClick={close} disabled={submitting}>
              Cancel
            </Button>
            <Button type="submit" disabled={submitting} aria-busy={submitting}>
              {submitting ? "Creating…" : "Create leave type"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
