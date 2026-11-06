"use client";

import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Pencil, Plus } from "lucide-react";

import { Alert, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
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
import { formatInZone } from "@/lib/app-timezone";

import { AssignTalentDialog } from "@/features/talent/components/assign-talent-dialog";
import { talentAbilities } from "@/features/talent/lib/talent-access";
import { transitionTalentAssignment } from "@/features/talent/api/talent-assignments-gateway";

import {
  EventsRequestError,
  listEventTalents,
  type EventTalentAssignment,
} from "../../api/events-gateway";
import { eventKeys } from "../../api/events-queries";
import { useEventWorkspace } from "./event-workspace-shell";
import { AssignEventTalentDialog } from "./event-assign-talent-dialog";

const CARD = "border-border bg-card rounded-2xl border p-6 shadow-sm";

const STATUS_LABEL: Record<string, string> = {
  ASSIGNED: "Assigned",
  COMPLETED: "Completed",
  CANCELLED: "Cancelled",
};

function dateRange(row: EventTalentAssignment): string {
  const start = row.startAt
    ? formatInZone(row.startAt, { dateStyle: "medium" })
    : null;
  const end = row.endAt
    ? formatInZone(row.endAt, { dateStyle: "medium" })
    : null;
  if (start && end) return `${start} – ${end}`;
  return start ?? end ?? "Dates follow the event";
}

export function EventTalentsTab() {
  const { event, access } = useEventWorkspace();
  const keys = eventKeys(access);
  const queryClient = useQueryClient();
  const abilities = talentAbilities(access);
  const [assigning, setAssigning] = useState(false);
  const [editing, setEditing] = useState<EventTalentAssignment | null>(null);
  const [closing, setClosing] = useState<{
    row: EventTalentAssignment;
    status: "COMPLETED" | "CANCELLED";
  } | null>(null);
  const [reason, setReason] = useState("");
  const [closeError, setCloseError] = useState<string | null>(null);
  const [closePending, setClosePending] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  const rows = useQuery({
    queryKey: keys.eventTalents(event.id),
    queryFn: ({ signal }) => listEventTalents(event.id, signal),
  });

  const forbidden =
    rows.error instanceof EventsRequestError && rows.error.status === 403;

  /** Both the event and the talent side read these rows, so refresh both. */
  async function refresh() {
    await queryClient.invalidateQueries({
      queryKey: keys.eventTalents(event.id),
    });
    await queryClient.invalidateQueries({
      queryKey: ["talent", access.userId],
    });
    await queryClient.invalidateQueries({
      queryKey: ["events", access.userId],
    });
  }

  async function close() {
    if (!closing) return;
    setClosePending(true);
    setCloseError(null);
    const outcome = await transitionTalentAssignment(
      closing.row.talent.id,
      { id: closing.row.id, kind: closing.row.kind },
      closing.status,
      closing.status === "CANCELLED" ? reason.trim() : undefined,
    );
    setClosePending(false);
    if (outcome.status === "success") {
      setClosing(null);
      setMessage(
        closing.status === "CANCELLED"
          ? `${closing.row.talent.fullName} was removed from this event.`
          : `${closing.row.talent.fullName} marked as completed.`,
      );
      await refresh();
      return;
    }
    setCloseError(
      outcome.status === "terminal"
        ? "This assignment is already completed or cancelled."
        : "The change could not be saved. Try again.",
    );
  }

  return (
    <section className={CARD} aria-labelledby="event-talents-heading">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h3 id="event-talents-heading" className="text-lg font-semibold">
            Talents
          </h3>
          <p className="text-muted-foreground mt-1 text-sm">
            Talent profiles are managed on the Talent page. Assignments for this
            event are listed here.
          </p>
        </div>
        {abilities.canAssign ? (
          <Button type="button" onClick={() => setAssigning(true)}>
            <Plus className="size-4" aria-hidden />
            Assign talent
          </Button>
        ) : null}
      </div>

      {message ? (
        <p role="status" className="text-muted-foreground mt-4 text-sm">
          {message}
        </p>
      ) : null}

      <div className="mt-6">
        {rows.isPending ? (
          <p className="text-muted-foreground text-sm">Loading talents…</p>
        ) : forbidden ? (
          <Alert>
            <AlertTitle>
              Talent assignments are not available for your access.
            </AlertTitle>
          </Alert>
        ) : rows.isError ? (
          <Alert variant="destructive">
            <AlertTitle>Talents could not be loaded. Try again.</AlertTitle>
          </Alert>
        ) : rows.data.length === 0 ? (
          <div className="border-border rounded-xl border border-dashed p-8 text-center">
            <p className="font-medium">No talent assigned yet</p>
            <p className="text-muted-foreground mt-1 text-sm">
              {abilities.canAssign
                ? "Assign an existing talent to this event."
                : "No talent has been assigned to this event yet."}
            </p>
          </div>
        ) : (
          <ul className="grid gap-3">
            {rows.data.map((row) => {
              const open = row.status === "ASSIGNED";
              return (
                <li
                  key={row.id}
                  className="border-border flex flex-wrap items-center justify-between gap-3 rounded-xl border p-4"
                >
                  <div className="min-w-0">
                    <p className="font-semibold">{row.talent.fullName}</p>
                    <p className="text-muted-foreground text-sm">
                      {row.role} · {dateRange(row)}
                    </p>
                  </div>
                  <div className="flex flex-wrap items-center gap-2">
                    <Badge variant={open ? "secondary" : "outline"}>
                      {STATUS_LABEL[row.status] ?? row.status}
                    </Badge>
                    {abilities.canAssign && open ? (
                      <>
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          onClick={() => setEditing(row)}
                          aria-label={`Edit ${row.talent.fullName}`}
                        >
                          <Pencil className="size-4" aria-hidden />
                          Edit
                        </Button>
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          onClick={() => {
                            setReason("");
                            setCloseError(null);
                            setClosing({ row, status: "COMPLETED" });
                          }}
                        >
                          Complete
                        </Button>
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          onClick={() => {
                            setReason("");
                            setCloseError(null);
                            setClosing({ row, status: "CANCELLED" });
                          }}
                        >
                          Cancel assignment
                        </Button>
                      </>
                    ) : null}
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </div>

      <AssignEventTalentDialog
        open={assigning}
        onOpenChange={setAssigning}
        onAssigned={(text) => {
          setMessage(text);
          void refresh();
        }}
      />

      {editing ? (
        <AssignTalentDialog
          open
          onOpenChange={(open) => !open && setEditing(null)}
          access={access}
          talentId={editing.talent.id}
          talentName={editing.talent.fullName}
          assignment={{ ...editing, assignedBy: null, cancelledBy: null }}
          onSaved={(text) => {
            setEditing(null);
            setMessage(text);
            void refresh();
          }}
        />
      ) : null}

      <Dialog
        open={closing !== null}
        onOpenChange={(open) => !open && setClosing(null)}
      >
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>
              {closing?.status === "CANCELLED"
                ? `Cancel ${closing.row.talent.fullName}'s assignment?`
                : `Mark ${closing?.row.talent.fullName} as completed?`}
            </DialogTitle>
            <DialogDescription>
              {closing?.status === "CANCELLED"
                ? "The assignment stays in the history with the reason you give."
                : "The assignment stays in the history as completed."}
            </DialogDescription>
          </DialogHeader>
          {closing?.status === "CANCELLED" ? (
            <div className="grid gap-2">
              <Label htmlFor="cancel-reason">Reason</Label>
              <Input
                id="cancel-reason"
                value={reason}
                maxLength={500}
                onChange={(event) => setReason(event.target.value)}
              />
            </div>
          ) : null}
          {closeError ? (
            <Alert variant="destructive">
              <AlertTitle>{closeError}</AlertTitle>
            </Alert>
          ) : null}
          <DialogFooter className="sm:justify-between">
            <Button
              type="button"
              variant="outline"
              onClick={() => setClosing(null)}
            >
              Keep assignment
            </Button>
            <Button
              type="button"
              variant={
                closing?.status === "CANCELLED" ? "destructive" : "default"
              }
              disabled={
                closePending ||
                (closing?.status === "CANCELLED" && reason.trim().length === 0)
              }
              onClick={() => void close()}
            >
              {closePending
                ? "Saving…"
                : closing?.status === "CANCELLED"
                  ? "Cancel assignment"
                  : "Mark completed"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </section>
  );
}
