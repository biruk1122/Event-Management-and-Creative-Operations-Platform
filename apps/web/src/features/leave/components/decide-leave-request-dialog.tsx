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

import type { DecideLeaveRequestOutcome } from "../lib/leave-outcome";
import type { LeaveRequest } from "../lib/leave-types";

const FORM_ERRORS: Record<string, string> = {
  self_approval_forbidden: "You cannot decide your own leave request.",
  already_decided: "This request has already been decided.",
  insufficient_balance: "There isn't enough remaining balance to approve this request.",
  not_found: "This request no longer exists.",
  permission_denied: "You do not have permission to review leave requests.",
  unexpected: "We could not save that decision. Try again.",
};

const TITLES: Record<"APPROVED" | "REJECTED" | "RETURNED_FOR_CHANGES", string> = {
  APPROVED: "Approve leave request",
  REJECTED: "Reject leave request",
  RETURNED_FOR_CHANGES: "Return for changes",
};

export interface DecideLeaveRequestDialogProps {
  item: {
    request: LeaveRequest;
    decision: "APPROVED" | "REJECTED" | "RETURNED_FOR_CHANGES";
  } | null;
  onOpenChange: (open: boolean) => void;
  onDecide: (input: {
    decision: "APPROVED" | "REJECTED" | "RETURNED_FOR_CHANGES";
    reviewNote?: string;
  }) => Promise<DecideLeaveRequestOutcome>;
  onDecided: (request: LeaveRequest) => void;
}

export function DecideLeaveRequestDialog({
  item,
  onOpenChange,
  onDecide,
  onDecided,
}: DecideLeaveRequestDialogProps) {
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
      onDecided(outcome.request);
      close();
      return;
    }
    setFormError(FORM_ERRORS[outcome.status] ?? FORM_ERRORS.unexpected!);
  }

  const title = item ? TITLES[item.decision] : "";

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
              ? `${item.request.employeeName ?? "Employee"} · ${item.request.leaveTypeName} · ${item.request.daysRequested} day${item.request.daysRequested === 1 ? "" : "s"}`
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
