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

import type { ShiftOutcome } from "../lib/attendance-outcome";
import type { EventShift } from "../lib/attendance-types";

const FORM_ERRORS: Record<string, string> = {
  shift_not_found: "This shift no longer exists.",
  shift_not_available: "This shift is cancelled or has already ended.",
  permission_denied: "You do not have permission to reschedule this shift.",
  unexpected: "We could not reschedule the shift. Try again.",
};

function toLocalInput(iso: string): string {
  const date = new Date(iso);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(
    date.getHours(),
  )}:${pad(date.getMinutes())}`;
}

export interface RescheduleShiftDialogProps {
  shift: EventShift | null;
  onOpenChange: (open: boolean) => void;
  onReschedule: (input: {
    plannedStartAt?: string;
    plannedEndAt?: string;
    reason: string;
  }) => Promise<ShiftOutcome>;
  onRescheduled: (shift: EventShift) => void;
}

export function RescheduleShiftDialog({
  shift,
  onOpenChange,
  onReschedule,
  onRescheduled,
}: RescheduleShiftDialogProps) {
  const startId = useId();
  const endId = useId();
  const reasonId = useId();

  const [plannedStartAt, setPlannedStartAt] = useState("");
  const [plannedEndAt, setPlannedEndAt] = useState("");
  const [reason, setReason] = useState("");
  const [fieldError, setFieldError] = useState<string | null>(null);
  const [formError, setFormError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  function reset() {
    setPlannedStartAt("");
    setPlannedEndAt("");
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
    setFieldError(null);

    if (reason.trim() === "") {
      setFieldError("Explain why this shift is being rescheduled.");
      return;
    }
    if (plannedStartAt === "" && plannedEndAt === "") {
      setFieldError("Change the start time, the end time, or both.");
      return;
    }

    setSubmitting(true);
    const outcome = await onReschedule({
      ...(plannedStartAt ? { plannedStartAt } : {}),
      ...(plannedEndAt ? { plannedEndAt } : {}),
      reason: reason.trim(),
    });
    setSubmitting(false);

    switch (outcome.status) {
      case "success":
        onRescheduled(outcome.shift);
        close();
        return;
      case "invalid_schedule":
        setFieldError(outcome.message);
        return;
      default:
        setFormError(FORM_ERRORS[outcome.status] ?? FORM_ERRORS.unexpected!);
    }
  }

  return (
    <Dialog
      open={shift !== null}
      onOpenChange={(next) => {
        if (!next) reset();
        onOpenChange(next);
      }}
    >
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Reschedule shift</DialogTitle>
          <DialogDescription>
            {shift ? `${shift.eventName}${shift.label ? ` · ${shift.label}` : ""}` : ""}
          </DialogDescription>
        </DialogHeader>

        <form
          aria-label="Reschedule shift"
          className="space-y-4"
          noValidate
          onSubmit={(event) => void handleSubmit(event)}
        >
          {formError ? (
            <Alert variant="destructive" aria-live="assertive">
              <AlertTitle>{formError}</AlertTitle>
            </Alert>
          ) : null}

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor={startId}>New start (optional)</Label>
              <Input
                id={startId}
                type="datetime-local"
                value={plannedStartAt}
                disabled={submitting}
                placeholder={shift ? toLocalInput(shift.plannedStartAt) : ""}
                onChange={(event) => setPlannedStartAt(event.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor={endId}>New end (optional)</Label>
              <Input
                id={endId}
                type="datetime-local"
                value={plannedEndAt}
                disabled={submitting}
                placeholder={shift ? toLocalInput(shift.plannedEndAt) : ""}
                onChange={(event) => setPlannedEndAt(event.target.value)}
              />
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor={reasonId}>Reason</Label>
            <Textarea
              id={reasonId}
              value={reason}
              disabled={submitting}
              onChange={(event) => setReason(event.target.value)}
              aria-invalid={Boolean(fieldError)}
            />
            {fieldError ? <p className="text-destructive text-sm">{fieldError}</p> : null}
          </div>

          <DialogFooter>
            <Button type="button" variant="outline" onClick={close} disabled={submitting}>
              Cancel
            </Button>
            <Button type="submit" disabled={submitting} aria-busy={submitting}>
              {submitting ? "Saving…" : "Reschedule"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
