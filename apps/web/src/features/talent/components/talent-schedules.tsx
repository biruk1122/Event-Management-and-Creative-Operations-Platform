"use client";

import { useEffect, useId, useRef, useState, type FormEvent } from "react";
import { Plus } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

import type {
  AddSchedule,
  RemoveSchedule,
  TalentScheduleValues,
  UpdateSchedule,
} from "../lib/talent-outcome";
import {
  scheduleSummary,
  type Talent,
  type TalentSchedule,
} from "../lib/talent-types";

const ACTION_ERRORS: Record<string, string> = {
  schedule_invalid: "The end must be after the start.",
  not_found: "This schedule entry no longer exists. Refresh the list.",
  permission_denied: "You do not have permission to do that.",
  unexpected: "We could not save that change. Try again.",
};

function actionError(key: string): string {
  return ACTION_ERRORS[key] ?? ACTION_ERRORS.unexpected!;
}

/** An ISO instant as the value a `datetime-local` input expects (no seconds, no zone). */
function toLocalInput(iso: string): string {
  return iso.slice(0, 16);
}

function valuesFrom(schedule: TalentSchedule): TalentScheduleValues {
  return {
    title: schedule.title,
    startAt: toLocalInput(schedule.startAt),
    endAt: toLocalInput(schedule.endAt),
  };
}

const EMPTY_VALUES: TalentScheduleValues = {
  title: "",
  startAt: "",
  endAt: "",
};

interface TalentSchedulesProps {
  talentId: string;
  schedules: readonly TalentSchedule[];
  /** Whether the caller may add, edit, and remove schedule entries. */
  canManage: boolean;
  onAdd: AddSchedule;
  onUpdate: UpdateSchedule;
  onRemove: RemoveSchedule;
  onChanged: (talent: Talent) => void;
  /**
   * Called after a successful removal, since `DELETE .../schedules/:id`
   * returns no body (unlike add/update, which return the full talent) - the
   * caller has nothing to `onChanged` with, so it must update its own state.
   */
  onRemoved: (scheduleId: string) => void;
}

/**
 * A talent's schedule entries. Reads them straight off the already-loaded
 * talent (`GET /talents/{id}` returns them inline), unlike campaign activities
 * which live on a separate paginated endpoint.
 */
export function TalentSchedules({
  talentId,
  schedules,
  canManage,
  onAdd,
  onUpdate,
  onRemove,
  onChanged,
  onRemoved,
}: TalentSchedulesProps) {
  const headingId = useId();

  /** "new" while adding, a schedule id while editing, `null` when idle. */
  const [editing, setEditing] = useState<string | "new" | null>(null);
  const [confirmingId, setConfirmingId] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [rowError, setRowError] = useState<{
    id: string;
    message: string;
  } | null>(null);
  const [announcement, setAnnouncement] = useState("");
  const confirmRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (confirmingId) confirmRef.current?.focus();
  }, [confirmingId]);

  async function remove(schedule: TalentSchedule) {
    setBusyId(schedule.id);
    setRowError(null);
    const outcome = await onRemove(talentId, schedule.id);
    setBusyId(null);
    setConfirmingId(null);
    if (outcome.status === "success") {
      onRemoved(schedule.id);
      setAnnouncement(`${schedule.title} removed.`);
      return;
    }
    setRowError({ id: schedule.id, message: actionError(outcome.status) });
  }

  async function save(
    values: TalentScheduleValues,
    scheduleId: string | null,
  ): Promise<{ error: string | null; fieldErrors?: { title?: string } }> {
    const outcome =
      scheduleId === null
        ? await onAdd(talentId, values)
        : await onUpdate(talentId, scheduleId, values);
    if (outcome.status === "success") {
      onChanged(outcome.talent);
      setEditing(null);
      setAnnouncement(
        scheduleId === null ? "Schedule entry added." : "Schedule entry saved.",
      );
      return { error: null };
    }
    if (outcome.status === "field_errors") {
      return { error: null, fieldErrors: outcome.fieldErrors };
    }
    return { error: actionError(outcome.status) };
  }

  return (
    <section
      aria-labelledby={headingId}
      className="border-border space-y-3 border-t pt-4"
    >
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p id={headingId} className="text-sm font-medium">
          Schedule
        </p>
        {editing === null && canManage ? (
          <Button
            type="button"
            size="sm"
            variant="outline"
            onClick={() => setEditing("new")}
          >
            <Plus aria-hidden="true" data-icon="inline-start" />
            Add schedule entry
          </Button>
        ) : null}
      </div>

      {editing === "new" ? (
        <ScheduleForm
          key="new"
          title="New schedule entry"
          submitLabel="Add entry"
          initial={EMPTY_VALUES}
          onSave={(values) => save(values, null)}
          onCancel={() => setEditing(null)}
        />
      ) : null}

      {schedules.length === 0 && editing !== "new" ? (
        <p className="text-muted-foreground text-sm">
          {canManage
            ? "No schedule entries yet. Add the first one."
            : "No schedule entries yet."}
        </p>
      ) : null}

      <ul className="space-y-2">
        {schedules.map((schedule) =>
          editing === schedule.id ? (
            <li key={schedule.id}>
              <ScheduleForm
                title={`Edit ${schedule.title}`}
                submitLabel="Save entry"
                initial={valuesFrom(schedule)}
                onSave={(values) => save(values, schedule.id)}
                onCancel={() => setEditing(null)}
              />
            </li>
          ) : (
            <li
              key={schedule.id}
              className="border-border space-y-2 rounded-lg border p-3"
            >
              <div className="flex flex-wrap items-center justify-between gap-2">
                <span className="text-sm font-medium">{schedule.title}</span>
                <span className="text-muted-foreground text-xs">
                  {scheduleSummary(schedule)}
                </span>
              </div>

              {canManage ? (
                <div className="flex flex-wrap items-center gap-2">
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    disabled={busyId === schedule.id}
                    aria-label={`Edit ${schedule.title}`}
                    onClick={() => {
                      setConfirmingId(null);
                      setEditing(schedule.id);
                    }}
                  >
                    Edit
                  </Button>
                  {confirmingId === schedule.id ? (
                    <>
                      <span className="text-sm">Remove this entry?</span>
                      <Button
                        type="button"
                        size="sm"
                        variant="ghost"
                        disabled={busyId === schedule.id}
                        onClick={() => setConfirmingId(null)}
                      >
                        Cancel
                      </Button>
                      <Button
                        ref={confirmRef}
                        type="button"
                        size="sm"
                        variant="destructive"
                        disabled={busyId === schedule.id}
                        aria-busy={busyId === schedule.id}
                        onClick={() => void remove(schedule)}
                      >
                        {busyId === schedule.id
                          ? "Working…"
                          : `Confirm remove ${schedule.title}`}
                      </Button>
                    </>
                  ) : (
                    <Button
                      type="button"
                      size="sm"
                      variant="ghost"
                      disabled={busyId === schedule.id}
                      aria-label={`Remove ${schedule.title}`}
                      onClick={() => setConfirmingId(schedule.id)}
                    >
                      Remove
                    </Button>
                  )}
                </div>
              ) : null}
              {rowError?.id === schedule.id ? (
                <p className="text-destructive text-sm" role="alert">
                  {rowError.message}
                </p>
              ) : null}
            </li>
          ),
        )}
      </ul>

      <p role="status" aria-live="polite" className="sr-only">
        {announcement}
      </p>
    </section>
  );
}

interface ScheduleFormProps {
  title: string;
  submitLabel: string;
  initial: TalentScheduleValues;
  onSave: (
    values: TalentScheduleValues,
  ) => Promise<{ error: string | null; fieldErrors?: { title?: string } }>;
  onCancel: () => void;
}

function ScheduleForm({
  title,
  submitLabel,
  initial,
  onSave,
  onCancel,
}: ScheduleFormProps) {
  const ids = { title: useId(), startAt: useId(), endAt: useId() };
  const titleRef = useRef<HTMLInputElement>(null);

  const [values, setValues] = useState<TalentScheduleValues>(initial);
  const [titleError, setTitleError] = useState<string | null>(null);
  const [endError, setEndError] = useState<string | null>(null);
  const [formError, setFormError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    titleRef.current?.focus();
  }, []);

  function set<K extends keyof TalentScheduleValues>(
    key: K,
    value: TalentScheduleValues[K],
  ) {
    setValues((current) => ({ ...current, [key]: value }));
  }

  async function submit(event: FormEvent) {
    event.preventDefault();
    setFormError(null);
    setTitleError(null);
    setEndError(null);

    let invalid = false;
    if (values.title.trim() === "") {
      setTitleError("Enter a title.");
      invalid = true;
    }
    if (values.startAt === "" || values.endAt === "") {
      setEndError("Enter a start and an end.");
      invalid = true;
    } else if (values.endAt <= values.startAt) {
      setEndError("The end must be after the start.");
      invalid = true;
    }
    if (invalid) return;

    setBusy(true);
    const result = await onSave(values);
    setBusy(false);
    if (result.fieldErrors?.title) setTitleError(result.fieldErrors.title);
    if (result.error) {
      if (result.error === ACTION_ERRORS.schedule_invalid) {
        setEndError(result.error);
      } else {
        setFormError(result.error);
      }
    }
  }

  return (
    <form
      aria-label={title}
      noValidate
      className="border-border bg-muted/30 space-y-3 rounded-lg border p-3"
      onSubmit={(event) => void submit(event)}
    >
      <p className="text-sm font-medium">{title}</p>

      <div className="space-y-1">
        <Label htmlFor={ids.title}>Title</Label>
        <Input
          id={ids.title}
          ref={titleRef}
          value={values.title}
          disabled={busy}
          required
          aria-invalid={titleError ? true : undefined}
          aria-describedby={titleError ? `${ids.title}-error` : undefined}
          onChange={(event) => set("title", event.target.value)}
        />
        {titleError ? (
          <p id={`${ids.title}-error`} className="text-destructive text-sm">
            {titleError}
          </p>
        ) : null}
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        <div className="space-y-1">
          <Label htmlFor={ids.startAt}>Starts (UTC)</Label>
          <Input
            id={ids.startAt}
            type="datetime-local"
            value={values.startAt}
            disabled={busy}
            onChange={(event) => set("startAt", event.target.value)}
          />
        </div>
        <div className="space-y-1">
          <Label htmlFor={ids.endAt}>Ends (UTC)</Label>
          <Input
            id={ids.endAt}
            type="datetime-local"
            value={values.endAt}
            disabled={busy}
            aria-invalid={endError ? true : undefined}
            aria-describedby={endError ? `${ids.endAt}-error` : undefined}
            onChange={(event) => set("endAt", event.target.value)}
          />
          {endError ? (
            <p id={`${ids.endAt}-error`} className="text-destructive text-sm">
              {endError}
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
        <Button type="submit" size="sm" disabled={busy} aria-busy={busy}>
          {busy ? "Saving…" : submitLabel}
        </Button>
        <Button
          type="button"
          size="sm"
          variant="ghost"
          disabled={busy}
          onClick={onCancel}
        >
          Cancel
        </Button>
      </div>
    </form>
  );
}
