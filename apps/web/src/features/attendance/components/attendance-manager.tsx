"use client";

import { useState } from "react";

import { Alert, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import type { CurrentAccess } from "@/features/auth/api/access-queries";

import { useMySessions, useMyShifts, usePunchMutation } from "../api/attendance-queries";
import { AttendanceRequestError } from "../api/attendance-gateway";
import { readCurrentPosition } from "../lib/geolocation";
import { formatDateTime, formatMinutes } from "../lib/attendance-date";
import { SHIFT_STATUS_LABELS } from "../lib/attendance-types";

const SESSION_STATUS_LABELS: Record<string, string> = {
  OPEN: "Open",
  CLOSED: "Closed",
  MISSING_CHECKOUT: "Missing checkout",
};

function newClientRequestId(): string {
  return typeof crypto.randomUUID === "function"
    ? crypto.randomUUID()
    : `${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

export interface AttendanceManagerProps {
  access: CurrentAccess;
}

export function AttendanceManager({ access }: AttendanceManagerProps) {
  const shifts = useMyShifts(access);
  const sessions = useMySessions(access);
  const punchMutation = usePunchMutation(access);
  const [message, setMessage] = useState<{ text: string; ok: boolean } | null>(null);
  const [busyShiftId, setBusyShiftId] = useState<string | null>(null);

  const openSession = (sessions.data ?? []).find((session) => session.status === "OPEN");

  async function handleCheckIn(eventShiftId: string) {
    setBusyShiftId(eventShiftId);
    setMessage(null);
    const position = await readCurrentPosition();
    const outcome = await punchMutation.mutateAsync({
      punchType: "CHECK_IN",
      eventShiftId,
      clientRequestId: newClientRequestId(),
      ...(position
        ? {
            latitude: position.latitude,
            longitude: position.longitude,
            accuracyMeters: position.accuracyMeters,
          }
        : {}),
    });
    setBusyShiftId(null);
    reportOutcome(outcome);
  }

  async function handleCheckOut() {
    setBusyShiftId("checkout");
    setMessage(null);
    const position = await readCurrentPosition();
    const outcome = await punchMutation.mutateAsync({
      punchType: "CHECK_OUT",
      clientRequestId: newClientRequestId(),
      ...(position
        ? {
            latitude: position.latitude,
            longitude: position.longitude,
            accuracyMeters: position.accuracyMeters,
          }
        : {}),
    });
    setBusyShiftId(null);
    reportOutcome(outcome);
  }

  function reportOutcome(
    outcome: Awaited<ReturnType<typeof punchMutation.mutateAsync>>,
  ) {
    if (outcome.status === "success") {
      setMessage({ text: outcome.result.message, ok: true });
      return;
    }
    const text =
      outcome.status === "already_checked_in"
        ? "You're already checked in."
        : outcome.status === "no_open_session"
          ? "There is no open check-in to check out of."
          : outcome.status === "not_assigned_to_shift"
            ? "You are not assigned to this shift."
            : outcome.status === "shift_not_available"
              ? "This shift is cancelled or has already ended."
              : outcome.status === "leave_conflict"
                ? "You have approved leave covering this date."
                : outcome.status === "shift_not_found"
                  ? "This shift no longer exists."
                  : outcome.status === "permission_denied"
                    ? "You don't have permission to do that."
                    : "Something went wrong. Try again.";
    setMessage({ text, ok: false });
  }

  if (shifts.isPending || sessions.isPending) {
    return <p role="status">Loading your attendance…</p>;
  }

  if (shifts.isError || sessions.isError) {
    const error = shifts.error ?? sessions.error;
    return (
      <div role="alert" className="space-y-2">
        <p>{error instanceof AttendanceRequestError ? error.message : "We could not load your attendance. Try again."}</p>
        <Button
          variant="outline"
          onClick={() => {
            void shifts.refetch();
            void sessions.refetch();
          }}
        >
          Try again
        </Button>
      </div>
    );
  }

  const punchableShifts = (shifts.data ?? []).filter(
    (shift) => shift.status !== "CANCELLED" && shift.status !== "COMPLETED",
  );

  return (
    <div className="space-y-6">
      {message ? (
        <Alert variant={message.ok ? "default" : "destructive"} aria-live="assertive">
          <AlertTitle>{message.text}</AlertTitle>
        </Alert>
      ) : null}

      <section className="space-y-3">
        <h2 className="text-lg font-semibold">Attendance</h2>
        {openSession ? (
          <div className="flex items-center justify-between rounded-xl border p-4">
            <div>
              <p className="font-medium">
                Checked in{openSession.eventName ? ` · ${openSession.eventName}` : ""}
              </p>
              <p className="text-muted-foreground text-sm">
                Since {formatDateTime(openSession.checkInAt)}
              </p>
            </div>
            <Button
              disabled={punchMutation.isPending}
              aria-busy={busyShiftId === "checkout"}
              onClick={() => void handleCheckOut()}
            >
              {busyShiftId === "checkout" ? "Checking out…" : "Check out"}
            </Button>
          </div>
        ) : punchableShifts.length === 0 ? (
          <p className="text-muted-foreground text-sm">
            You have no assigned event shifts to check into right now.
          </p>
        ) : (
          <ul className="space-y-2">
            {punchableShifts.map((shift) => (
              <li
                key={shift.id}
                className="flex items-center justify-between rounded-xl border p-4"
              >
                <div>
                  <p className="font-medium">
                    {shift.eventName}
                    {shift.label ? ` · ${shift.label}` : ""}
                  </p>
                  <p className="text-muted-foreground text-sm">
                    {formatDateTime(shift.plannedStartAt)} – {formatDateTime(shift.plannedEndAt)}
                    {shift.locationLabel ? ` · ${shift.locationLabel}` : ""}
                  </p>
                  <p className="text-muted-foreground text-xs">
                    {SHIFT_STATUS_LABELS[shift.status]}
                  </p>
                </div>
                <Button
                  disabled={punchMutation.isPending}
                  aria-busy={busyShiftId === shift.id}
                  onClick={() => void handleCheckIn(shift.id)}
                >
                  {busyShiftId === shift.id ? "Checking in…" : "Check in"}
                </Button>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="space-y-3">
        <h2 className="text-lg font-semibold">Recent sessions</h2>
        {(sessions.data ?? []).length === 0 ? (
          <p className="text-muted-foreground text-sm">No attendance recorded yet.</p>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="text-muted-foreground text-left">
                <th className="py-2 font-medium">Event</th>
                <th className="py-2 font-medium">Check-in</th>
                <th className="py-2 font-medium">Check-out</th>
                <th className="py-2 font-medium">Net</th>
                <th className="py-2 font-medium">Status</th>
              </tr>
            </thead>
            <tbody>
              {(sessions.data ?? []).map((session) => (
                <tr key={session.id} className="border-t">
                  <td className="py-2">{session.eventName ?? "Office"}</td>
                  <td className="py-2">{formatDateTime(session.checkInAt)}</td>
                  <td className="py-2">
                    {session.checkOutAt ? formatDateTime(session.checkOutAt) : "—"}
                  </td>
                  <td className="py-2">{formatMinutes(session.netMinutes)}</td>
                  <td className="py-2">
                    {SESSION_STATUS_LABELS[session.status] ?? session.status}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>
    </div>
  );
}
