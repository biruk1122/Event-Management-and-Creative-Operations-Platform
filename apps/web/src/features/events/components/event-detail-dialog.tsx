"use client";

import { useEffect, useId, useRef, useState } from "react";
import { LoaderCircle, TriangleAlert, X } from "lucide-react";

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

import {
  getEvent as defaultGetEvent,
  getEventBudget as defaultGetEventBudget,
} from "../api/events-gateway";
import { EventFields, type EventFieldValues } from "./event-fields";
import type {
  AssignEventManager,
  AssignEventTeam,
  DeleteEvent,
  GetEvent,
  GetEventBudget,
  RemoveEventTeam,
  SetEventBudget,
  TransitionEvent,
  UpdateEvent,
} from "../lib/events-outcome";
import {
  budgetSummary,
  eventStatusLabel,
  eventTypeLabel,
  NEXT_STATUSES,
  personName,
  scheduleSummary,
  type AssignableTeam,
  type AssignableUser,
  type Event,
  type EventBudget,
} from "../lib/events-types";

const NO_MANAGER = "NONE";
const PICK_TEAM = "PICK_TEAM";
const PICK_STATUS = "PICK_STATUS";

const ACTION_ERRORS: Record<string, string> = {
  manager_not_found: "That user no longer exists.",
  team_not_found: "That team no longer exists.",
  not_assigned: "That team is not assigned to this event.",
  invalid_transition: "That move is not allowed from the current status.",
  schedule_invalid: "The end must be on or after the start.",
  budget_incomplete: "Enter an amount and a currency, or clear both.",
  not_found: "This event no longer exists. Close this and refresh the list.",
  permission_denied: "You do not have permission to do that.",
  unexpected: "We could not save that change. Try again.",
};

function actionError(key: string): string {
  return ACTION_ERRORS[key] ?? ACTION_ERRORS.unexpected!;
}

/** An ISO instant as the value a `datetime-local` input expects (no seconds, no zone). */
function toLocalInput(iso: string | null): string {
  return iso ? iso.slice(0, 16) : "";
}

interface EventDetailDialogProps {
  eventId: string | null;
  onOpenChange: (open: boolean) => void;
  users: readonly AssignableUser[];
  teams: readonly AssignableTeam[];
  canUpdate: boolean;
  canTransition: boolean;
  canAssignManager: boolean;
  canAssignTeams: boolean;
  canReadBudget: boolean;
  canUpdateBudget: boolean;
  canDelete: boolean;
  getEvent?: GetEvent;
  getBudget?: GetEventBudget;
  onUpdate: UpdateEvent;
  onTransition: TransitionEvent;
  onAssignManager: AssignEventManager;
  onAssignTeam: AssignEventTeam;
  onRemoveTeam: RemoveEventTeam;
  onSetBudget: SetEventBudget;
  onDelete: DeleteEvent;
  onChanged: (event: Event) => void;
  onDeleted: (id: string) => void;
}

export function EventDetailDialog({
  eventId,
  onOpenChange,
  ...bodyProps
}: EventDetailDialogProps) {
  return (
    <Dialog
      open={eventId !== null}
      onOpenChange={(open) => {
        if (!open) onOpenChange(false);
      }}
    >
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-2xl">
        {eventId !== null ? (
          <EventDetailBody key={eventId} eventId={eventId} {...bodyProps} />
        ) : null}
      </DialogContent>
    </Dialog>
  );
}

type BodyProps = Omit<EventDetailDialogProps, "eventId" | "onOpenChange"> & {
  eventId: string;
};

function EventDetailBody({
  eventId,
  users,
  teams,
  canUpdate,
  canTransition,
  canAssignManager,
  canAssignTeams,
  canReadBudget,
  canUpdateBudget,
  canDelete,
  getEvent = defaultGetEvent,
  getBudget = defaultGetEventBudget,
  onUpdate,
  onTransition,
  onAssignManager,
  onAssignTeam,
  onRemoveTeam,
  onSetBudget,
  onDelete,
  onChanged,
  onDeleted,
}: BodyProps) {
  const ids = {
    manager: useId(),
    team: useId(),
    status: useId(),
    amount: useId(),
    currency: useId(),
  };

  const [status, setStatus] = useState<"loading" | "loaded" | "error">(
    "loading",
  );
  const [event, setEvent] = useState<Event | null>(null);
  const [budget, setBudget] = useState<EventBudget | null>(null);
  const [budgetReadable, setBudgetReadable] = useState(canReadBudget);

  const [fields, setFields] = useState<EventFieldValues | null>(null);
  const [fieldErrors, setFieldErrors] = useState<
    Partial<Record<keyof EventFieldValues, string>>
  >({});
  const [detailsError, setDetailsError] = useState<string | null>(null);
  const [detailsBusy, setDetailsBusy] = useState(false);

  const [statusError, setStatusError] = useState<string | null>(null);
  const [statusBusy, setStatusBusy] = useState(false);
  const [managerError, setManagerError] = useState<string | null>(null);
  const [managerBusy, setManagerBusy] = useState(false);
  const [teamError, setTeamError] = useState<string | null>(null);
  const [teamBusy, setTeamBusy] = useState(false);

  const [amount, setAmount] = useState("");
  const [currency, setCurrency] = useState("");
  const [budgetError, setBudgetError] = useState<string | null>(null);
  const [budgetBusy, setBudgetBusy] = useState(false);

  const [deleteError, setDeleteError] = useState<string | null>(null);
  const [deleteBusy, setDeleteBusy] = useState(false);
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const [announcement, setAnnouncement] = useState("");

  const confirmRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    let cancelled = false;
    const budgetPromise = canReadBudget
      ? getBudget(eventId)
      : Promise.resolve(null);
    void Promise.all([getEvent(eventId), budgetPromise])
      .then(([loaded, loadedBudget]) => {
        if (cancelled) return;
        if (!loaded) {
          setStatus("error");
          return;
        }
        setEvent(loaded);
        setFields(fieldsFromEvent(loaded));
        setBudget(loadedBudget);
        setBudgetReadable(canReadBudget && loadedBudget !== null);
        setAmount(loadedBudget?.amount ?? "");
        setCurrency(loadedBudget?.currency ?? "");
        setStatus("loaded");
      })
      .catch(() => {
        if (!cancelled) setStatus("error");
      });
    return () => {
      cancelled = true;
    };
  }, [eventId, getEvent, getBudget, canReadBudget]);

  useEffect(() => {
    if (confirmingDelete) confirmRef.current?.focus();
  }, [confirmingDelete]);

  function apply(next: Event) {
    setEvent(next);
    setFields(fieldsFromEvent(next));
    onChanged(next);
  }

  function setField<K extends keyof EventFieldValues>(
    key: K,
    value: EventFieldValues[K],
  ) {
    setFields((current) => (current ? { ...current, [key]: value } : current));
  }

  async function saveDetails() {
    if (!event || !fields || !canUpdate) return;
    const localErrors: Partial<Record<keyof EventFieldValues, string>> = {};
    if (fields.name.trim() === "") localErrors.name = "Enter a name.";
    if (
      fields.startAt !== "" &&
      fields.endAt !== "" &&
      fields.endAt < fields.startAt
    ) {
      localErrors.endAt = "The end must be on or after the start.";
    }
    if (Object.keys(localErrors).length > 0) {
      setFieldErrors(localErrors);
      return;
    }

    setDetailsBusy(true);
    setDetailsError(null);
    setFieldErrors({});
    const outcome = await onUpdate(event.id, {
      name: fields.name,
      eventType: fields.eventType,
      description: fields.description,
      startAt: fields.startAt,
      endAt: fields.endAt,
      location: fields.location,
      organizerName: fields.organizerName,
    });
    setDetailsBusy(false);

    if (outcome.status === "success") {
      apply(outcome.event);
      setAnnouncement("Event details saved.");
      return;
    }
    if (outcome.status === "field_errors") {
      setFieldErrors(outcome.fieldErrors);
      return;
    }
    setDetailsError(actionError(outcome.status));
  }

  async function moveTo(next: string) {
    if (!event || next === PICK_STATUS) return;
    setStatusBusy(true);
    setStatusError(null);
    const outcome = await onTransition(event.id, next as Event["status"]);
    setStatusBusy(false);
    if (outcome.status === "success") {
      apply(outcome.event);
      setAnnouncement(
        `Status changed to ${eventStatusLabel(outcome.event.status)}.`,
      );
      return;
    }
    setStatusError(actionError(outcome.status));
  }

  async function changeManager(value: string) {
    if (!event) return;
    const managerId = value === NO_MANAGER ? null : value;
    setManagerBusy(true);
    setManagerError(null);
    const outcome = await onAssignManager(event.id, managerId);
    setManagerBusy(false);
    if (outcome.status === "success") {
      apply(outcome.event);
      setAnnouncement(managerId ? "Manager assigned." : "Manager removed.");
      return;
    }
    setManagerError(actionError(outcome.status));
  }

  async function addTeam(value: string) {
    if (!event || value === PICK_TEAM) return;
    setTeamBusy(true);
    setTeamError(null);
    const outcome = await onAssignTeam(event.id, value);
    setTeamBusy(false);
    if (outcome.status === "success") {
      apply(outcome.event);
      setAnnouncement("Team assigned.");
      return;
    }
    setTeamError(actionError(outcome.status));
  }

  async function removeTeam(teamId: string) {
    if (!event) return;
    setTeamBusy(true);
    setTeamError(null);
    const outcome = await onRemoveTeam(event.id, teamId);
    setTeamBusy(false);
    if (outcome.status === "success") {
      apply(outcome.event);
      setAnnouncement("Team unassigned.");
      return;
    }
    setTeamError(actionError(outcome.status));
  }

  async function saveBudget(clear: boolean) {
    if (!event) return;
    const nextAmount = clear ? null : amount.trim();
    const nextCurrency = clear ? null : currency.trim().toUpperCase();

    if (!clear) {
      const errors: { amount?: string; currency?: string } = {};
      const parsed = Number(nextAmount);
      if (nextAmount === "" || Number.isNaN(parsed) || parsed < 0) {
        errors.amount = "Enter a non-negative amount.";
      }
      if (!/^[A-Z]{3}$/.test(nextCurrency ?? "")) {
        errors.currency = "Use a 3-letter code, e.g. USD.";
      }
      if (errors.amount || errors.currency) {
        setBudgetError(
          [errors.amount, errors.currency].filter(Boolean).join(" "),
        );
        return;
      }
    }

    setBudgetBusy(true);
    setBudgetError(null);
    const outcome = await onSetBudget(
      event.id,
      clear ? null : Number(nextAmount),
      clear ? null : (nextCurrency ?? null),
    );
    setBudgetBusy(false);

    if (outcome.status === "success") {
      setBudget(outcome.budget);
      setAmount(outcome.budget.amount ?? "");
      setCurrency(outcome.budget.currency ?? "");
      setAnnouncement(clear ? "Budget cleared." : "Budget saved.");
      return;
    }
    if (outcome.status === "field_errors") {
      setBudgetError(
        [outcome.fieldErrors.amount, outcome.fieldErrors.currency]
          .filter(Boolean)
          .join(" "),
      );
      return;
    }
    setBudgetError(actionError(outcome.status));
  }

  async function runDelete() {
    if (!event) return;
    setDeleteBusy(true);
    setDeleteError(null);
    const outcome = await onDelete(event.id);
    setDeleteBusy(false);
    if (outcome.status === "success") {
      onDeleted(event.id);
      return;
    }
    setConfirmingDelete(false);
    setDeleteError(actionError(outcome.status));
  }

  if (status === "loading") {
    return (
      <div
        role="status"
        aria-live="polite"
        className="flex items-center justify-center gap-2 py-10 text-sm"
      >
        <LoaderCircle aria-hidden="true" className="size-4 animate-spin" />
        Loading event…
      </div>
    );
  }

  if (status === "error" || !event || !fields) {
    return (
      <Alert variant="destructive">
        <TriangleAlert aria-hidden="true" />
        <AlertTitle>We could not load this event</AlertTitle>
        <AlertDescription>Try again in a moment.</AlertDescription>
      </Alert>
    );
  }

  const assignedTeamIds = new Set(event.teams.map((team) => team.id));
  const addableTeams = teams.filter((team) => !assignedTeamIds.has(team.id));
  const moves = NEXT_STATUSES[event.status];

  return (
    <>
      <DialogHeader>
        <div className="flex flex-wrap items-center gap-2">
          <DialogTitle>{event.name}</DialogTitle>
          <Badge variant="secondary">{eventTypeLabel(event.eventType)}</Badge>
          <Badge>{eventStatusLabel(event.status)}</Badge>
        </div>
        <DialogDescription>{scheduleSummary(event)}</DialogDescription>
      </DialogHeader>

      {/* Details */}
      <form
        aria-label="Edit event details"
        className="space-y-4"
        noValidate
        onSubmit={(submitEvent) => {
          submitEvent.preventDefault();
          void saveDetails();
        }}
      >
        <EventFields
          values={fields}
          errors={fieldErrors}
          disabled={detailsBusy || !canUpdate}
          onChange={setField}
        />
        {detailsError ? (
          <p className="text-destructive text-sm" role="alert">
            {detailsError}
          </p>
        ) : null}
        {canUpdate ? (
          <Button
            type="submit"
            size="sm"
            disabled={detailsBusy}
            aria-busy={detailsBusy}
          >
            {detailsBusy ? "Saving…" : "Save details"}
          </Button>
        ) : (
          <p className="text-muted-foreground text-xs">
            You have read-only access to this event&rsquo;s details.
          </p>
        )}
      </form>

      {/* Lifecycle */}
      <section
        aria-labelledby={`${ids.status}-heading`}
        className="border-border space-y-2 border-t pt-4"
      >
        <p id={`${ids.status}-heading`} className="text-sm font-medium">
          Lifecycle
        </p>
        {!canTransition ? (
          <p className="text-muted-foreground text-sm">
            Current status: {eventStatusLabel(event.status)}.
          </p>
        ) : moves.length === 0 ? (
          <p className="text-muted-foreground text-sm">
            {eventStatusLabel(event.status)} is a final state.
          </p>
        ) : (
          <div className="space-y-1">
            <Label htmlFor={ids.status}>Move to</Label>
            <Select
              value={PICK_STATUS}
              disabled={statusBusy}
              onValueChange={(value) => void moveTo(value)}
            >
              <SelectTrigger id={ids.status} aria-busy={statusBusy}>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={PICK_STATUS}>Choose a status…</SelectItem>
                {moves.map((next) => (
                  <SelectItem key={next} value={next}>
                    {eventStatusLabel(next)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        )}
        {statusError ? (
          <p className="text-destructive text-sm" role="alert">
            {statusError}
          </p>
        ) : null}
      </section>

      {/* Connected workspace: manager, teams, participants */}
      <section
        aria-labelledby={`${ids.manager}-heading`}
        className="border-border space-y-3 border-t pt-4"
      >
        <p id={`${ids.manager}-heading`} className="text-sm font-medium">
          Connected workspace
        </p>

        <div className="space-y-1">
          <Label htmlFor={ids.manager}>Manager</Label>
          <Select
            value={event.manager?.id ?? NO_MANAGER}
            disabled={managerBusy || !canAssignManager}
            onValueChange={(value) => void changeManager(value)}
          >
            <SelectTrigger id={ids.manager} aria-busy={managerBusy}>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={NO_MANAGER}>No manager</SelectItem>
              {users.map((user) => (
                <SelectItem key={user.id} value={user.id}>
                  {personName(user)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          {managerError ? (
            <p className="text-destructive text-sm" role="alert">
              {managerError}
            </p>
          ) : null}
        </div>

        <div className="space-y-1">
          <p className="text-sm font-medium">Teams</p>
          {event.teams.length === 0 ? (
            <p className="text-muted-foreground text-sm">No teams assigned.</p>
          ) : (
            <ul className="space-y-1">
              {event.teams.map((team) => (
                <li
                  key={team.id}
                  className="flex items-center justify-between gap-2 text-sm"
                >
                  <span>{team.name}</span>
                  {canAssignTeams ? (
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      disabled={teamBusy}
                      aria-label={`Unassign ${team.name}`}
                      onClick={() => void removeTeam(team.id)}
                    >
                      <X aria-hidden="true" className="size-4" />
                    </Button>
                  ) : null}
                </li>
              ))}
            </ul>
          )}
          {canAssignTeams && addableTeams.length > 0 ? (
            <div className="space-y-1">
              <Label htmlFor={ids.team}>Assign a team</Label>
              <Select
                value={PICK_TEAM}
                disabled={teamBusy}
                onValueChange={(value) => void addTeam(value)}
              >
                <SelectTrigger id={ids.team} aria-busy={teamBusy}>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={PICK_TEAM}>Choose a team…</SelectItem>
                  {addableTeams.map((team) => (
                    <SelectItem key={team.id} value={team.id}>
                      {team.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          ) : null}
          {teamError ? (
            <p className="text-destructive text-sm" role="alert">
              {teamError}
            </p>
          ) : null}
        </div>

        <div className="space-y-1">
          <p className="text-sm font-medium">Employees</p>
          {event.participants.length === 0 ? (
            <p className="text-muted-foreground text-sm">
              No employees assigned.
            </p>
          ) : (
            <ul className="text-muted-foreground space-y-1 text-sm">
              {event.participants.map((person) => (
                <li key={person.id}>{personName(person)}</li>
              ))}
            </ul>
          )}
          <p className="text-muted-foreground text-xs">
            Employee assignment is managed from the connected workspace.
          </p>
        </div>
      </section>

      {/* Budget */}
      <section
        aria-labelledby={`${ids.amount}-heading`}
        className="border-border space-y-2 border-t pt-4"
      >
        <p id={`${ids.amount}-heading`} className="text-sm font-medium">
          Budget
        </p>
        {!budgetReadable ? (
          <p className="text-muted-foreground text-sm">
            You do not have permission to view the budget.
          </p>
        ) : (
          <>
            <p className="text-muted-foreground text-sm">
              Current: {budgetSummary(budget)}
            </p>
            {canUpdateBudget ? (
              <>
                <div className="grid gap-3 sm:grid-cols-[1fr_8rem_auto]">
                  <div className="space-y-1">
                    <Label htmlFor={ids.amount}>Amount</Label>
                    <Input
                      id={ids.amount}
                      inputMode="decimal"
                      value={amount}
                      disabled={budgetBusy}
                      onChange={(changeEvent) =>
                        setAmount(changeEvent.target.value)
                      }
                    />
                  </div>
                  <div className="space-y-1">
                    <Label htmlFor={ids.currency}>Currency</Label>
                    <Input
                      id={ids.currency}
                      value={currency}
                      maxLength={3}
                      placeholder="USD"
                      disabled={budgetBusy}
                      onChange={(changeEvent) =>
                        setCurrency(changeEvent.target.value)
                      }
                    />
                  </div>
                  <div className="flex items-end gap-2">
                    <Button
                      type="button"
                      size="sm"
                      disabled={budgetBusy}
                      onClick={() => void saveBudget(false)}
                    >
                      Save
                    </Button>
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      disabled={budgetBusy}
                      onClick={() => void saveBudget(true)}
                    >
                      Clear
                    </Button>
                  </div>
                </div>
                {budgetError ? (
                  <p className="text-destructive text-sm" role="alert">
                    {budgetError}
                  </p>
                ) : null}
              </>
            ) : null}
          </>
        )}
      </section>

      {/* Danger zone */}
      {canDelete ? (
        <div className="border-border space-y-2 border-t pt-4">
          {confirmingDelete ? (
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-sm">Permanently delete this event?</span>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                disabled={deleteBusy}
                onClick={() => setConfirmingDelete(false)}
              >
                Cancel
              </Button>
              <Button
                ref={confirmRef}
                type="button"
                variant="destructive"
                size="sm"
                disabled={deleteBusy}
                aria-busy={deleteBusy}
                onClick={() => void runDelete()}
              >
                {deleteBusy ? "Working…" : "Confirm delete"}
              </Button>
            </div>
          ) : (
            <Button
              type="button"
              variant="destructive"
              size="sm"
              onClick={() => setConfirmingDelete(true)}
            >
              Delete event
            </Button>
          )}
          {deleteError ? (
            <Alert variant="destructive" aria-live="assertive">
              <AlertTitle>{deleteError}</AlertTitle>
            </Alert>
          ) : null}
        </div>
      ) : null}

      <p role="status" aria-live="polite" className="sr-only">
        {announcement}
      </p>
    </>
  );
}

function fieldsFromEvent(event: Event): EventFieldValues {
  return {
    name: event.name,
    eventType: event.eventType,
    description: event.description ?? "",
    startAt: toLocalInput(event.startAt),
    endAt: toLocalInput(event.endAt),
    location: event.location ?? "",
    organizerName: event.organizerName ?? "",
  };
}
