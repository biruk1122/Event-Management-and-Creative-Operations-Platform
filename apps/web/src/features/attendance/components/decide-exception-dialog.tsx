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

import type { DecideExceptionOutcome } from "../lib/attendance-outcome";
import type { AttendanceException } from "../lib/attendance-types";

const FORM_ERRORS: Record<string, string> = {
  self_approval_forbidden: "You cannot decide your own exception.",
  already_decided: "This exception was already decided.",
  not_found: "This exception no longer exists.",
  permission_denied: "You do not have permission to review exceptions.",
  unexpected: "We could not save that decision. Try again.",
};

export interface DecideExceptionDialogProps {
  item: { exception: AttendanceException; decision: "APPROVED" | "REJECTED" } | null;
  onOpenChange: (open: boolean) => void;
  onDecide: (input: {
    decision: "APPROVED" | "REJECTED";
    reviewNote?: string;
  }) => Promise<DecideExceptionOutcome>;
  onDecided: (item: AttendanceException) => void;
}

export function DecideExceptionDialog({
  item,
  onOpenChange,
  onDecide,
  onDecided,
}: DecideExceptionDialogProps) {
  const noteId = useId();
  const [note, setNote] = useState("");
  const [formError, setFormError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  function reset() {
    setNote("");
    setFormError(null);
  }

  function close() {
    reset();
    onOpenChange(false);
  }

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    if (!item) return;
    setFormError(null);
    setSubmitting(true);
    const outcome = await onDecide({
      decision: item.decision,
      ...(note.trim() ? { reviewNote: note.trim() } : {}),
    });
    setSubmitting(false);
    if (outcome.status === "success") {
      onDecided(outcome.item);
      close();
      return;
    }
    setFormError(FORM_ERRORS[outcome.status] ?? FORM_ERRORS.unexpected!);
  }

  const title = item?.decision === "APPROVED" ? "Approve exception" : "Reject exception";

  return (
    <Dialog
      open={item !== null}
      onOpenChange={(next) => {
        if (!next) reset();
        onOpenChange(next);
      }}
    >
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>
            {item
              ? `${item.exception.employeeName ?? "Employee"} · ${item.exception.type}`
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
            <Label htmlFor={noteId}>Note (optional)</Label>
            <Textarea
              id={noteId}
              value={note}
              disabled={submitting}
              onChange={(event) => setNote(event.target.value)}
            />
          </div>

          <DialogFooter>
            <Button type="button" variant="outline" onClick={close} disabled={submitting}>
              Cancel
            </Button>
            <Button
              type="submit"
              variant={item?.decision === "REJECTED" ? "destructive" : "default"}
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
