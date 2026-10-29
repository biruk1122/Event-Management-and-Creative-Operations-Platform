"use client";

import { useId, useState } from "react";

import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import type { CurrentAccess } from "@/features/auth/api/access-queries";

import { useAssignableEvents, useEventShifts, useShiftMutations } from "../api/attendance-queries";
import { AttendanceRequestError } from "../api/attendance-gateway";
import { formatDateTime } from "../lib/attendance-date";
import { SHIFT_STATUS_LABELS } from "../lib/attendance-types";
import type { EventShift } from "../lib/attendance-types";
import { CreateShiftDialog } from "./create-shift-dialog";
import { RescheduleShiftDialog } from "./reschedule-shift-dialog";
import { ShiftReasonDialog } from "./shift-reason-dialog";
import { ShiftAssignmentDialog } from "./shift-assignment-dialog";

export interface ShiftScheduleManagerProps {
  access: CurrentAccess;
}

export function ShiftScheduleManager({ access }: ShiftScheduleManagerProps) {
  const eventSelectId = useId();
  const events = useAssignableEvents(access);
  const [eventId, setEventId] = useState<string | null>(null);
  const shifts = useEventShifts(access, eventId);
  const mutations = useShiftMutations(access, eventId);

  const [createOpen, setCreateOpen] = useState(false);
  const [rescheduleTarget, setRescheduleTarget] = useState<EventShift | null>(null);
  const [reasonTarget, setReasonTarget] = useState<
    { mode: "cancel" | "reinstate"; shift: EventShift } | null
  >(null);
  const [assignmentTarget, setAssignmentTarget] = useState<EventShift | null>(null);

  const selectedEvent = (events.data ?? []).find((event) => event.id === eventId) ?? null;

  return (
    <div className="space-y-6">
      <div className="max-w-sm space-y-2">
        <Label htmlFor={eventSelectId}>Event</Label>
        <Select
          value={eventId ?? ""}
          onValueChange={(value) => setEventId(value || null)}
        >
          <SelectTrigger id={eventSelectId}>
            <SelectValue placeholder="Choose an event" />
          </SelectTrigger>
          <SelectContent>
            {(events.data ?? []).map((event) => (
              <SelectItem key={event.id} value={event.id}>
                {event.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {eventId === null ? (
        <p className="text-muted-foreground text-sm">
          Choose an event to view and schedule its shifts.
        </p>
      ) : shifts.isPending ? (
        <p role="status">Loading shifts…</p>
      ) : shifts.isError ? (
        <div role="alert" className="space-y-2">
          <p>
            {shifts.error instanceof AttendanceRequestError
              ? shifts.error.message
              : "We could not load shifts. Try again."}
          </p>
          <Button variant="outline" onClick={() => void shifts.refetch()}>
            Try again
          </Button>
        </div>
      ) : (
        <div className="space-y-4">
          <div className="flex justify-end">
            <Button onClick={() => setCreateOpen(true)}>New shift</Button>
          </div>
          {(shifts.data ?? []).length === 0 ? (
            <p className="text-muted-foreground text-sm">No shifts scheduled yet.</p>
          ) : (
            <ul className="space-y-2">
              {(shifts.data ?? []).map((shift) => (
                <li key={shift.id} className="space-y-2 rounded-xl border p-4">
                  <div className="flex items-start justify-between gap-4">
                    <div>
                      <p className="font-medium">
                        {shift.label ?? "Shift"}
                        {shift.locationLabel ? ` · ${shift.locationLabel}` : ""}
                      </p>
                      <p className="text-muted-foreground text-sm">
                        {formatDateTime(shift.plannedStartAt)} –{" "}
                        {formatDateTime(shift.plannedEndAt)}
                      </p>
                      <p className="text-muted-foreground text-xs">
                        {SHIFT_STATUS_LABELS[shift.status]}
                      </p>
                    </div>
                    <div className="flex flex-wrap justify-end gap-2">
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => setAssignmentTarget(shift)}
                      >
                        Assignments
                      </Button>
                      {shift.status !== "CANCELLED" && shift.status !== "COMPLETED" ? (
                        <>
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => setRescheduleTarget(shift)}
                          >
                            Reschedule
                          </Button>
                          <Button
                            variant="destructive"
                            size="sm"
                            onClick={() => setReasonTarget({ mode: "cancel", shift })}
                          >
                            Cancel
                          </Button>
                        </>
                      ) : shift.status === "CANCELLED" ? (
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => setReasonTarget({ mode: "reinstate", shift })}
                        >
                          Reinstate
                        </Button>
                      ) : null}
                    </div>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}

      <CreateShiftDialog
        open={createOpen}
        onOpenChange={setCreateOpen}
        onCreate={mutations.create.mutateAsync}
        onCreated={() => undefined}
      />

      <RescheduleShiftDialog
        shift={rescheduleTarget}
        onOpenChange={(open) => {
          if (!open) setRescheduleTarget(null);
        }}
        onReschedule={(input) =>
          mutations.reschedule.mutateAsync({ shiftId: rescheduleTarget!.id, input })
        }
        onRescheduled={() => undefined}
      />

      <ShiftReasonDialog
        mode={reasonTarget?.mode ?? "cancel"}
        shift={reasonTarget?.shift ?? null}
        onOpenChange={(open) => {
          if (!open) setReasonTarget(null);
        }}
        onSubmit={(reason) =>
          reasonTarget!.mode === "cancel"
            ? mutations.cancel.mutateAsync({ shiftId: reasonTarget!.shift.id, reason })
            : mutations.reinstate.mutateAsync({ shiftId: reasonTarget!.shift.id, reason })
        }
        onDone={() => undefined}
      />

      <ShiftAssignmentDialog
        access={access}
        eventId={eventId ?? ""}
        departmentId={selectedEvent?.departmentId ?? null}
        shift={assignmentTarget}
        onOpenChange={(open) => {
          if (!open) setAssignmentTarget(null);
        }}
      />
    </div>
  );
}
