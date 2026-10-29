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

import type { ShiftFormValues, ShiftOutcome } from "../lib/attendance-outcome";
import type { EventShift } from "../lib/attendance-types";

const FORM_ERRORS: Record<string, string> = {
  event_not_found: "This event no longer exists.",
  permission_denied: "You do not have permission to schedule shifts.",
  unexpected: "We could not create the shift. Try again.",
};

const EMPTY: ShiftFormValues = {
  label: "",
  plannedStartAt: "",
  plannedEndAt: "",
  timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone,
  locationLabel: "",
  latitude: "",
  longitude: "",
  geofenceRadiusMeters: "150",
  breakMinutes: "0",
};

export interface CreateShiftDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onCreate: (values: ShiftFormValues) => Promise<ShiftOutcome>;
  onCreated: (shift: EventShift) => void;
}

export function CreateShiftDialog({
  open,
  onOpenChange,
  onCreate,
  onCreated,
}: CreateShiftDialogProps) {
  const startId = useId();
  const endId = useId();
  const labelId = useId();
  const locationId = useId();
  const latId = useId();
  const lngId = useId();
  const radiusId = useId();
  const breakId = useId();

  const [values, setValues] = useState<ShiftFormValues>(EMPTY);
  const [fieldErrors, setFieldErrors] = useState<
    Partial<Record<keyof ShiftFormValues, string>>
  >({});
  const [formError, setFormError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  function set<K extends keyof ShiftFormValues>(
    key: K,
    value: ShiftFormValues[K],
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

    const localErrors: Partial<Record<keyof ShiftFormValues, string>> = {};
    if (values.plannedStartAt === "")
      localErrors.plannedStartAt = "Set a start time.";
    if (values.plannedEndAt === "")
      localErrors.plannedEndAt = "Set an end time.";
    if (values.timeZone.trim() === "")
      localErrors.timeZone = "Enter an IANA time zone.";
    if (
      values.latitude.trim() === "" ||
      Number.isNaN(Number(values.latitude))
    ) {
      localErrors.latitude = "Enter a latitude.";
    }
    if (
      values.longitude.trim() === "" ||
      Number.isNaN(Number(values.longitude))
    ) {
      localErrors.longitude = "Enter a longitude.";
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
        onCreated(outcome.shift);
        close();
        return;
      case "field_errors":
        setFieldErrors(outcome.fieldErrors);
        return;
      case "invalid_schedule":
        setFieldErrors({ plannedEndAt: outcome.message });
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
          <DialogTitle>New shift</DialogTitle>
          <DialogDescription>
            Define the planned window and the office geofence staff must be
            within to check in on their phone.
          </DialogDescription>
        </DialogHeader>

        <form
          aria-label="Create shift"
          className="space-y-4"
          noValidate
          onSubmit={(event) => void handleSubmit(event)}
        >
          {formError ? (
            <Alert variant="destructive" aria-live="assertive">
              <AlertTitle>{formError}</AlertTitle>
            </Alert>
          ) : null}

          <div className="space-y-2">
            <Label htmlFor={labelId}>Label (optional)</Label>
            <Input
              id={labelId}
              value={values.label}
              disabled={submitting}
              onChange={(event) => set("label", event.target.value)}
              placeholder="Front of house"
            />
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor={startId}>Start</Label>
              <Input
                id={startId}
                type="datetime-local"
                value={values.plannedStartAt}
                disabled={submitting}
                onChange={(event) => set("plannedStartAt", event.target.value)}
                aria-invalid={Boolean(fieldErrors.plannedStartAt)}
              />
              {fieldErrors.plannedStartAt ? (
                <p className="text-destructive text-sm">
                  {fieldErrors.plannedStartAt}
                </p>
              ) : null}
            </div>
            <div className="space-y-2">
              <Label htmlFor={endId}>End</Label>
              <Input
                id={endId}
                type="datetime-local"
                value={values.plannedEndAt}
                disabled={submitting}
                onChange={(event) => set("plannedEndAt", event.target.value)}
                aria-invalid={Boolean(fieldErrors.plannedEndAt)}
              />
              {fieldErrors.plannedEndAt ? (
                <p className="text-destructive text-sm">
                  {fieldErrors.plannedEndAt}
                </p>
              ) : null}
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor={locationId}>Location label (optional)</Label>
            <Input
              id={locationId}
              value={values.locationLabel}
              disabled={submitting}
              onChange={(event) => set("locationLabel", event.target.value)}
              placeholder="Main hall"
            />
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor={latId}>Latitude</Label>
              <Input
                id={latId}
                inputMode="decimal"
                value={values.latitude}
                disabled={submitting}
                onChange={(event) => set("latitude", event.target.value)}
                aria-invalid={Boolean(fieldErrors.latitude)}
              />
              {fieldErrors.latitude ? (
                <p className="text-destructive text-sm">
                  {fieldErrors.latitude}
                </p>
              ) : null}
            </div>
            <div className="space-y-2">
              <Label htmlFor={lngId}>Longitude</Label>
              <Input
                id={lngId}
                inputMode="decimal"
                value={values.longitude}
                disabled={submitting}
                onChange={(event) => set("longitude", event.target.value)}
                aria-invalid={Boolean(fieldErrors.longitude)}
              />
              {fieldErrors.longitude ? (
                <p className="text-destructive text-sm">
                  {fieldErrors.longitude}
                </p>
              ) : null}
            </div>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor={radiusId}>Geofence radius (meters)</Label>
              <Input
                id={radiusId}
                inputMode="numeric"
                value={values.geofenceRadiusMeters}
                disabled={submitting}
                onChange={(event) =>
                  set("geofenceRadiusMeters", event.target.value)
                }
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor={breakId}>Break (minutes)</Label>
              <Input
                id={breakId}
                inputMode="numeric"
                value={values.breakMinutes}
                disabled={submitting}
                onChange={(event) => set("breakMinutes", event.target.value)}
              />
            </div>
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
              {submitting ? "Creating…" : "Create shift"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
