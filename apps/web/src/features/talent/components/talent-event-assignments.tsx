"use client";

import { useEffect, useId, useRef, useState, type FormEvent } from "react";
import { Plus } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

import { AssignmentStatusBadge } from "./availability-badges";
import type {
  AssignEvent,
  TalentAssignmentValues,
  TransitionAssignment,
} from "../lib/talent-outcome";
import {
  assignmentStatusLabel,
  NEXT_ASSIGNMENT_STATUSES,
  type AssignableEvent,
  type Talent,
  type TalentAssignmentStatus,
  type TalentEventAssignment,
} from "../lib/talent-types";

const ACTION_ERRORS: Record<string, string> = {
  conflict: "This talent is already assigned to that event.",
  event_not_found: "That event no longer exists. Pick another.",
  invalid_transition: "That move is not allowed from the current status.",
  not_found: "This assignment no longer exists. Refresh the list.",
  permission_denied: "You do not have permission to do that.",
  unexpected: "We could not save that change. Try again.",
};

function actionError(key: string): string {
  return ACTION_ERRORS[key] ?? ACTION_ERRORS.unexpected!;
}

const PICK_STATUS = "PICK_STATUS";
const EMPTY_VALUES: TalentAssignmentValues = { eventId: "", role: "" };

interface TalentEventAssignmentsProps {
  talentId: string;
  assignments: readonly TalentEventAssignment[];
  events: readonly AssignableEvent[];
  /** Whether the caller may create and transition assignments. */
  canManage: boolean;
  onAssign: AssignEvent;
  onTransition: TransitionAssignment;
  onChanged: (talent: Talent) => void;
}

/**
 * A talent's event assignments. There is no removal or edit route - only
 * creation and status transitions (ASSIGNED -> COMPLETED/CANCELLED, both
 * terminal), matching `talent.lifecycle.ts`.
 */
export function TalentEventAssignments({
  talentId,
  assignments,
  events,
  canManage,
  onAssign,
  onTransition,
  onChanged,
}: TalentEventAssignmentsProps) {
  const headingId = useId();
  const ids = { event: useId(), role: useId() };
  const roleRef = useRef<HTMLInputElement>(null);

  const [adding, setAdding] = useState(false);
  const [values, setValues] = useState<TalentAssignmentValues>(EMPTY_VALUES);
  const [eventError, setEventError] = useState<string | null>(null);
  const [roleError, setRoleError] = useState<string | null>(null);
  const [formError, setFormError] = useState<string | null>(null);
  const [addBusy, setAddBusy] = useState(false);

  const [busyId, setBusyId] = useState<string | null>(null);
  const [rowError, setRowError] = useState<{
    id: string;
    message: string;
  } | null>(null);
  const [announcement, setAnnouncement] = useState("");

  useEffect(() => {
    if (adding) roleRef.current?.focus();
  }, [adding]);

  async function submitAdd(event: FormEvent) {
    event.preventDefault();
    setFormError(null);
    setEventError(null);
    setRoleError(null);

    let invalid = false;
    if (values.eventId === "") {
      setEventError("Pick an event.");
      invalid = true;
    }
    if (values.role.trim() === "") {
      setRoleError("Enter a role.");
      invalid = true;
    }
    if (invalid) return;

    setAddBusy(true);
    const outcome = await onAssign(talentId, values);
    setAddBusy(false);

    if (outcome.status === "success") {
      onChanged(outcome.talent);
      setValues(EMPTY_VALUES);
      setAdding(false);
      setAnnouncement("Event assignment added.");
      return;
    }
    if (outcome.status === "field_errors") {
      if (outcome.fieldErrors.eventId)
        setEventError(outcome.fieldErrors.eventId);
      if (outcome.fieldErrors.role) setRoleError(outcome.fieldErrors.role);
      return;
    }
    if (outcome.status === "conflict" || outcome.status === "event_not_found") {
      setEventError(actionError(outcome.status));
      return;
    }
    setFormError(actionError(outcome.status));
  }

  async function changeStatus(
    assignment: TalentEventAssignment,
    status: TalentAssignmentStatus,
  ) {
    if (status === assignment.status) return;
    setBusyId(assignment.id);
    setRowError(null);
    const outcome = await onTransition(talentId, assignment.id, status);
    setBusyId(null);
    if (outcome.status === "success") {
      onChanged(outcome.talent);
      setAnnouncement(
        `${assignment.event.name} marked ${assignmentStatusLabel(status).toLowerCase()}.`,
      );
      return;
    }
    setRowError({ id: assignment.id, message: actionError(outcome.status) });
  }

  return (
    <section
      aria-labelledby={headingId}
      className="border-border space-y-3 border-t pt-4"
    >
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p id={headingId} className="text-sm font-medium">
          Event assignments
        </p>
        {!adding && canManage ? (
          <Button
            type="button"
            size="sm"
            variant="outline"
            onClick={() => setAdding(true)}
          >
            <Plus aria-hidden="true" data-icon="inline-start" />
            Assign to an event
          </Button>
        ) : null}
      </div>

      {adding ? (
        <form
          aria-label="Assign to an event"
          noValidate
          className="border-border bg-muted/30 space-y-3 rounded-lg border p-3"
          onSubmit={(event) => void submitAdd(event)}
        >
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1">
              <Label htmlFor={ids.event}>Event</Label>
              <Select
                value={values.eventId}
                disabled={addBusy}
                onValueChange={(value) =>
                  setValues((current) => ({ ...current, eventId: value }))
                }
              >
                <SelectTrigger
                  id={ids.event}
                  aria-invalid={eventError ? true : undefined}
                  aria-describedby={
                    eventError ? `${ids.event}-error` : undefined
                  }
                >
                  <SelectValue placeholder="Choose an event…" />
                </SelectTrigger>
                <SelectContent>
                  {events.map((event) => (
                    <SelectItem key={event.id} value={event.id}>
                      {event.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {eventError ? (
                <p
                  id={`${ids.event}-error`}
                  className="text-destructive text-sm"
                >
                  {eventError}
                </p>
              ) : null}
            </div>
            <div className="space-y-1">
              <Label htmlFor={ids.role}>Role</Label>
              <Input
                id={ids.role}
                ref={roleRef}
                value={values.role}
                disabled={addBusy}
                placeholder="Headliner"
                aria-invalid={roleError ? true : undefined}
                aria-describedby={roleError ? `${ids.role}-error` : undefined}
                onChange={(event) =>
                  setValues((current) => ({
                    ...current,
                    role: event.target.value,
                  }))
                }
              />
              {roleError ? (
                <p
                  id={`${ids.role}-error`}
                  className="text-destructive text-sm"
                >
                  {roleError}
                </p>
              ) : null}
            </div>
          </div>
          {formError ? (
            <p className="text-destructive text-sm" role="alert">
              {formError}
            </p>
          ) : null}
          <div className="flex flex-wrap gap-2">
            <Button
              type="submit"
              size="sm"
              disabled={addBusy}
              aria-busy={addBusy}
            >
              {addBusy ? "Assigning…" : "Assign"}
            </Button>
            <Button
              type="button"
              size="sm"
              variant="ghost"
              disabled={addBusy}
              onClick={() => {
                setAdding(false);
                setValues(EMPTY_VALUES);
                setEventError(null);
                setRoleError(null);
                setFormError(null);
              }}
            >
              Cancel
            </Button>
          </div>
        </form>
      ) : null}

      {assignments.length === 0 && !adding ? (
        <p className="text-muted-foreground text-sm">
          {canManage
            ? "No event assignments yet. Assign this talent to an event."
            : "No event assignments yet."}
        </p>
      ) : null}

      <ul className="space-y-2">
        {assignments.map((assignment) => {
          const moves = NEXT_ASSIGNMENT_STATUSES[assignment.status];
          return (
            <li
              key={assignment.id}
              className="border-border space-y-2 rounded-lg border p-3"
            >
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="text-sm font-medium">
                    {assignment.event.name}
                  </span>
                  <AssignmentStatusBadge status={assignment.status} />
                </div>
                <span className="text-muted-foreground text-xs">
                  {assignment.role}
                </span>
              </div>

              {canManage && moves.length > 0 ? (
                <div className="w-full space-y-1 sm:w-64">
                  <AssignmentStatusSelect
                    assignment={assignment}
                    moves={moves}
                    disabled={busyId === assignment.id}
                    onChange={(status) => void changeStatus(assignment, status)}
                  />
                </div>
              ) : null}
              {rowError?.id === assignment.id ? (
                <p className="text-destructive text-sm" role="alert">
                  {rowError.message}
                </p>
              ) : null}
            </li>
          );
        })}
      </ul>

      <p role="status" aria-live="polite" className="sr-only">
        {announcement}
      </p>
    </section>
  );
}

interface AssignmentStatusSelectProps {
  assignment: TalentEventAssignment;
  moves: readonly TalentAssignmentStatus[];
  disabled: boolean;
  onChange: (status: TalentAssignmentStatus) => void;
}

function AssignmentStatusSelect({
  assignment,
  moves,
  disabled,
  onChange,
}: AssignmentStatusSelectProps) {
  const id = useId();
  return (
    <>
      <Label htmlFor={id} className="text-xs">
        Move {assignment.event.name} assignment to
      </Label>
      <Select
        value={PICK_STATUS}
        disabled={disabled}
        onValueChange={(value) => onChange(value as TalentAssignmentStatus)}
      >
        <SelectTrigger id={id} aria-busy={disabled}>
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value={PICK_STATUS}>Choose a status…</SelectItem>
          {moves.map((status) => (
            <SelectItem key={status} value={status}>
              {assignmentStatusLabel(status)}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </>
  );
}
