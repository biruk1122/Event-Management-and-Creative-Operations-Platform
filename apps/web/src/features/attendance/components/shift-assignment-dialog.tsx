"use client";

import { useId, useState } from "react";

import { Alert, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogDescription,
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
import type { CurrentAccess } from "@/features/auth/api/access-queries";

import { useEligibleEmployees, useShiftAssignments, useShiftMutations } from "../api/attendance-queries";
import type { EventShift } from "../lib/attendance-types";

const FAILURE_MESSAGES: Record<string, string> = {
  employee_not_found: "That employee is no longer active.",
  leave_conflict: "This employee has approved leave covering this shift.",
  assignment_not_found: "That assignment no longer exists.",
  permission_denied: "You do not have permission to manage assignments.",
  unexpected: "That didn't go through. Try again.",
};

export interface ShiftAssignmentDialogProps {
  access: CurrentAccess;
  eventId: string;
  departmentId: string | null;
  shift: EventShift | null;
  onOpenChange: (open: boolean) => void;
}

export function ShiftAssignmentDialog({
  access,
  eventId,
  departmentId,
  shift,
  onOpenChange,
}: ShiftAssignmentDialogProps) {
  const selectId = useId();
  const shiftId = shift?.id ?? null;
  const assignments = useShiftAssignments(access, shift ? eventId : null, shiftId);
  const eligible = useEligibleEmployees(access, departmentId);
  const mutations = useShiftMutations(access, eventId);
  const [selected, setSelected] = useState("");
  const [error, setError] = useState<string | null>(null);

  function close() {
    setSelected("");
    setError(null);
    onOpenChange(false);
  }

  async function handleAssign() {
    if (!shiftId || !selected) return;
    setError(null);
    const outcome = await mutations.assign.mutateAsync({ shiftId, employeeId: selected });
    if (outcome.status === "success") {
      setSelected("");
      return;
    }
    setError(FAILURE_MESSAGES[outcome.status] ?? FAILURE_MESSAGES.unexpected!);
  }

  async function handleUnassign(employeeId: string) {
    if (!shiftId) return;
    setError(null);
    const outcome = await mutations.unassign.mutateAsync({ shiftId, employeeId });
    if (outcome.status !== "success") {
      setError(FAILURE_MESSAGES[outcome.status] ?? FAILURE_MESSAGES.unexpected!);
    }
  }

  const assignedIds = new Set((assignments.data ?? []).map((a) => a.employeeId));
  const candidates = (eligible.data ?? []).filter((person) => !assignedIds.has(person.id));
  const busy = mutations.assign.isPending || mutations.unassign.isPending;

  return (
    <Dialog
      open={shift !== null}
      onOpenChange={(next) => {
        if (!next) close();
        else onOpenChange(next);
      }}
    >
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Shift assignments</DialogTitle>
          <DialogDescription>
            {shift ? `${shift.eventName}${shift.label ? ` · ${shift.label}` : ""}` : ""}
          </DialogDescription>
        </DialogHeader>

        {error ? (
          <Alert variant="destructive" aria-live="assertive">
            <AlertTitle>{error}</AlertTitle>
          </Alert>
        ) : null}

        <div className="space-y-2">
          <Label htmlFor={selectId}>Assign an employee</Label>
          <div className="flex gap-2">
            <Select value={selected} onValueChange={setSelected} disabled={busy}>
              <SelectTrigger id={selectId} className="flex-1">
                <SelectValue placeholder="Choose an employee" />
              </SelectTrigger>
              <SelectContent>
                {candidates.length === 0 ? (
                  <SelectItem value="none" disabled>
                    No eligible employees
                  </SelectItem>
                ) : (
                  candidates.map((person) => (
                    <SelectItem key={person.id} value={person.id}>
                      {person.name}
                    </SelectItem>
                  ))
                )}
              </SelectContent>
            </Select>
            <Button disabled={!selected || busy} onClick={() => void handleAssign()}>
              Assign
            </Button>
          </div>
        </div>

        <ul className="space-y-2">
          {assignments.isPending ? (
            <li role="status" className="text-muted-foreground text-sm">
              Loading assignments…
            </li>
          ) : (assignments.data ?? []).length === 0 ? (
            <li className="text-muted-foreground text-sm">No one is assigned yet.</li>
          ) : (
            (assignments.data ?? []).map((assignment) => (
              <li
                key={assignment.employeeId}
                className="flex items-center justify-between rounded-lg border p-2"
              >
                <span>{assignment.employeeName ?? "Former employee"}</span>
                <Button
                  variant="outline"
                  size="sm"
                  disabled={busy}
                  onClick={() => void handleUnassign(assignment.employeeId)}
                >
                  Remove
                </Button>
              </li>
            ))
          )}
        </ul>
      </DialogContent>
    </Dialog>
  );
}
