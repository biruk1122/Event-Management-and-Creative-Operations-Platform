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

import type { DecideOvertimeOutcome } from "../lib/attendance-outcome";
import type { OvertimeApproval } from "../lib/attendance-types";

const FORM_ERRORS: Record<string, string> = {
  self_approval_forbidden: "You cannot decide your own overtime.",
  already_decided: "This overtime request was already decided.",
  not_found: "This overtime request no longer exists.",
  permission_denied: "You do not have permission to review overtime.",
  unexpected: "We could not save that decision. Try again.",
};

export interface DecideOvertimeDialogProps {
  item: {
    approval: OvertimeApproval;
    decision: "APPROVED" | "REJECTED";
  } | null;
  onOpenChange: (open: boolean) => void;
  onDecide: (input: {
    decision: "APPROVED" | "REJECTED";
    approvedMinutes?: number;
    decisionReason?: string;
  }) => Promise<DecideOvertimeOutcome>;
  onDecided: (item: OvertimeApproval) => void;
}

export function DecideOvertimeDialog({
  item,
  onOpenChange,
  onDecide,
  onDecided,
}: DecideOvertimeDialogProps) {
  const minutesId = useId();
  const reasonId = useId();
  const [approvedMinutes, setApprovedMinutes] = useState("");
  const [reason, setReason] = useState("");
  const [fieldError, setFieldError] = useState<string | null>(null);
  const [formError, setFormError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  function reset() {
    setApprovedMinutes("");
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
    if (!item) return;
    setFormError(null);
    setFieldError(null);

    let minutes: number | undefined;
    if (item.decision === "APPROVED") {
      minutes = Number(approvedMinutes);
      if (
        approvedMinutes.trim() === "" ||
        Number.isNaN(minutes) ||
        minutes < 0
      ) {
        setFieldError("Enter the approved minutes.");
        return;
      }
      if (minutes > item.approval.potentialMinutes) {
        setFieldError(
          `Cannot exceed the potential ${item.approval.potentialMinutes} minutes.`,
        );
        return;
      }
    }

    setSubmitting(true);
    const outcome = await onDecide({
      decision: item.decision,
      ...(minutes !== undefined ? { approvedMinutes: minutes } : {}),
      ...(reason.trim() ? { decisionReason: reason.trim() } : {}),
    });
    setSubmitting(false);

    if (outcome.status === "success") {
      onDecided(outcome.item);
      close();
      return;
    }
    setFormError(FORM_ERRORS[outcome.status] ?? FORM_ERRORS.unexpected!);
  }

  const title =
    item?.decision === "APPROVED" ? "Approve overtime" : "Reject overtime";

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
              ? `${item.approval.employeeName ?? "Employee"} · ${item.approval.sessionDate} · ${item.approval.potentialMinutes} potential minutes`
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

          {item?.decision === "APPROVED" ? (
            <div className="space-y-2">
              <Label htmlFor={minutesId}>Approved minutes</Label>
              <Input
                id={minutesId}
                inputMode="numeric"
                value={approvedMinutes}
                disabled={submitting}
                onChange={(event) => setApprovedMinutes(event.target.value)}
                aria-invalid={Boolean(fieldError)}
              />
            </div>
          ) : null}

          <div className="space-y-2">
            <Label htmlFor={reasonId}>Note (optional)</Label>
            <Textarea
              id={reasonId}
              value={reason}
              disabled={submitting}
              onChange={(event) => setReason(event.target.value)}
            />
          </div>
          {fieldError ? (
            <p className="text-destructive text-sm">{fieldError}</p>
          ) : null}

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
              variant={
                item?.decision === "REJECTED" ? "destructive" : "default"
              }
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
