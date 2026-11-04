"use client";

import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Alert, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { WorkDialogContent as DialogContent } from "@/components/ui/work-dialog-content";
import { Textarea } from "@/components/ui/textarea";
import type { CurrentAccess } from "@/features/auth/api/access-queries";

import {
  listTalentAssignments,
  transitionTalentAssignment,
  type TalentAssignment,
} from "../api/talent-assignments-gateway";
import { talentKeys } from "../api/talent-queries";
import { AssignTalentDialog } from "./assign-talent-dialog";

const WHEN = new Intl.DateTimeFormat(undefined, {
  dateStyle: "medium",
  timeStyle: "short",
});

const PHASE_LABELS: Record<TalentAssignment["phase"], string> = {
  upcoming: "Upcoming",
  active: "Active",
  completed: "Completed",
  cancelled: "Cancelled",
};

const KIND_LABELS: Record<TalentAssignment["kind"], string> = {
  EVENT: "Event",
  PRODUCTION: "Production",
  PROMOTION: "Promotional activity",
};

function windowLabel(assignment: TalentAssignment): string {
  if (!assignment.startAt && !assignment.endAt) return "Not scheduled";
  const start = assignment.startAt
    ? WHEN.format(new Date(assignment.startAt))
    : "Open";
  const end = assignment.endAt
    ? WHEN.format(new Date(assignment.endAt))
    : "Open";
  return `${start} to ${end}`;
}

const TRANSITION_ERRORS: Record<string, string> = {
  terminal: "This assignment is already completed or cancelled.",
  not_found: "This assignment no longer exists. Refresh the page.",
  permission_denied: "You cannot change this assignment.",
  unexpected: "We could not save the change. Try again.",
};

export interface TalentAssignmentsPanelProps {
  access: CurrentAccess;
  talentId: string;
  talentName: string;
  canAssign: boolean;
  /** Whether the Assign talent dialog is open. The page's header button opens it. */
  assignOpen: boolean;
  onAssignOpenChange: (open: boolean) => void;
  /** Called after any change so the page can refresh the profile. */
  onChanged: () => void;
}

const PHASE_CLASSES: Record<TalentAssignment["phase"], string> = {
  upcoming: "bg-secondary text-secondary-foreground",
  active: "bg-primary/10 text-primary",
  completed: "bg-accent text-primary/70",
  // Plain background with destructive text keeps the contrast above WCAG AA.
  cancelled: "text-destructive border-destructive/40 border",
};

export function TalentAssignmentsPanel({
  access,
  talentId,
  talentName,
  canAssign,
  assignOpen,
  onAssignOpenChange,
  onChanged,
}: TalentAssignmentsPanelProps) {
  const client = useQueryClient();
  const keys = talentKeys(access);
  const [changing, setChanging] = useState<TalentAssignment | null>(null);
  const [cancelling, setCancelling] = useState<TalentAssignment | null>(null);
  const [reason, setReason] = useState("");
  const [reasonError, setReasonError] = useState<string | null>(null);
  const [rowErrors, setRowErrors] = useState<Record<string, string>>({});
  const [announcement, setAnnouncement] = useState("");
  const [busyId, setBusyId] = useState<string | null>(null);

  const query = useQuery({
    queryKey: keys.assignments(talentId),
    queryFn: ({ signal }) => listTalentAssignments(talentId, signal),
    retry: false,
  });
  const assignments = query.data ?? [];
  const activeCount = assignments.filter(
    (item) => item.status === "ASSIGNED",
  ).length;

  function refresh(message: string) {
    setAnnouncement(message);
    void client.invalidateQueries({ queryKey: keys.assignments(talentId) });
    void client.invalidateQueries({ queryKey: keys.activity(talentId) });
    onChanged();
  }

  async function complete(assignment: TalentAssignment) {
    setBusyId(assignment.id);
    setRowErrors((current) => ({ ...current, [assignment.id]: "" }));
    const outcome = await transitionTalentAssignment(
      talentId,
      assignment,
      "COMPLETED",
    );
    setBusyId(null);
    if (outcome.status === "success") {
      refresh("Assignment marked complete.");
      return;
    }
    setRowErrors((current) => ({
      ...current,
      [assignment.id]:
        TRANSITION_ERRORS[outcome.status] ?? TRANSITION_ERRORS.unexpected!,
    }));
  }

  async function confirmCancel() {
    if (!cancelling) return;
    const trimmed = reason.trim();
    if (trimmed === "") {
      setReasonError("Say why the assignment is being cancelled.");
      return;
    }
    setBusyId(cancelling.id);
    const outcome = await transitionTalentAssignment(
      talentId,
      cancelling,
      "CANCELLED",
      trimmed,
    );
    setBusyId(null);
    if (outcome.status === "success") {
      setCancelling(null);
      setReason("");
      setReasonError(null);
      refresh("Assignment cancelled.");
      return;
    }
    setReasonError(
      TRANSITION_ERRORS[outcome.status] ?? TRANSITION_ERRORS.unexpected!,
    );
  }

  return (
    <section
      aria-labelledby="talent-assignments-heading"
      className="border-primary/15 bg-card space-y-4 rounded-2xl border p-6 shadow-sm"
    >
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2
            id="talent-assignments-heading"
            className="text-base font-semibold"
          >
            Assignments
          </h2>
          <p className="text-primary/70 text-sm">
            {activeCount === 1 ? "1 active" : `${activeCount} active`}
          </p>
        </div>
      </div>

      <p role="status" aria-live="polite" className="sr-only">
        {announcement}
      </p>

      {query.isPending ? (
        <p role="status" className="text-primary/70 text-sm">
          Loading assignments…
        </p>
      ) : query.isError ? (
        <Alert variant="destructive">
          <AlertTitle>We could not load assignments.</AlertTitle>
        </Alert>
      ) : assignments.length === 0 ? (
        <p className="text-primary/70 text-sm">Not assigned to any work yet.</p>
      ) : (
        <div className="border-primary/15 overflow-hidden rounded-xl border">
          <div
            aria-hidden="true"
            className="bg-accent/60 text-primary/70 hidden gap-4 px-5 py-3 text-xs font-medium sm:grid sm:grid-cols-[2fr_1.2fr_1.4fr_auto]"
          >
            <span>Related work</span>
            <span>Role</span>
            <span>Date</span>
            <span>Status</span>
          </div>
          <ul className="divide-primary/15 divide-y">
            {assignments.map((assignment) => {
              const active = assignment.status === "ASSIGNED";
              const rowError = rowErrors[assignment.id];
              return (
                <li
                  key={`${assignment.kind}-${assignment.id}`}
                  className="space-y-3 px-5 py-4"
                >
                  <div className="grid gap-2 sm:grid-cols-[2fr_1.2fr_1.4fr_auto] sm:items-center sm:gap-4">
                    <div className="min-w-0">
                      <p className="font-medium">{assignment.workName}</p>
                      <p className="text-primary/70 text-sm">
                        {KIND_LABELS[assignment.kind]}
                      </p>
                    </div>
                    <p className="text-sm">{assignment.role}</p>
                    <p className="text-primary/70 text-sm">
                      {windowLabel(assignment)}
                    </p>
                    <span
                      data-phase={assignment.phase}
                      className={`inline-flex w-fit items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium ${PHASE_CLASSES[assignment.phase]}`}
                    >
                      <span
                        aria-hidden="true"
                        className="size-1.5 rounded-full bg-current"
                      />
                      {PHASE_LABELS[assignment.phase]}
                    </span>
                  </div>
                  {assignment.cancelReason ? (
                    <p className="text-primary/70 text-sm">
                      Cancelled: {assignment.cancelReason}
                    </p>
                  ) : null}
                  {active && canAssign ? (
                    <div className="flex flex-wrap gap-2 pt-1">
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        disabled={busyId === assignment.id}
                        onClick={() => setChanging(assignment)}
                      >
                        Change
                      </Button>
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        disabled={busyId === assignment.id}
                        onClick={() => void complete(assignment)}
                      >
                        Mark complete
                      </Button>
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        disabled={busyId === assignment.id}
                        onClick={() => {
                          setCancelling(assignment);
                          setReason("");
                          setReasonError(null);
                        }}
                      >
                        Cancel assignment
                      </Button>
                    </div>
                  ) : null}
                  {rowError ? (
                    <p role="alert" className="text-destructive text-sm">
                      {rowError}
                    </p>
                  ) : null}
                </li>
              );
            })}
          </ul>
        </div>
      )}

      <AssignTalentDialog
        open={assignOpen && canAssign}
        onOpenChange={onAssignOpenChange}
        access={access}
        talentId={talentId}
        talentName={talentName}
        onSaved={refresh}
      />

      <AssignTalentDialog
        open={changing !== null}
        onOpenChange={(open) => {
          if (!open) setChanging(null);
        }}
        access={access}
        talentId={talentId}
        talentName={talentName}
        assignment={changing}
        onSaved={refresh}
      />

      <Dialog
        open={cancelling !== null}
        onOpenChange={(open) => {
          if (!open) setCancelling(null);
        }}
      >
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Cancel this assignment?</DialogTitle>
            <DialogDescription>
              The cancellation and its reason stay in the history. The work
              stays as it is.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-2">
            <Label htmlFor="cancel-assignment-reason">Reason</Label>
            <Textarea
              id="cancel-assignment-reason"
              maxLength={500}
              rows={3}
              value={reason}
              aria-invalid={reasonError ? true : undefined}
              onChange={(event) => setReason(event.target.value)}
            />
            {reasonError ? (
              <p role="alert" className="text-destructive text-sm">
                {reasonError}
              </p>
            ) : null}
          </div>
          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => setCancelling(null)}
            >
              Keep assignment
            </Button>
            <Button
              type="button"
              variant="destructive"
              disabled={busyId !== null}
              onClick={() => void confirmCancel()}
            >
              Cancel assignment
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </section>
  );
}
