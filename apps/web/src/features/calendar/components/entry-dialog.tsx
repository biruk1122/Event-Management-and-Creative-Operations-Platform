"use client";

import { useId, useState, type FormEvent } from "react";

import { Alert, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

import {
  CALENDAR_ENTRY_TYPE_LABELS,
  MUTABLE_CALENDAR_ENTRY_TYPES,
  type CalendarEntry,
  type MutableCalendarEntryType,
} from "../lib/calendar-types";

export interface EntryFormValues {
  title: string;
  description: string;
  type: MutableCalendarEntryType;
  startAt: string;
  endAt: string;
}

export type EntryFormOutcome =
  | { status: "success"; entry: CalendarEntry }
  | {
      status: "field_errors";
      fieldErrors: Partial<Record<keyof EntryFormValues, string>>;
    }
  | { status: "unexpected" };

const FORM_ERRORS: Record<string, string> = {
  unexpected: "We could not save this entry. Try again.",
};

/** `datetime-local`'s value has no timezone of its own - it is always the
 * browser's local time, which is what this form should collect since the
 * entry it creates is the caller's own personal schedule. */
function toLocalInputValue(date: Date): string {
  const pad = (value: number) => String(value).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

function emptyValues(initialStart?: Date | null): EntryFormValues {
  return {
    title: "",
    description: "",
    type: "PERSONAL",
    startAt: initialStart ? toLocalInputValue(initialStart) : "",
    endAt: "",
  };
}

function valuesFromEntry(entry: CalendarEntry): EntryFormValues {
  return {
    title: entry.title,
    description: entry.description ?? "",
    type: entry.type as MutableCalendarEntryType,
    startAt: toLocalInputValue(new Date(entry.startAt)),
    endAt: entry.endAt ? toLocalInputValue(new Date(entry.endAt)) : "",
  };
}

export interface EntryDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Present when editing an existing mutable entry; absent when creating. */
  entry?: CalendarEntry | null;
  /** Pre-fills the start time when opened by clicking a date. */
  initialStart?: Date | null;
  onSubmit: (values: EntryFormValues) => Promise<EntryFormOutcome>;
  onDelete?: (id: string) => Promise<void>;
}

/** The form's own state only initializes once per mount, not on every
 * `open` toggle - the caller must remount this (e.g. a `key` keyed to
 * whichever entry/date it opens for) to reset it between openings, rather
 * than this component syncing itself via an effect. */
export function EntryDialog({
  open,
  onOpenChange,
  entry,
  initialStart,
  onSubmit,
  onDelete,
}: EntryDialogProps) {
  const ids = {
    title: useId(),
    description: useId(),
    type: useId(),
    startAt: useId(),
    endAt: useId(),
  };
  const [values, setValues] = useState<EntryFormValues>(() =>
    entry ? valuesFromEntry(entry) : emptyValues(initialStart),
  );
  const [fieldErrors, setFieldErrors] = useState<
    Partial<Record<keyof EntryFormValues, string>>
  >({});
  const [formError, setFormError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [deleting, setDeleting] = useState(false);

  function set<K extends keyof EntryFormValues>(
    key: K,
    value: EntryFormValues[K],
  ) {
    setValues((current) => ({ ...current, [key]: value }));
  }

  function validate(): Partial<Record<keyof EntryFormValues, string>> {
    const errors: Partial<Record<keyof EntryFormValues, string>> = {};
    if (!values.title.trim()) errors.title = "Title is required.";
    if (!values.startAt) errors.startAt = "Start is required.";
    if (
      values.startAt &&
      values.endAt &&
      new Date(values.endAt) < new Date(values.startAt)
    ) {
      errors.endAt = "End must be at or after the start.";
    }
    return errors;
  }

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    const errors = validate();
    if (Object.keys(errors).length > 0) {
      setFieldErrors(errors);
      return;
    }

    setSubmitting(true);
    setFieldErrors({});
    setFormError(null);
    const outcome = await onSubmit(values);
    setSubmitting(false);

    switch (outcome.status) {
      case "success":
        onOpenChange(false);
        return;
      case "field_errors":
        setFieldErrors(outcome.fieldErrors);
        return;
      default:
        setFormError(FORM_ERRORS.unexpected!);
    }
  }

  async function handleDelete() {
    if (!entry || !onDelete) return;
    setDeleting(true);
    await onDelete(entry.id);
    setDeleting(false);
    onOpenChange(false);
  }

  const busy = submitting || deleting;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{entry ? "Edit entry" : "New entry"}</DialogTitle>
          <DialogDescription>
            Personal entries and reminders are visible only to you.
          </DialogDescription>
        </DialogHeader>

        <form
          aria-label={entry ? "Edit entry" : "Create entry"}
          className="space-y-4"
          onSubmit={(event) => void handleSubmit(event)}
        >
          {formError ? (
            <Alert variant="destructive" aria-live="assertive">
              <AlertTitle>{formError}</AlertTitle>
            </Alert>
          ) : null}

          <div className="space-y-2">
            <Label htmlFor={ids.title}>Title</Label>
            <Input
              id={ids.title}
              autoFocus
              maxLength={500}
              value={values.title}
              aria-invalid={fieldErrors.title ? true : undefined}
              onChange={(event) => set("title", event.target.value)}
            />
            {fieldErrors.title ? (
              <p className="text-destructive text-sm">{fieldErrors.title}</p>
            ) : null}
          </div>

          <div className="space-y-2">
            <Label htmlFor={ids.description}>Description</Label>
            <Textarea
              id={ids.description}
              maxLength={10_000}
              value={values.description}
              onChange={(event) => set("description", event.target.value)}
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor={ids.type}>Type</Label>
            <Select
              value={values.type}
              onValueChange={(value) =>
                set("type", value as MutableCalendarEntryType)
              }
            >
              <SelectTrigger id={ids.type}>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {MUTABLE_CALENDAR_ENTRY_TYPES.map((type) => (
                  <SelectItem key={type} value={type}>
                    {CALENDAR_ENTRY_TYPE_LABELS[type]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor={ids.startAt}>Start</Label>
              <Input
                id={ids.startAt}
                type="datetime-local"
                value={values.startAt}
                aria-invalid={fieldErrors.startAt ? true : undefined}
                onChange={(event) => set("startAt", event.target.value)}
              />
              {fieldErrors.startAt ? (
                <p className="text-destructive text-sm">
                  {fieldErrors.startAt}
                </p>
              ) : null}
            </div>
            <div className="space-y-2">
              <Label htmlFor={ids.endAt}>End (optional)</Label>
              <Input
                id={ids.endAt}
                type="datetime-local"
                value={values.endAt}
                aria-invalid={fieldErrors.endAt ? true : undefined}
                onChange={(event) => set("endAt", event.target.value)}
              />
              {fieldErrors.endAt ? (
                <p className="text-destructive text-sm">{fieldErrors.endAt}</p>
              ) : null}
            </div>
          </div>

          <DialogFooter className="gap-2 sm:justify-between">
            {entry && onDelete ? (
              <Button
                type="button"
                variant="destructive"
                disabled={busy}
                aria-busy={deleting}
                onClick={() => void handleDelete()}
              >
                {deleting ? "Deleting…" : "Delete"}
              </Button>
            ) : (
              <span />
            )}
            <div className="flex gap-2">
              <Button
                type="button"
                variant="outline"
                disabled={busy}
                onClick={() => onOpenChange(false)}
              >
                Cancel
              </Button>
              <Button type="submit" disabled={busy} aria-busy={submitting}>
                {submitting
                  ? "Saving…"
                  : entry
                    ? "Save changes"
                    : "Create entry"}
              </Button>
            </div>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
