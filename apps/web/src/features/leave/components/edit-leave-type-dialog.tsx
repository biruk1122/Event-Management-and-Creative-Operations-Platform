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
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";

import type {
  UpdateLeaveTypeFormValues,
  UpdateLeaveTypeOutcome,
} from "../lib/leave-outcome";
import type { LeaveType } from "../lib/leave-types";

const FORM_ERRORS: Record<string, string> = {
  not_found: "This leave type no longer exists.",
  permission_denied: "You do not have permission to update leave types.",
  unexpected: "We could not save that change. Try again.",
};

function valuesFrom(type: LeaveType): UpdateLeaveTypeFormValues {
  return {
    description: type.description ?? "",
    isPaid: type.isPaid,
    requiresDocumentation: type.requiresDocumentation,
    requiresApproval: type.requiresApproval,
    isActive: type.isActive,
  };
}

export interface EditLeaveTypeDialogProps {
  type: LeaveType | null;
  onOpenChange: (open: boolean) => void;
  onUpdate: (
    values: UpdateLeaveTypeFormValues,
  ) => Promise<UpdateLeaveTypeOutcome>;
  onUpdated: (type: LeaveType) => void;
}

export function EditLeaveTypeDialog({
  type,
  onOpenChange,
  onUpdate,
  onUpdated,
}: EditLeaveTypeDialogProps) {
  const descriptionId = useId();
  const isPaidId = useId();
  const requiresDocumentationId = useId();
  const requiresApprovalId = useId();
  const isActiveId = useId();

  const [values, setValues] = useState<UpdateLeaveTypeFormValues | null>(null);
  const [formError, setFormError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const current = values ?? (type ? valuesFrom(type) : null);

  function set<K extends keyof UpdateLeaveTypeFormValues>(
    key: K,
    value: UpdateLeaveTypeFormValues[K],
  ) {
    setValues({ ...(current ?? valuesFrom(type!)), [key]: value });
  }

  function reset() {
    setValues(null);
    setFormError(null);
  }

  function close() {
    reset();
    onOpenChange(false);
  }

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    if (!current) return;
    setFormError(null);
    setSubmitting(true);
    const outcome = await onUpdate(current);
    setSubmitting(false);

    if (outcome.status === "success") {
      onUpdated(outcome.type);
      close();
      return;
    }
    setFormError(FORM_ERRORS[outcome.status] ?? FORM_ERRORS.unexpected!);
  }

  return (
    <Dialog
      open={type !== null}
      onOpenChange={(next) => {
        if (!next) reset();
        onOpenChange(next);
      }}
    >
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Edit leave type</DialogTitle>
          <DialogDescription>{type?.name}</DialogDescription>
        </DialogHeader>

        {current ? (
          <form
            aria-label="Edit leave type"
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
              <Label htmlFor={descriptionId}>Description (optional)</Label>
              <Textarea
                id={descriptionId}
                value={current.description}
                disabled={submitting}
                onChange={(event) => set("description", event.target.value)}
              />
            </div>

            <div className="space-y-3">
              <label
                htmlFor={isPaidId}
                className="flex items-center gap-2 text-sm"
              >
                <Checkbox
                  id={isPaidId}
                  checked={current.isPaid}
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
                  checked={current.requiresDocumentation}
                  disabled={submitting}
                  onCheckedChange={(checked) =>
                    set("requiresDocumentation", checked === true)
                  }
                />
                Requires supporting documentation
              </label>
              <label
                htmlFor={requiresApprovalId}
                className="flex items-center gap-2 text-sm"
              >
                <Checkbox
                  id={requiresApprovalId}
                  checked={current.requiresApproval}
                  disabled={submitting}
                  onCheckedChange={(checked) =>
                    set("requiresApproval", checked === true)
                  }
                />
                Requires approval
              </label>
              <label
                htmlFor={isActiveId}
                className="flex items-center gap-2 text-sm"
              >
                <Checkbox
                  id={isActiveId}
                  checked={current.isActive}
                  disabled={submitting}
                  onCheckedChange={(checked) =>
                    set("isActive", checked === true)
                  }
                />
                Active
              </label>
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
              <Button
                type="submit"
                disabled={submitting}
                aria-busy={submitting}
              >
                {submitting ? "Saving…" : "Save changes"}
              </Button>
            </DialogFooter>
          </form>
        ) : null}
      </DialogContent>
    </Dialog>
  );
}
