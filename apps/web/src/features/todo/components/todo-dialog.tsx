"use client";

import { useId, useState, type FormEvent } from "react";

import { Alert, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
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

import type {
  CreateTodoOutcome,
  DeleteTodoOutcome,
  TodoFormValues,
  UpdateTodoOutcome,
} from "../lib/todo-outcome";
import {
  TODO_PRIORITIES,
  TODO_PRIORITY_LABELS,
  TODO_STATUSES,
  TODO_STATUS_LABELS,
  TODO_TYPES,
  TODO_TYPE_LABELS,
  type RelatedOption,
  type TodoItem,
  type TodoPriority,
  type TodoStatus,
  type TodoType,
} from "../lib/todo-types";

const NONE = "NONE";

export type { TodoFormValues } from "../lib/todo-outcome";

export type TodoFormOutcome = CreateTodoOutcome | UpdateTodoOutcome;

const FORM_ERRORS: Record<string, string> = {
  schedule_invalid: "A due time requires a due date.",
  related_event_not_found:
    "That related event no longer exists. Refresh and pick another, or leave it blank.",
  related_project_not_found:
    "That related project no longer exists. Refresh and pick another, or leave it blank.",
  not_found:
    "This to-do no longer exists. It may already have been changed or removed elsewhere.",
  permission_denied:
    "You don't have permission to do that. Refresh and try again.",
  unexpected: "We could not save this to-do. Try again.",
};

function emptyValues(): TodoFormValues {
  return {
    title: "",
    description: "",
    type: "PERSONAL",
    priority: "MEDIUM",
    status: "NOT_STARTED",
    dueDate: "",
    dueTime: "",
    relatedEventId: "",
    relatedProjectId: "",
    remindMe: false,
    reminderAt: "",
  };
}

function toLocalInputValue(iso: string): string {
  const date = new Date(iso);
  const pad = (value: number) => String(value).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

function valuesFromItem(item: TodoItem): TodoFormValues {
  return {
    title: item.title,
    description: item.description ?? "",
    type: item.type,
    priority: item.priority,
    status: item.status,
    dueDate: item.dueDate ?? "",
    dueTime: item.dueTime ? item.dueTime.slice(0, 5) : "",
    relatedEventId: item.relatedEventId ?? "",
    relatedProjectId: item.relatedProjectId ?? "",
    remindMe: item.reminderEnabled,
    reminderAt: item.reminderAt ? toLocalInputValue(item.reminderAt) : "",
  };
}

export interface TodoDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Present when editing an existing item; absent when creating. */
  item?: TodoItem | null;
  eventOptions: readonly RelatedOption[];
  projectOptions: readonly RelatedOption[];
  onSubmit: (values: TodoFormValues) => Promise<TodoFormOutcome>;
  onDelete?: (id: string) => Promise<DeleteTodoOutcome>;
}

/** The form's own state only initializes once per mount, not on every
 * `open` toggle - the caller must remount this (e.g. a `key` keyed to
 * whichever item it opens for) to reset it between openings, matching
 * `EntryDialog`'s own documented convention. */
export function TodoDialog({
  open,
  onOpenChange,
  item,
  eventOptions,
  projectOptions,
  onSubmit,
  onDelete,
}: TodoDialogProps) {
  const ids = {
    title: useId(),
    description: useId(),
    type: useId(),
    priority: useId(),
    status: useId(),
    dueDate: useId(),
    dueTime: useId(),
    relatedEventId: useId(),
    relatedProjectId: useId(),
    remindMe: useId(),
    reminderAt: useId(),
  };
  const [values, setValues] = useState<TodoFormValues>(() =>
    item ? valuesFromItem(item) : emptyValues(),
  );
  const [fieldErrors, setFieldErrors] = useState<
    Partial<Record<keyof TodoFormValues, string>>
  >({});
  const [formError, setFormError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [deleting, setDeleting] = useState(false);

  function set<K extends keyof TodoFormValues>(
    key: K,
    value: TodoFormValues[K],
  ) {
    setValues((current) => ({ ...current, [key]: value }));
  }

  function validate(): Partial<Record<keyof TodoFormValues, string>> {
    const errors: Partial<Record<keyof TodoFormValues, string>> = {};
    if (!values.title.trim()) errors.title = "Title is required.";
    if (values.dueTime && !values.dueDate) {
      errors.dueTime = "Due time requires a due date.";
    }
    if (values.remindMe && !values.reminderAt) {
      errors.reminderAt = "Set a reminder time, or turn the reminder off.";
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
        setFormError(FORM_ERRORS[outcome.status] ?? FORM_ERRORS.unexpected!);
    }
  }

  async function handleDelete() {
    if (!item || !onDelete) return;
    setDeleting(true);
    const outcome = await onDelete(item.id);
    setDeleting(false);
    if (outcome.status === "success") {
      onOpenChange(false);
      return;
    }
    setFormError(FORM_ERRORS[outcome.status] ?? FORM_ERRORS.unexpected!);
  }

  const busy = submitting || deleting;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{item ? "Edit to-do" : "New to-do"}</DialogTitle>
          <DialogDescription>
            Personal planning items are visible only to you, separate from
            official tasks.
          </DialogDescription>
        </DialogHeader>

        <form
          aria-label={item ? "Edit to-do" : "Create to-do"}
          className="max-h-[70vh] space-y-4 overflow-y-auto pr-1"
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

          <div className="grid gap-4 sm:grid-cols-3">
            <div className="space-y-2">
              <Label htmlFor={ids.type}>Type</Label>
              <Select
                value={values.type}
                onValueChange={(value) => set("type", value as TodoType)}
              >
                <SelectTrigger id={ids.type}>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {TODO_TYPES.map((type) => (
                    <SelectItem key={type} value={type}>
                      {TODO_TYPE_LABELS[type]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label htmlFor={ids.priority}>Priority</Label>
              <Select
                value={values.priority}
                onValueChange={(value) =>
                  set("priority", value as TodoPriority)
                }
              >
                <SelectTrigger id={ids.priority}>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {TODO_PRIORITIES.map((priority) => (
                    <SelectItem key={priority} value={priority}>
                      {TODO_PRIORITY_LABELS[priority]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label htmlFor={ids.status}>Status</Label>
              <Select
                value={values.status}
                onValueChange={(value) => set("status", value as TodoStatus)}
              >
                <SelectTrigger id={ids.status}>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {TODO_STATUSES.map((status) => (
                    <SelectItem key={status} value={status}>
                      {TODO_STATUS_LABELS[status]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor={ids.dueDate}>Due date (optional)</Label>
              <Input
                id={ids.dueDate}
                type="date"
                value={values.dueDate}
                onChange={(event) => {
                  const dueDate = event.target.value;
                  setValues((current) => ({
                    ...current,
                    dueDate,
                    // A due time with no due date is meaningless - clear it
                    // the moment its date is removed, rather than letting
                    // the form hold state the API would reject.
                    dueTime: dueDate ? current.dueTime : "",
                  }));
                }}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor={ids.dueTime}>Due time (optional)</Label>
              <Input
                id={ids.dueTime}
                type="time"
                disabled={!values.dueDate}
                value={values.dueTime}
                aria-invalid={fieldErrors.dueTime ? true : undefined}
                onChange={(event) => set("dueTime", event.target.value)}
              />
              {fieldErrors.dueTime ? (
                <p className="text-destructive text-sm">
                  {fieldErrors.dueTime}
                </p>
              ) : null}
            </div>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor={ids.relatedEventId}>
                Related event (optional)
              </Label>
              <Select
                value={values.relatedEventId || NONE}
                onValueChange={(value) =>
                  set("relatedEventId", value === NONE ? "" : value)
                }
              >
                <SelectTrigger id={ids.relatedEventId}>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={NONE}>None</SelectItem>
                  {eventOptions.map((option) => (
                    <SelectItem key={option.id} value={option.id}>
                      {option.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label htmlFor={ids.relatedProjectId}>
                Related project (optional)
              </Label>
              <Select
                value={values.relatedProjectId || NONE}
                onValueChange={(value) =>
                  set("relatedProjectId", value === NONE ? "" : value)
                }
              >
                <SelectTrigger id={ids.relatedProjectId}>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={NONE}>None</SelectItem>
                  {projectOptions.map((option) => (
                    <SelectItem key={option.id} value={option.id}>
                      {option.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="space-y-2">
            <label
              htmlFor={ids.remindMe}
              className="flex items-center gap-2 text-sm font-medium"
            >
              <Checkbox
                id={ids.remindMe}
                checked={values.remindMe}
                onCheckedChange={(checked) => set("remindMe", checked === true)}
              />
              Remind me
            </label>
            {values.remindMe ? (
              <>
                <Label htmlFor={ids.reminderAt} className="sr-only">
                  Reminder time
                </Label>
                <Input
                  id={ids.reminderAt}
                  type="datetime-local"
                  value={values.reminderAt}
                  aria-invalid={fieldErrors.reminderAt ? true : undefined}
                  onChange={(event) => set("reminderAt", event.target.value)}
                />
                {fieldErrors.reminderAt ? (
                  <p className="text-destructive text-sm">
                    {fieldErrors.reminderAt}
                  </p>
                ) : null}
              </>
            ) : null}
          </div>

          <DialogFooter className="gap-2 sm:justify-between">
            {item && onDelete ? (
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
                  : item
                    ? "Save changes"
                    : "Create to-do"}
              </Button>
            </div>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
