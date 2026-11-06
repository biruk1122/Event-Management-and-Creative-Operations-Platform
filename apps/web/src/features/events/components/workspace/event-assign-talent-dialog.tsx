"use client";

import { useState, type FormEvent } from "react";
import { useQuery } from "@tanstack/react-query";

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
import { Textarea } from "@/components/ui/textarea";
import { zonedLocalToUtcIso } from "@/lib/app-timezone";

import {
  createEventTalentAssignment,
  type EventTalentCreateOutcome,
  type EventTalentDraft,
} from "@/features/talent/api/talent-assignments-gateway";
import { conflictLabel } from "@/features/talent/components/assign-talent-dialog";
import { listTalents } from "@/features/talent/api/talent-gateway";
import type { TalentAssignmentConflict } from "@/features/talent/lib/talent-types";

import { eventKeys } from "../../api/events-queries";
import { useEventWorkspace } from "./event-workspace-shell";

const MESSAGES: Partial<Record<EventTalentCreateOutcome["status"], string>> = {
  duplicate: "This talent is already assigned to this event.",
  inactive: "This talent is inactive and cannot be assigned.",
  work_not_found: "This event no longer exists.",
  dates_invalid: "The end time must be after the start time.",
  permission_denied: "You cannot assign talent to this event.",
  unexpected: "The assignment could not be saved. Try again.",
};

export interface AssignEventTalentDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onAssigned: (message: string) => void;
}

/** Picks an existing central talent and assigns them to this event. The server
 * runs the conflict check and enforces every rule. The override is recorded
 * only when the user explicitly confirms it. */
export function AssignEventTalentDialog({
  open,
  onOpenChange,
  onAssigned,
}: AssignEventTalentDialogProps) {
  const { event, access } = useEventWorkspace();
  const keys = eventKeys(access);
  const [search, setSearch] = useState("");
  const [talentId, setTalentId] = useState<string | null>(null);
  const [role, setRole] = useState("");
  const [startLocal, setStartLocal] = useState("");
  const [endLocal, setEndLocal] = useState("");
  const [notes, setNotes] = useState("");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [conflicts, setConflicts] = useState<TalentAssignmentConflict[]>([]);
  const [overrideReason, setOverrideReason] = useState("");

  const directory = useQuery({
    queryKey: [...keys.all, "assign-talent-directory", search],
    queryFn: ({ signal }) =>
      listTalents({ search: search.trim() || null, pageSize: 25 }, signal),
    enabled: open,
  });

  function reset() {
    setSearch("");
    setTalentId(null);
    setRole("");
    setStartLocal("");
    setEndLocal("");
    setNotes("");
    setError(null);
    setConflicts([]);
    setOverrideReason("");
  }

  function close(next: boolean) {
    if (!next) reset();
    onOpenChange(next);
  }

  async function submit(acknowledgeConflicts: boolean) {
    if (!talentId) return;
    setPending(true);
    setError(null);
    const draft: EventTalentDraft = {
      talentId,
      role: role.trim(),
      startAt: zonedLocalToUtcIso(startLocal) ?? null,
      endAt: zonedLocalToUtcIso(endLocal) ?? null,
      notes: notes.trim() || null,
      acknowledgeConflicts,
      overrideReason: acknowledgeConflicts
        ? overrideReason.trim() || null
        : null,
    };
    const outcome = await createEventTalentAssignment(event.id, draft);
    setPending(false);
    if (outcome.status === "success") {
      onAssigned(`${role.trim()} assigned to ${event.name}.`);
      close(false);
      return;
    }
    if (outcome.status === "conflict") {
      setConflicts(outcome.conflicts);
      return;
    }
    setError(MESSAGES[outcome.status] ?? "The assignment could not be saved.");
  }

  function onSubmit(formEvent: FormEvent) {
    formEvent.preventDefault();
    void submit(false);
  }

  const canSubmit = Boolean(talentId) && role.trim().length > 0 && !pending;

  return (
    <Dialog open={open} onOpenChange={close}>
      <DialogContent className="sm:max-w-xl">
        <DialogHeader>
          <DialogTitle>Assign talent</DialogTitle>
          <DialogDescription>
            Choose an existing talent from the directory. New profiles are
            created on the Talent page.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={onSubmit} className="grid gap-5" noValidate>
          <div className="grid gap-2">
            <Label htmlFor="assign-talent-search">Talent</Label>
            <Input
              id="assign-talent-search"
              type="search"
              placeholder="Search the directory"
              value={search}
              onChange={(event) => setSearch(event.target.value)}
            />
            <div
              className="max-h-56 overflow-y-auto"
              role="listbox"
              aria-label="Talent directory"
            >
              {directory.isPending ? (
                <p className="text-muted-foreground p-3 text-sm">Loading…</p>
              ) : directory.isError ? (
                <p className="text-destructive p-3 text-sm">
                  The directory could not be loaded.
                </p>
              ) : directory.data.items.length === 0 ? (
                <p className="text-muted-foreground p-3 text-sm">
                  No matching talent.
                </p>
              ) : (
                directory.data.items.map((talent) => {
                  const inactive = talent.availability === "INACTIVE";
                  const active = talentId === talent.id;
                  return (
                    <button
                      key={talent.id}
                      type="button"
                      role="option"
                      aria-selected={active}
                      disabled={inactive}
                      onClick={() => setTalentId(talent.id)}
                      className={`flex w-full items-center justify-between rounded-lg px-3 py-2 text-left text-sm ${
                        active ? "bg-accent" : "hover:bg-accent/60"
                      } disabled:opacity-60`}
                    >
                      <span>{talent.fullName}</span>
                      {inactive ? (
                        <Badge variant="secondary">Inactive</Badge>
                      ) : (
                        <span className="text-muted-foreground text-xs">
                          {talent.availability.toLowerCase()}
                        </span>
                      )}
                    </button>
                  );
                })
              )}
            </div>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="grid gap-2">
              <Label htmlFor="assign-talent-role">Role</Label>
              <Input
                id="assign-talent-role"
                value={role}
                maxLength={200}
                onChange={(event) => setRole(event.target.value)}
                placeholder="Headliner"
              />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="assign-talent-start">Starts (optional)</Label>
              <Input
                id="assign-talent-start"
                type="datetime-local"
                value={startLocal}
                onChange={(event) => setStartLocal(event.target.value)}
              />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="assign-talent-end">Ends (optional)</Label>
              <Input
                id="assign-talent-end"
                type="datetime-local"
                value={endLocal}
                onChange={(event) => setEndLocal(event.target.value)}
              />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="assign-talent-notes">Notes (optional)</Label>
              <Textarea
                id="assign-talent-notes"
                maxLength={2000}
                rows={2}
                value={notes}
                onChange={(event) => setNotes(event.target.value)}
              />
            </div>
          </div>

          {conflicts.length > 0 ? (
            <Alert>
              <AlertTitle>This talent has conflicts</AlertTitle>
              <ul className="mt-2 list-disc pl-5 text-sm">
                {conflicts.map((conflict, index) => (
                  <li key={index}>{conflictLabel(conflict)}</li>
                ))}
              </ul>
              <div className="mt-4 grid gap-2">
                <Label htmlFor="assign-talent-override">
                  Reason for overriding (optional)
                </Label>
                <Input
                  id="assign-talent-override"
                  maxLength={500}
                  value={overrideReason}
                  onChange={(event) => setOverrideReason(event.target.value)}
                />
                <Button
                  type="button"
                  variant="destructive"
                  disabled={!canSubmit}
                  onClick={() => void submit(true)}
                >
                  Assign anyway
                </Button>
              </div>
            </Alert>
          ) : null}

          {error ? (
            <Alert variant="destructive">
              <AlertTitle>{error}</AlertTitle>
            </Alert>
          ) : null}

          <DialogFooter className="sm:justify-between">
            <Button
              type="button"
              variant="outline"
              onClick={() => close(false)}
            >
              Cancel
            </Button>
            <Button type="submit" disabled={!canSubmit}>
              {pending ? "Assigning…" : "Assign talent"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
