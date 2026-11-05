"use client";

import { useId, useState, type FormEvent } from "react";
import { CalendarDays } from "lucide-react";

import { Alert, AlertTitle } from "@/components/ui/alert";
import { AdministrationDialogContent as DialogContent } from "@/components/ui/administration-dialog-content";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogDescription,
  DialogFooter,
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
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";

import type {
  CreatableEventStatus,
  CreateEvent,
  CreateEventValues,
} from "../lib/events-outcome";
import {
  EVENT_TYPE_LABELS,
  EVENT_TYPES,
  personName,
  type AssignableTeam,
  type AssignableUser,
  type Event,
  type EventType,
} from "../lib/events-types";

const NO_MANAGER = "NONE";

const STATUS_OPTIONS: { value: CreatableEventStatus; label: string }[] = [
  { value: "PLANNING", label: "Planning" },
  { value: "READY", label: "Ready" },
];

const FORM_ERRORS: Record<string, string> = {
  manager_not_found: "That user no longer exists. Pick another.",
  team_not_found: "One of the selected teams no longer exists. Pick again.",
  permission_denied: "You do not have permission to create an event.",
  unexpected: "We could not create the event. Try again.",
};

const EMPTY: CreateEventValues = {
  name: "",
  eventType: "CONCERT",
  description: "",
  startAt: "",
  endAt: "",
  reminderAt: "",
  location: "",
  organizerName: "",
  managerId: null,
  status: "PLANNING",
  teamIds: [],
  budgetAmount: "",
};

/** The date and time inputs; combined into the `YYYY-MM-DDTHH:mm` values. */
interface ScheduleParts {
  startDate: string;
  startTime: string;
  endDate: string;
  endTime: string;
}

const EMPTY_SCHEDULE: ScheduleParts = {
  startDate: "",
  startTime: "",
  endDate: "",
  endTime: "",
};

/** A date with an optional time; a blank time means the start of that day. */
function combine(date: string, time: string): string {
  return date === "" ? "" : `${date}T${time === "" ? "00:00" : time}`;
}

interface CreateEventDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  managers: readonly AssignableUser[];
  teams: readonly AssignableTeam[];
  /** Teams are assigned at creation only with `event.assign_teams`. */
  canAssignTeams: boolean;
  /** The budget is sensitive: it is sent only with `event.budget.update`. */
  canUpdateBudget: boolean;
  onCreate: CreateEvent;
  onCreated: (event: Event) => void;
}

function SectionHeading({
  children,
  note,
}: {
  children: string;
  note?: string;
}) {
  return (
    <div className="flex items-center justify-between gap-3">
      <h3 className="mb-1 flex items-center gap-2.5 text-base font-semibold">
        <span className="bg-primary/10 text-primary flex size-8 items-center justify-center rounded-lg">
          <CalendarDays aria-hidden="true" className="size-4" />
        </span>
        {children}
      </h3>
      {note ? <p className="text-muted-foreground text-sm">{note}</p> : null}
    </div>
  );
}

export function CreateEventDialog({
  open,
  onOpenChange,
  managers,
  teams,
  canAssignTeams,
  canUpdateBudget,
  onCreate,
  onCreated,
}: CreateEventDialogProps) {
  const ids = {
    name: useId(),
    type: useId(),
    description: useId(),
    startDate: useId(),
    startTime: useId(),
    endDate: useId(),
    endTime: useId(),
    location: useId(),
    organizer: useId(),
    manager: useId(),
    status: useId(),
    budget: useId(),
    reminder: useId(),
    formId: useId(),
  };

  const [values, setValues] = useState<CreateEventValues>(EMPTY);
  const [schedule, setSchedule] = useState<ScheduleParts>(EMPTY_SCHEDULE);
  const [fieldErrors, setFieldErrors] = useState<
    Partial<Record<keyof CreateEventValues | "startDate" | "endDate", string>>
  >({});
  const [formError, setFormError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  function set<K extends keyof CreateEventValues>(
    key: K,
    value: CreateEventValues[K],
  ) {
    setValues((current) => ({ ...current, [key]: value }));
  }

  function setSchedulePart<K extends keyof ScheduleParts>(
    key: K,
    value: ScheduleParts[K],
  ) {
    setSchedule((current) => ({ ...current, [key]: value }));
  }

  function toggleTeam(teamId: string) {
    set(
      "teamIds",
      values.teamIds.includes(teamId)
        ? values.teamIds.filter((id) => id !== teamId)
        : [...values.teamIds, teamId],
    );
  }

  function reset() {
    setValues(EMPTY);
    setSchedule(EMPTY_SCHEDULE);
    setFieldErrors({});
    setFormError(null);
  }

  function close() {
    reset();
    onOpenChange(false);
  }

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    setFormError(null);

    const startAt = combine(schedule.startDate, schedule.startTime);
    const endAt = combine(schedule.endDate, schedule.endTime);

    const localErrors: Partial<
      Record<keyof CreateEventValues | "startDate" | "endDate", string>
    > = {};
    if (values.name.trim() === "") {
      localErrors.name = "Enter a name.";
    }
    if (schedule.startDate === "") {
      localErrors.startDate = "Choose a start date.";
    }
    if (schedule.endDate === "") {
      localErrors.endDate = "Choose an end date.";
    }
    if (startAt !== "" && endAt !== "" && endAt < startAt) {
      localErrors.endDate = "The end must be on or after the start.";
    }
    if (values.reminderAt !== "") {
      if (startAt === "") {
        localErrors.reminderAt = "Set a start date first.";
      } else if (values.reminderAt > startAt) {
        localErrors.reminderAt = "The reminder must be at or before the start.";
      }
    }
    const budget = values.budgetAmount.trim();
    if (
      canUpdateBudget &&
      budget !== "" &&
      (!/^\d+(\.\d{1,2})?$/.test(budget) || Number(budget) > 999_999_999_999.99)
    ) {
      localErrors.budgetAmount =
        "Enter an amount of zero or more, with at most two decimals.";
    }
    if (Object.keys(localErrors).length > 0) {
      setFieldErrors(localErrors);
      return;
    }

    const payload: CreateEventValues = {
      ...values,
      startAt,
      endAt,
      teamIds: canAssignTeams ? values.teamIds : [],
      budgetAmount: canUpdateBudget ? values.budgetAmount : "",
    };

    setSubmitting(true);
    setFieldErrors({});
    const outcome = await onCreate(payload);
    setSubmitting(false);

    switch (outcome.status) {
      case "success":
        onCreated(outcome.event);
        close();
        return;
      case "field_errors":
        setFieldErrors(outcome.fieldErrors);
        return;
      case "schedule_invalid":
        setFieldErrors({ endDate: "The end must be on or after the start." });
        return;
      case "reminder_invalid":
        setFieldErrors({
          reminderAt: "The reminder must be at or before the start.",
        });
        return;
      default:
        setFormError(FORM_ERRORS[outcome.status] ?? FORM_ERRORS.unexpected!);
    }
  }

  const inputClass = "h-10";

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!next) reset();
        onOpenChange(next);
      }}
    >
      <DialogContent className="flex h-[98vh] max-h-[98vh] w-[96vw] max-w-6xl flex-col gap-0 overflow-hidden p-0 sm:max-w-[94vw] lg:max-w-300 xl:max-w-340">
        <DialogHeader className="border-border from-accent to-card flex-row items-center justify-between gap-4 border-b bg-linear-to-br px-6 py-5 text-left sm:px-10">
          <div className="flex items-center gap-3">
            <span className="bg-primary/10 text-primary flex size-11 shrink-0 items-center justify-center rounded-xl">
              <CalendarDays aria-hidden="true" className="size-6" />
            </span>
            <div>
              <DialogTitle className="text-xl">Create an event</DialogTitle>
              <DialogDescription>
                Set the stage for your next great experience.
              </DialogDescription>
            </div>
          </div>
        </DialogHeader>

        <div className="flex-1 overflow-y-auto px-6 py-6 sm:px-10 sm:py-8">
          <form
            id={ids.formId}
            aria-label="Create event"
            className="space-y-8"
            noValidate
            onSubmit={(event) => void handleSubmit(event)}
          >
            {formError ? (
              <Alert variant="destructive" aria-live="assertive">
                <AlertTitle>{formError}</AlertTitle>
              </Alert>
            ) : null}

            <section className="border-border bg-muted/30 space-y-5 rounded-2xl border p-5 sm:p-6">
              <SectionHeading note="* Required">
                Event information
              </SectionHeading>

              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-2">
                  <Label htmlFor={ids.name}>Event name *</Label>
                  <Input
                    id={ids.name}
                    className={inputClass}
                    value={values.name}
                    disabled={submitting}
                    required
                    aria-invalid={fieldErrors.name ? true : undefined}
                    aria-describedby={
                      fieldErrors.name ? `${ids.name}-error` : undefined
                    }
                    onChange={(event) => set("name", event.target.value)}
                  />
                  {fieldErrors.name ? (
                    <p
                      id={`${ids.name}-error`}
                      className="text-destructive text-sm"
                    >
                      {fieldErrors.name}
                    </p>
                  ) : null}
                </div>

                <div className="space-y-2">
                  <Label htmlFor={ids.type}>Event type</Label>
                  <Select
                    value={values.eventType}
                    disabled={submitting}
                    onValueChange={(value) =>
                      set("eventType", value as EventType)
                    }
                  >
                    <SelectTrigger id={ids.type} className={inputClass}>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {EVENT_TYPES.map((type) => (
                        <SelectItem key={type} value={type}>
                          {EVENT_TYPE_LABELS[type]}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>

              <div className="space-y-2">
                <Label htmlFor={ids.description}>Description</Label>
                <Textarea
                  id={ids.description}
                  rows={3}
                  placeholder="A celebration of music, culture, and live performance."
                  value={values.description}
                  disabled={submitting}
                  onChange={(event) => set("description", event.target.value)}
                />
              </div>

              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-2">
                  <Label htmlFor={ids.startDate}>Start date *</Label>
                  <Input
                    id={ids.startDate}
                    type="date"
                    className={inputClass}
                    value={schedule.startDate}
                    disabled={submitting}
                    aria-invalid={fieldErrors.startDate ? true : undefined}
                    onChange={(event) =>
                      setSchedulePart("startDate", event.target.value)
                    }
                  />
                  {fieldErrors.startDate ? (
                    <p className="text-destructive text-sm">
                      {fieldErrors.startDate}
                    </p>
                  ) : null}
                </div>
                <div className="space-y-2">
                  <Label htmlFor={ids.endDate}>End date *</Label>
                  <Input
                    id={ids.endDate}
                    type="date"
                    className={inputClass}
                    value={schedule.endDate}
                    disabled={submitting}
                    aria-invalid={fieldErrors.endDate ? true : undefined}
                    onChange={(event) =>
                      setSchedulePart("endDate", event.target.value)
                    }
                  />
                  {fieldErrors.endDate ? (
                    <p className="text-destructive text-sm">
                      {fieldErrors.endDate}
                    </p>
                  ) : null}
                </div>
                <div className="space-y-2">
                  <Label htmlFor={ids.startTime}>Start time</Label>
                  <Input
                    id={ids.startTime}
                    type="time"
                    className={inputClass}
                    value={schedule.startTime}
                    disabled={submitting}
                    onChange={(event) =>
                      setSchedulePart("startTime", event.target.value)
                    }
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor={ids.endTime}>End time</Label>
                  <Input
                    id={ids.endTime}
                    type="time"
                    className={inputClass}
                    value={schedule.endTime}
                    disabled={submitting}
                    onChange={(event) =>
                      setSchedulePart("endTime", event.target.value)
                    }
                  />
                </div>
              </div>

              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-2">
                  <Label htmlFor={ids.location}>Location</Label>
                  <Input
                    id={ids.location}
                    className={inputClass}
                    value={values.location}
                    disabled={submitting}
                    onChange={(event) => set("location", event.target.value)}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor={ids.organizer}>Organizer</Label>
                  <Input
                    id={ids.organizer}
                    className={inputClass}
                    value={values.organizerName}
                    disabled={submitting}
                    onChange={(event) =>
                      set("organizerName", event.target.value)
                    }
                  />
                </div>
              </div>

              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-2">
                  <Label htmlFor={ids.manager}>Event manager</Label>
                  <Select
                    value={values.managerId ?? NO_MANAGER}
                    disabled={submitting}
                    onValueChange={(value) =>
                      set("managerId", value === NO_MANAGER ? null : value)
                    }
                  >
                    <SelectTrigger id={ids.manager} className={inputClass}>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value={NO_MANAGER}>No manager</SelectItem>
                      {managers.map((manager) => (
                        <SelectItem key={manager.id} value={manager.id}>
                          {personName(manager)}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <fieldset
                  className="space-y-2"
                  disabled={submitting || !canAssignTeams}
                >
                  <legend className="mb-2 text-sm leading-none font-medium">
                    Teams
                  </legend>
                  {canAssignTeams ? (
                    teams.length > 0 ? (
                      <div className="flex flex-wrap gap-2">
                        {teams.map((team) => {
                          const selected = values.teamIds.includes(team.id);
                          return (
                            <button
                              key={team.id}
                              type="button"
                              aria-pressed={selected}
                              onClick={() => toggleTeam(team.id)}
                              className={cn(
                                "focus-visible:ring-ring/50 rounded-full border px-3 py-1.5 text-sm transition-colors focus-visible:ring-3 focus-visible:outline-none",
                                selected
                                  ? "border-primary bg-primary text-primary-foreground"
                                  : "border-border bg-card hover:bg-accent",
                              )}
                            >
                              {team.name}
                            </button>
                          );
                        })}
                      </div>
                    ) : (
                      <p className="text-muted-foreground text-sm">
                        No teams yet.
                      </p>
                    )
                  ) : (
                    <p className="text-muted-foreground text-sm">
                      You can add teams after the event is created.
                    </p>
                  )}
                </fieldset>
              </div>

              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-2">
                  <Label htmlFor={ids.status}>Status</Label>
                  <Select
                    value={values.status}
                    disabled={submitting}
                    onValueChange={(value) =>
                      set("status", value as CreatableEventStatus)
                    }
                  >
                    <SelectTrigger id={ids.status} className={inputClass}>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {STATUS_OPTIONS.map((option) => (
                        <SelectItem key={option.value} value={option.value}>
                          {option.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                {canUpdateBudget ? (
                  <div className="space-y-2">
                    <Label htmlFor={ids.budget}>Budget (optional, ETB)</Label>
                    <Input
                      id={ids.budget}
                      inputMode="decimal"
                      className={inputClass}
                      placeholder="0.00"
                      value={values.budgetAmount}
                      disabled={submitting}
                      aria-invalid={fieldErrors.budgetAmount ? true : undefined}
                      onChange={(event) =>
                        set("budgetAmount", event.target.value)
                      }
                    />
                    {fieldErrors.budgetAmount ? (
                      <p className="text-destructive text-sm">
                        {fieldErrors.budgetAmount}
                      </p>
                    ) : null}
                  </div>
                ) : null}
              </div>

              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-2">
                  <Label htmlFor={ids.reminder}>Reminder (optional)</Label>
                  <Input
                    id={ids.reminder}
                    type="datetime-local"
                    className={inputClass}
                    value={values.reminderAt}
                    disabled={submitting}
                    aria-invalid={fieldErrors.reminderAt ? true : undefined}
                    onChange={(event) => set("reminderAt", event.target.value)}
                  />
                  {fieldErrors.reminderAt ? (
                    <p className="text-destructive text-sm">
                      {fieldErrors.reminderAt}
                    </p>
                  ) : null}
                </div>
              </div>
            </section>
          </form>
        </div>

        <DialogFooter className="border-border bg-card border-t px-6 py-4 sm:px-10">
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
            form={ids.formId}
            disabled={submitting}
            aria-busy={submitting}
          >
            {submitting ? "Creating…" : "Create event"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
