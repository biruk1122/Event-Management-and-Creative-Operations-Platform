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
import { Textarea } from "@/components/ui/textarea";

import type { ShiftOutcome } from "../lib/attendance-outcome";
import type { EventShift } from "../lib/attendance-types";

const FORM_ERRORS: Record<string, string> = {
  shift_not_found: "This shift no longer exists.",
  shift_not_available: "This shift is already cancelled or has ended.",
  shift_not_cancelled: "This shift is not cancelled.",
  permission_denied: "You do not have permission to do that.",
  unexpected: "We could not save that change. Try again.",
};

export interface ShiftReasonDialogProps {
  mode: "cancel" | "reinstate";
  shift: EventShift | null;
  onOpenChange: (open: boolean) => void;
  onSubmit: (reason: string) => Promise<ShiftOutcome>;
  onDone: (shift: EventShift) => void;
}

export function ShiftReasonDialog({
  mode,
  shift,
  onOpenChange,
  onSubmit,
  onDone,
}: ShiftReasonDialogProps) {
  const reasonId = useId();
  const [reason, setReason] = useState("");
  const [fieldError, setFieldError] = useState<string | null>(null);
  const [formError, setFormError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  function reset() {
    setReason("");
    setFieldError(null);
    setFormError(null);
  }

  function close() {
    reset();
    onOpenChange(false);
  }

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    setFormError(null);
    if (reason.trim() === "") {
      setFieldError(
        mode === "cancel"
          ? "Explain why this shift is being cancelled."
          : "Explain why this shift is being reinstated.",
      );
      return;
    }
    setFieldError(null);
    setSubmitting(true);
    const outcome = await onSubmit(reason.trim());
    setSubmitting(false);
    if (outcome.status === "success") {
      onDone(outcome.shift);
      close();
      return;
    }
    setFormError(FORM_ERRORS[outcome.status] ?? FORM_ERRORS.unexpected!);
  }

  const title = mode === "cancel" ? "Cancel shift" : "Reinstate shift";

  return (
    <Dialog
      open={shift !== null}
      onOpenChange={(next) => {
        if (!next) reset();
        onOpenChange(next);
      }}
    >
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>
            {shift
              ? `${shift.eventName}${shift.label ? ` · ${shift.label}` : ""}`
              : ""}
          </DialogDescription>
        </DialogHeader>

        <form
          aria-label={title}
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
            <Label htmlFor={reasonId}>Reason</Label>
            <Textarea
              id={reasonId}
              value={reason}
              disabled={submitting}
              onChange={(event) => setReason(event.target.value)}
              aria-invalid={Boolean(fieldError)}
            />
            {fieldError ? (
              <p className="text-destructive text-sm">{fieldError}</p>
            ) : null}
          </div>
          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={close}
              disabled={submitting}
            >
              Back
            </Button>
            <Button
              type="submit"
              variant={mode === "cancel" ? "destructive" : "default"}
              disabled={submitting}
              aria-busy={submitting}
            >
              {submitting ? "Saving…" : title}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
