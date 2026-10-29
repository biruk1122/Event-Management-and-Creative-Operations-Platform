"use client";

import { useId, useState, type FormEvent } from "react";

import { Alert, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import type { CurrentAccess } from "@/features/auth/api/access-queries";

import { useKioskMutations, useKiosks } from "../api/attendance-queries";
import { AttendanceRequestError } from "../api/attendance-gateway";
import type { KioskRegistered } from "../lib/attendance-outcome";

const FORM_ERRORS: Record<string, string> = {
  permission_denied: "You do not have permission to manage kiosks.",
  unexpected: "We could not register the kiosk. Try again.",
};

export interface KioskManagementManagerProps {
  access: CurrentAccess;
}

export function KioskManagementManager({ access }: KioskManagementManagerProps) {
  const nameId = useId();
  const locationId = useId();
  const kiosks = useKiosks(access);
  const mutations = useKioskMutations(access);

  const [name, setName] = useState("");
  const [locationLabel, setLocationLabel] = useState("");
  const [fieldErrors, setFieldErrors] = useState<
    Partial<Record<"name" | "locationLabel", string>>
  >({});
  const [formError, setFormError] = useState<string | null>(null);
  const [revealed, setRevealed] = useState<KioskRegistered | null>(null);

  async function handleRegister(event: FormEvent) {
    event.preventDefault();
    setFormError(null);
    const localErrors: Partial<Record<"name" | "locationLabel", string>> = {};
    if (name.trim() === "") localErrors.name = "Enter a device name.";
    if (locationLabel.trim() === "") localErrors.locationLabel = "Enter a location.";
    if (Object.keys(localErrors).length > 0) {
      setFieldErrors(localErrors);
      return;
    }
    setFieldErrors({});
    const outcome = await mutations.register.mutateAsync({ name, locationLabel });
    switch (outcome.status) {
      case "success":
        setRevealed(outcome.kiosk);
        setName("");
        setLocationLabel("");
        return;
      case "field_errors":
        setFieldErrors(outcome.fieldErrors);
        return;
      default:
        setFormError(FORM_ERRORS[outcome.status] ?? FORM_ERRORS.unexpected!);
    }
  }

  async function handleRevoke(id: string) {
    await mutations.revoke.mutateAsync(id);
  }

  return (
    <div className="space-y-6">
      <form
        aria-label="Register kiosk"
        className="space-y-4 rounded-xl border p-4"
        noValidate
        onSubmit={(event) => void handleRegister(event)}
      >
        <h2 className="text-lg font-semibold">Register a kiosk</h2>
        {formError ? (
          <Alert variant="destructive" aria-live="assertive">
            <AlertTitle>{formError}</AlertTitle>
          </Alert>
        ) : null}
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-2">
            <Label htmlFor={nameId}>Device name</Label>
            <Input
              id={nameId}
              value={name}
              onChange={(event) => setName(event.target.value)}
              disabled={mutations.register.isPending}
              aria-invalid={Boolean(fieldErrors.name)}
            />
            {fieldErrors.name ? (
              <p className="text-destructive text-sm">{fieldErrors.name}</p>
            ) : null}
          </div>
          <div className="space-y-2">
            <Label htmlFor={locationId}>Location</Label>
            <Input
              id={locationId}
              value={locationLabel}
              onChange={(event) => setLocationLabel(event.target.value)}
              disabled={mutations.register.isPending}
              aria-invalid={Boolean(fieldErrors.locationLabel)}
            />
            {fieldErrors.locationLabel ? (
              <p className="text-destructive text-sm">{fieldErrors.locationLabel}</p>
            ) : null}
          </div>
        </div>
        <Button
          type="submit"
          disabled={mutations.register.isPending}
          aria-busy={mutations.register.isPending}
        >
          {mutations.register.isPending ? "Registering…" : "Register kiosk"}
        </Button>
      </form>

      {revealed ? (
        <Alert aria-live="assertive">
          <AlertTitle>
            Kiosk registered. Copy this token onto the device now - it will not be shown
            again.
          </AlertTitle>
          <p className="mt-1 font-mono text-sm break-all">
            Kiosk ID: {revealed.id}
          </p>
          <p className="font-mono text-sm break-all">Token: {revealed.token}</p>
        </Alert>
      ) : null}

      {kiosks.isPending ? (
        <p role="status">Loading kiosks…</p>
      ) : kiosks.isError ? (
        <div role="alert" className="space-y-2">
          <p>
            {kiosks.error instanceof AttendanceRequestError
              ? kiosks.error.message
              : "We could not load kiosks. Try again."}
          </p>
          <Button variant="outline" onClick={() => void kiosks.refetch()}>
            Try again
          </Button>
        </div>
      ) : (kiosks.data ?? []).length === 0 ? (
        <p className="text-muted-foreground text-sm">No kiosks registered yet.</p>
      ) : (
        <ul className="space-y-2">
          {(kiosks.data ?? []).map((kiosk) => (
            <li
              key={kiosk.id}
              className="flex items-center justify-between rounded-xl border p-4"
            >
              <div>
                <p className="font-medium">{kiosk.name}</p>
                <p className="text-muted-foreground text-sm">{kiosk.locationLabel}</p>
                <p className="text-muted-foreground text-xs">
                  {kiosk.isActive ? "Active" : "Revoked"}
                </p>
              </div>
              {kiosk.isActive ? (
                <Button
                  variant="destructive"
                  size="sm"
                  disabled={mutations.revoke.isPending}
                  onClick={() => void handleRevoke(kiosk.id)}
                >
                  Revoke
                </Button>
              ) : null}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
