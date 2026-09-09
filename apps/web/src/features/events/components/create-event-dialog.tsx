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
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

import { EventFields } from "./event-fields";
import type { CreateEvent, CreateEventValues } from "../lib/events-outcome";
import {
  personName,
  type AssignableUser,
  type Event,
} from "../lib/events-types";

const NO_MANAGER = "NONE";

const FORM_ERRORS: Record<string, string> = {
  manager_not_found: "That user no longer exists. Pick another.",
  permission_denied: "You do not have permission to create an event.",
  unexpected: "We could not create the event. Try again.",
};

const EMPTY: CreateEventValues = {
  name: "",
  eventType: "CONCERT",
  description: "",
  startAt: "",
  endAt: "",
  location: "",
  organizerName: "",
  managerId: null,
};

interface CreateEventDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  managers: readonly AssignableUser[];
  onCreate: CreateEvent;
  onCreated: (event: Event) => void;
}

export function CreateEventDialog({
  open,
  onOpenChange,
  managers,
  onCreate,
  onCreated,
}: CreateEventDialogProps) {
  const managerId = useId();

  const [values, setValues] = useState<CreateEventValues>(EMPTY);
  const [fieldErrors, setFieldErrors] = useState<
    Partial<Record<keyof CreateEventValues, string>>
  >({});
  const [formError, setFormError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  function set<K extends keyof CreateEventValues>(
    key: K,
    value: CreateEventValues[K],
  ) {
    setValues((current) => ({ ...current, [key]: value }));
  }

  function reset() {
    setValues(EMPTY);
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

    const localErrors: Partial<Record<keyof CreateEventValues, string>> = {};
    if (values.name.trim() === "") {
      localErrors.name = "Enter a name.";
    }
    if (
      values.startAt !== "" &&
      values.endAt !== "" &&
      values.endAt < values.startAt
    ) {
      localErrors.endAt = "The end must be on or after the start.";
    }
    if (Object.keys(localErrors).length > 0) {
      setFieldErrors(localErrors);
      return;
    }

    setSubmitting(true);
    setFieldErrors({});
    const outcome = await onCreate(values);
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
        setFieldErrors({ endAt: "The end must be on or after the start." });
        return;
      default:
        setFormError(FORM_ERRORS[outcome.status] ?? FORM_ERRORS.unexpected!);
    }
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!next) reset();
        onOpenChange(next);
      }}
    >
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>New event</DialogTitle>
          <DialogDescription>
            Give the event a name and type. Schedule, location, organizer, and a
            manager are optional and can be set later.
          </DialogDescription>
        </DialogHeader>

        <form
          aria-label="Create event"
          className="space-y-4"
          noValidate
          onSubmit={(event) => void handleSubmit(event)}
        >
          {formError ? (
            <Alert variant="destructive" aria-live="assertive">
              <AlertTitle>{formError}</AlertTitle>
            </Alert>
          ) : null}

          <EventFields
            values={values}
            errors={fieldErrors}
            disabled={submitting}
            onChange={(key, value) =>
              setValues((current) => ({ ...current, [key]: value }))
            }
          />

          <div className="space-y-2">
            <Label htmlFor={managerId}>Manager (optional)</Label>
            <Select
              value={values.managerId ?? NO_MANAGER}
              disabled={submitting}
              onValueChange={(value) =>
                set("managerId", value === NO_MANAGER ? null : value)
              }
            >
              <SelectTrigger id={managerId}>
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

          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={close}
              disabled={submitting}
            >
              Cancel
            </Button>
            <Button type="submit" disabled={submitting} aria-busy={submitting}>
              {submitting ? "Creating…" : "Create event"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
