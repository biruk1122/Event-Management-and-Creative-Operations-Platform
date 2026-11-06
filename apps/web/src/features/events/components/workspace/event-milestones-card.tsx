"use client";

import { useId, useState, type FormEvent } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Pencil, Plus } from "lucide-react";

import { Alert, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
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
import { WorkDialogContent as DialogContent } from "@/components/ui/work-dialog-content";

import {
  createEventMilestone,
  deleteEventMilestone,
  listEventMilestones,
  updateEventMilestone,
} from "../../api/events-gateway";
import { eventKeys } from "../../api/events-queries";
import {
  MILESTONE_STATUS_LABELS,
  MILESTONE_STATUSES,
  milestoneDate,
} from "../../lib/event-workspace";
import type {
  EventMilestone,
  EventMilestoneStatus,
} from "../../lib/events-types";
import { useEventWorkspace } from "./event-workspace-shell";

const STATUS_VARIANT: Record<
  EventMilestoneStatus,
  "default" | "secondary" | "outline"
> = {
  NOT_STARTED: "outline",
  IN_PROGRESS: "secondary",
  COMPLETED: "default",
};

interface MilestoneValues {
  name: string;
  description: string;
  dueDate: string;
  status: EventMilestoneStatus;
}

const EMPTY: MilestoneValues = {
  name: "",
  description: "",
  dueDate: "",
  status: "NOT_STARTED",
};

function MilestoneDialog({
  eventId,
  milestone,
  onClose,
}: {
  eventId: string;
  /** Null adds a new milestone. */
  milestone: EventMilestone | null;
  onClose: () => void;
}) {
  const { access } = useEventWorkspace();
  const client = useQueryClient();
  const ids = {
    name: useId(),
    description: useId(),
    dueDate: useId(),
    status: useId(),
  };
  const [values, setValues] = useState<MilestoneValues>(
    milestone
      ? {
          name: milestone.name,
          description: milestone.description ?? "",
          dueDate: milestone.dueDate,
          status: milestone.status,
        }
      : EMPTY,
  );
  const [fieldError, setFieldError] = useState<string | null>(null);
  const [confirmingDelete, setConfirmingDelete] = useState(false);

  const refresh = () =>
    client.invalidateQueries({ queryKey: eventKeys(access).all });

  const save = useMutation({
    mutationFn: () => {
      const description = values.description.trim();
      return milestone
        ? updateEventMilestone(eventId, milestone.id, {
            name: values.name.trim(),
            description: description === "" ? null : description,
            dueDate: values.dueDate,
            status: values.status,
          })
        : createEventMilestone(eventId, {
            name: values.name.trim(),
            dueDate: values.dueDate,
            status: values.status,
            ...(description === "" ? {} : { description }),
          });
    },
    onSuccess: async () => {
      await refresh();
      onClose();
    },
  });

  const remove = useMutation({
    mutationFn: () => deleteEventMilestone(eventId, milestone!.id),
    onSuccess: async () => {
      await refresh();
      onClose();
    },
  });

  const busy = save.isPending || remove.isPending;
  const failure = save.error ?? remove.error;

  function submit(submitEvent: FormEvent) {
    submitEvent.preventDefault();
    if (values.name.trim() === "") {
      setFieldError("Enter a name.");
      return;
    }
    if (values.dueDate === "") {
      setFieldError("Choose a due date.");
      return;
    }
    setFieldError(null);
    save.mutate();
  }

  return (
    <Dialog open onOpenChange={(open) => (open ? undefined : onClose())}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>
            {milestone ? "Edit milestone" : "Add milestone"}
          </DialogTitle>
          <DialogDescription>
            Milestones track key dates for this event.
          </DialogDescription>
        </DialogHeader>
        <form
          aria-label={milestone ? "Edit milestone" : "Add milestone"}
          className="space-y-4"
          noValidate
          onSubmit={submit}
        >
          {fieldError || failure ? (
            <Alert variant="destructive" aria-live="assertive">
              <AlertTitle>{fieldError ?? failure?.message}</AlertTitle>
            </Alert>
          ) : null}
          <div className="space-y-2">
            <Label htmlFor={ids.name}>Name</Label>
            <Input
              id={ids.name}
              required
              maxLength={200}
              value={values.name}
              disabled={busy}
              onChange={(change) =>
                setValues({ ...values, name: change.target.value })
              }
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor={ids.description}>Description (optional)</Label>
            <Textarea
              id={ids.description}
              rows={2}
              maxLength={2000}
              value={values.description}
              disabled={busy}
              onChange={(change) =>
                setValues({ ...values, description: change.target.value })
              }
            />
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor={ids.dueDate}>Due date</Label>
              <Input
                id={ids.dueDate}
                type="date"
                required
                value={values.dueDate}
                disabled={busy}
                onChange={(change) =>
                  setValues({ ...values, dueDate: change.target.value })
                }
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor={ids.status}>Status</Label>
              <Select
                value={values.status}
                disabled={busy}
                onValueChange={(status) =>
                  setValues({
                    ...values,
                    status: status as EventMilestoneStatus,
                  })
                }
              >
                <SelectTrigger id={ids.status}>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {MILESTONE_STATUSES.map((status) => (
                    <SelectItem key={status} value={status}>
                      {MILESTONE_STATUS_LABELS[status]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          <DialogFooter className="sm:justify-between">
            {milestone ? (
              confirmingDelete ? (
                <Button
                  type="button"
                  variant="destructive"
                  disabled={busy}
                  aria-busy={remove.isPending}
                  onClick={() => remove.mutate()}
                >
                  {remove.isPending ? "Deleting…" : "Confirm delete"}
                </Button>
              ) : (
                <Button
                  type="button"
                  variant="ghost"
                  className="text-destructive hover:text-destructive"
                  disabled={busy}
                  onClick={() => setConfirmingDelete(true)}
                >
                  Delete
                </Button>
              )
            ) : (
              <span />
            )}
            <div className="flex gap-2">
              <Button
                type="button"
                variant="outline"
                disabled={busy}
                onClick={onClose}
              >
                Cancel
              </Button>
              <Button type="submit" disabled={busy} aria-busy={save.isPending}>
                {save.isPending ? "Saving…" : "Save milestone"}
              </Button>
            </div>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

/** The event's milestones, managed here and independent of its tasks. */
export function EventMilestonesCard() {
  const { event, access, abilities } = useEventWorkspace();
  const keys = eventKeys(access);
  const [editing, setEditing] = useState<EventMilestone | "new" | null>(null);

  const query = useQuery({
    queryKey: keys.milestones(event.id),
    queryFn: ({ signal }) => listEventMilestones(event.id, signal),
    retry: false,
  });

  return (
    <section
      aria-labelledby="event-milestones-heading"
      className="border-border bg-card space-y-4 rounded-2xl border p-6 shadow-sm"
    >
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h3 id="event-milestones-heading" className="text-lg font-semibold">
          Milestones
        </h3>
        {abilities.canUpdate ? (
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => setEditing("new")}
          >
            <Plus aria-hidden="true" data-icon="inline-start" />
            Add milestone
          </Button>
        ) : null}
      </div>

      {query.isPending ? (
        <p role="status" className="text-muted-foreground text-sm">
          Loading milestones…
        </p>
      ) : query.isError ? (
        <div role="alert" className="space-y-2 text-sm">
          <p>{query.error.message}</p>
          <Button variant="outline" onClick={() => void query.refetch()}>
            Try again
          </Button>
        </div>
      ) : query.data.length === 0 ? (
        <p className="text-muted-foreground text-sm">No milestones yet.</p>
      ) : (
        <ul className="divide-border divide-y">
          {query.data.map((milestone) => (
            <li
              key={milestone.id}
              className="flex flex-wrap items-center gap-3 py-3"
            >
              <Badge variant={STATUS_VARIANT[milestone.status]}>
                {MILESTONE_STATUS_LABELS[milestone.status]}
              </Badge>
              <div className="min-w-0 flex-1">
                <p className="text-sm font-medium break-words">
                  {milestone.name}
                </p>
                {milestone.description ? (
                  <p className="text-muted-foreground text-xs break-words">
                    {milestone.description}
                  </p>
                ) : null}
              </div>
              <span className="text-muted-foreground text-xs">
                {milestoneDate(milestone.dueDate)}
              </span>
              {abilities.canUpdate ? (
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  aria-label={`Edit ${milestone.name}`}
                  onClick={() => setEditing(milestone)}
                >
                  <Pencil aria-hidden="true" className="size-4" />
                </Button>
              ) : null}
            </li>
          ))}
        </ul>
      )}

      {editing ? (
        <MilestoneDialog
          eventId={event.id}
          milestone={editing === "new" ? null : editing}
          onClose={() => setEditing(null)}
        />
      ) : null}
    </section>
  );
}
