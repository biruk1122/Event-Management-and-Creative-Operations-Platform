"use client";

import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Plus, Users, X } from "lucide-react";

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

import {
  listAssignableTeams,
  listEventTeams,
  type EventTeam,
} from "../../api/events-gateway";
import type { EventPersonSummary } from "../../lib/events-types";
import { eventKeys, useEventsMutations } from "../../api/events-queries";
import { personName } from "../../lib/events-types";
import { useEventWorkspace } from "./event-workspace-shell";

const CARD = "border-border bg-card rounded-2xl border p-6 shadow-sm";

function TeamCard({
  team,
  canRemove,
  onRemove,
}: {
  team: EventTeam;
  canRemove: boolean;
  onRemove: (team: EventTeam) => void;
}) {
  return (
    <article className="border-border rounded-xl border p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h4 className="font-semibold">{team.name}</h4>
          <p className="text-muted-foreground text-sm">
            {team.department.name}
          </p>
          {team.description ? (
            <p className="text-muted-foreground mt-2 text-sm">
              {team.description}
            </p>
          ) : null}
        </div>
        {canRemove ? (
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => onRemove(team)}
            aria-label={`Remove ${team.name} from this event`}
          >
            <X className="size-4" aria-hidden />
            Remove
          </Button>
        ) : null}
      </div>

      <dl className="mt-4 grid gap-3 text-sm sm:grid-cols-2">
        <div>
          <dt className="text-muted-foreground">Team manager</dt>
          <dd className="mt-1">
            {team.manager ? personName(team.manager) : "Not set"}
          </dd>
        </div>
        <div>
          <dt className="text-muted-foreground">Members</dt>
          <dd className="mt-1">
            {!team.membersVisible
              ? "Visible to team managers and the department"
              : team.members.length === 0
                ? "No members yet"
                : team.members
                    .map((member: EventPersonSummary) => personName(member))
                    .join(", ")}
          </dd>
        </div>
      </dl>
    </article>
  );
}

function AssignTeamDialog({
  open,
  onOpenChange,
  assignedIds,
  onAssign,
  pending,
  error,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  assignedIds: Set<string>;
  onAssign: (teamId: string) => void;
  pending: boolean;
  error: string | null;
}) {
  const [search, setSearch] = useState("");
  const [selected, setSelected] = useState<string | null>(null);
  const { access } = useEventWorkspace();
  const keys = eventKeys(access);
  const teams = useQuery({
    queryKey: keys.teams,
    queryFn: ({ signal }) => listAssignableTeams(signal),
    enabled: open,
  });

  const term = search.trim().toLowerCase();
  const visible = (teams.data ?? []).filter((team) =>
    team.name.toLowerCase().includes(term),
  );

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Assign a team</DialogTitle>
          <DialogDescription>
            Choose an existing team. Deactivated teams cannot be assigned.
          </DialogDescription>
        </DialogHeader>

        <Input
          type="search"
          placeholder="Search teams"
          value={search}
          onChange={(event) => setSearch(event.target.value)}
          aria-label="Search teams"
        />

        <div
          className="max-h-72 overflow-y-auto"
          role="listbox"
          aria-label="Teams"
        >
          {teams.isPending ? (
            <p className="text-muted-foreground p-3 text-sm">Loading teams…</p>
          ) : teams.isError ? (
            <p className="text-destructive p-3 text-sm">
              Teams could not be loaded. Try again.
            </p>
          ) : visible.length === 0 ? (
            <p className="text-muted-foreground p-3 text-sm">
              No matching teams.
            </p>
          ) : (
            visible.map((team) => {
              const assigned = assignedIds.has(team.id);
              const active = selected === team.id;
              return (
                <button
                  key={team.id}
                  type="button"
                  role="option"
                  aria-selected={active}
                  disabled={assigned}
                  onClick={() => setSelected(team.id)}
                  className={`flex w-full items-center justify-between rounded-lg px-3 py-2 text-left text-sm ${
                    active ? "bg-accent" : "hover:bg-accent/60"
                  } disabled:opacity-60`}
                >
                  <span>{team.name}</span>
                  {assigned ? (
                    <Badge variant="secondary">Assigned</Badge>
                  ) : null}
                </button>
              );
            })
          )}
        </div>

        {error ? (
          <Alert variant="destructive">
            <AlertTitle>{error}</AlertTitle>
          </Alert>
        ) : null}

        <DialogFooter className="sm:justify-between">
          <Button
            type="button"
            variant="outline"
            onClick={() => onOpenChange(false)}
          >
            Cancel
          </Button>
          <Button
            type="button"
            disabled={!selected || pending}
            onClick={() => selected && onAssign(selected)}
          >
            {pending ? "Assigning…" : "Assign team"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export function EventTeamsTab() {
  const { event, access, abilities } = useEventWorkspace();
  const keys = eventKeys(access);
  const mutations = useEventsMutations(access);
  const [assigning, setAssigning] = useState(false);
  const [assignError, setAssignError] = useState<string | null>(null);
  const [removing, setRemoving] = useState<EventTeam | null>(null);
  const [removeError, setRemoveError] = useState<string | null>(null);

  const teams = useQuery({
    queryKey: keys.eventTeams(event.id),
    queryFn: ({ signal }) => listEventTeams(event.id, signal),
  });

  const assignedIds = new Set((teams.data ?? []).map((team) => team.id));

  async function assign(teamId: string) {
    setAssignError(null);
    const outcome = await mutations.assignTeam.mutateAsync({
      id: event.id,
      teamId,
    });
    if (outcome.status === "success") {
      setAssigning(false);
      return;
    }
    setAssignError(
      outcome.status === "unexpected"
        ? "The team could not be assigned. Try again."
        : "That team cannot be assigned to this event.",
    );
  }

  async function remove() {
    if (!removing) return;
    setRemoveError(null);
    const outcome = await mutations.removeTeam.mutateAsync({
      id: event.id,
      teamId: removing.id,
    });
    if (outcome.status === "success") {
      setRemoving(null);
      return;
    }
    setRemoveError("The team could not be removed. Try again.");
  }

  return (
    <section className={CARD} aria-labelledby="event-teams-heading">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h3 id="event-teams-heading" className="text-lg font-semibold">
            Teams
          </h3>
          <p className="text-muted-foreground mt-1 text-sm">
            Teams work on this event. Team details are managed on the Teams
            page.
          </p>
        </div>
        {abilities.canAssignTeams ? (
          <Button type="button" onClick={() => setAssigning(true)}>
            <Plus className="size-4" aria-hidden />
            Assign team
          </Button>
        ) : null}
      </div>

      <div className="mt-6">
        {teams.isPending ? (
          <p className="text-muted-foreground text-sm">Loading teams…</p>
        ) : teams.isError ? (
          <Alert variant="destructive">
            <AlertTitle>Teams could not be loaded. Try again.</AlertTitle>
          </Alert>
        ) : teams.data.length === 0 ? (
          <div className="border-border flex flex-col items-center gap-2 rounded-xl border border-dashed p-8 text-center">
            <Users className="text-muted-foreground size-6" aria-hidden />
            <p className="font-medium">No teams yet</p>
            <p className="text-muted-foreground text-sm">
              {abilities.canAssignTeams
                ? "Assign an existing team to start working on this event."
                : "No team has been assigned to this event yet."}
            </p>
          </div>
        ) : (
          <div className="grid gap-4">
            {teams.data.map((team) => (
              <TeamCard
                key={team.id}
                team={team}
                canRemove={abilities.canAssignTeams}
                onRemove={(target) => {
                  setRemoveError(null);
                  setRemoving(target);
                }}
              />
            ))}
          </div>
        )}
      </div>

      <AssignTeamDialog
        open={assigning}
        onOpenChange={(open) => {
          setAssigning(open);
          if (!open) setAssignError(null);
        }}
        assignedIds={assignedIds}
        onAssign={assign}
        pending={mutations.assignTeam.isPending}
        error={assignError}
      />

      <Dialog
        open={removing !== null}
        onOpenChange={(open) => !open && setRemoving(null)}
      >
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Remove {removing?.name} from this event?</DialogTitle>
            <DialogDescription>
              The team and its members stay on the Teams page. Only this
              event&apos;s link to the team is removed.
            </DialogDescription>
          </DialogHeader>
          {removeError ? (
            <Alert variant="destructive">
              <AlertTitle>{removeError}</AlertTitle>
            </Alert>
          ) : null}
          <DialogFooter className="sm:justify-between">
            <Button
              type="button"
              variant="outline"
              onClick={() => setRemoving(null)}
            >
              Keep team
            </Button>
            <Button
              type="button"
              variant="destructive"
              disabled={mutations.removeTeam.isPending}
              onClick={remove}
            >
              {mutations.removeTeam.isPending
                ? "Removing…"
                : "Remove from event"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </section>
  );
}
