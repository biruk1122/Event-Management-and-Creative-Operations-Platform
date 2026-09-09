"use client";

import { useEffect, useId, useRef, useState } from "react";
import { LoaderCircle, TriangleAlert, X } from "lucide-react";

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
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

import { getWorkspace as defaultGetWorkspace } from "../api/get-workspace";
import type {
  AddWorkspaceParticipant,
  AssignWorkspaceManager,
  AssignWorkspaceTeam,
  DeleteWorkspace,
  GetWorkspace,
  RemoveWorkspaceParticipant,
  RemoveWorkspaceTeam,
} from "../lib/workspaces-outcome";
import {
  personName,
  WORKSPACE_KIND_LABELS,
  type AssignableTeam,
  type AssignableUser,
  type Workspace,
} from "../lib/workspaces-types";

const NO_MANAGER = "NONE";
const PICK_TEAM = "PICK_TEAM";
const PICK_PERSON = "PICK_PERSON";

const ACTION_ERRORS: Record<string, string> = {
  manager_not_found: "That user no longer exists.",
  user_not_found: "That user no longer exists.",
  team_not_found: "That team no longer exists.",
  not_assigned: "That team is not assigned to this workspace.",
  not_a_participant: "That user is not a participant in this workspace.",
  not_found:
    "This workspace no longer exists. Close this and refresh the list.",
  permission_denied: "You do not have permission to do that.",
  unexpected: "We could not save that change. Try again.",
};

interface WorkspaceDetailDialogProps {
  workspaceId: string | null;
  onOpenChange: (open: boolean) => void;
  users: readonly AssignableUser[];
  teams: readonly AssignableTeam[];
  getWorkspace?: GetWorkspace;
  onAssignManager: AssignWorkspaceManager;
  onAssignTeam: AssignWorkspaceTeam;
  onRemoveTeam: RemoveWorkspaceTeam;
  onAddParticipant: AddWorkspaceParticipant;
  onRemoveParticipant: RemoveWorkspaceParticipant;
  onDelete: DeleteWorkspace;
  onChanged: (workspace: Workspace) => void;
  onDeleted: (id: string) => void;
}

export function WorkspaceDetailDialog({
  workspaceId,
  onOpenChange,
  ...bodyProps
}: WorkspaceDetailDialogProps) {
  return (
    <Dialog
      open={workspaceId !== null}
      onOpenChange={(open) => {
        if (!open) {
          onOpenChange(false);
        }
      }}
    >
      <DialogContent className="sm:max-w-2xl">
        {workspaceId !== null ? (
          <WorkspaceDetailBody
            key={workspaceId}
            workspaceId={workspaceId}
            {...bodyProps}
          />
        ) : null}
      </DialogContent>
    </Dialog>
  );
}

type BodyProps = Omit<
  WorkspaceDetailDialogProps,
  "workspaceId" | "onOpenChange"
> & { workspaceId: string };

function WorkspaceDetailBody({
  workspaceId,
  users,
  teams,
  getWorkspace = defaultGetWorkspace,
  onAssignManager,
  onAssignTeam,
  onRemoveTeam,
  onAddParticipant,
  onRemoveParticipant,
  onDelete,
  onChanged,
  onDeleted,
}: BodyProps) {
  const ids = {
    manager: useId(),
    team: useId(),
    participant: useId(),
  };

  const [status, setStatus] = useState<"loading" | "loaded" | "error">(
    "loading",
  );
  const [workspace, setWorkspace] = useState<Workspace | null>(null);
  const [managerError, setManagerError] = useState<string | null>(null);
  const [managerBusy, setManagerBusy] = useState(false);
  const [teamError, setTeamError] = useState<string | null>(null);
  const [teamBusy, setTeamBusy] = useState(false);
  const [participantError, setParticipantError] = useState<string | null>(null);
  const [participantBusy, setParticipantBusy] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const [deleteBusy, setDeleteBusy] = useState(false);
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const [announcement, setAnnouncement] = useState("");

  const confirmRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    let cancelled = false;
    void getWorkspace(workspaceId)
      .then((loaded) => {
        if (cancelled) return;
        if (loaded) {
          setWorkspace(loaded);
          setStatus("loaded");
        } else {
          setStatus("error");
        }
      })
      .catch(() => {
        if (!cancelled) setStatus("error");
      });
    return () => {
      cancelled = true;
    };
  }, [workspaceId, getWorkspace]);

  useEffect(() => {
    if (confirmingDelete) {
      confirmRef.current?.focus();
    }
  }, [confirmingDelete]);

  function apply(next: Workspace) {
    setWorkspace(next);
    onChanged(next);
  }

  function actionError(key: string): string {
    return ACTION_ERRORS[key] ?? ACTION_ERRORS.unexpected!;
  }

  async function handleManagerChange(value: string) {
    if (!workspace) return;
    const managerId = value === NO_MANAGER ? null : value;
    setManagerBusy(true);
    setManagerError(null);
    const outcome = await onAssignManager(workspace.id, managerId);
    setManagerBusy(false);
    if (outcome.status === "success") {
      apply(outcome.workspace);
      setAnnouncement(managerId ? "Manager assigned." : "Manager removed.");
      return;
    }
    setManagerError(actionError(outcome.status));
  }

  async function handleAddTeam(value: string) {
    if (!workspace || value === PICK_TEAM) return;
    setTeamBusy(true);
    setTeamError(null);
    const outcome = await onAssignTeam(workspace.id, value);
    setTeamBusy(false);
    if (outcome.status === "success") {
      apply(outcome.workspace);
      setAnnouncement("Team assigned.");
      return;
    }
    setTeamError(actionError(outcome.status));
  }

  async function handleRemoveTeam(teamId: string) {
    if (!workspace) return;
    setTeamBusy(true);
    setTeamError(null);
    const outcome = await onRemoveTeam(workspace.id, teamId);
    setTeamBusy(false);
    if (outcome.status === "success") {
      apply(outcome.workspace);
      setAnnouncement("Team unassigned.");
      return;
    }
    setTeamError(actionError(outcome.status));
  }

  async function handleAddParticipant(value: string) {
    if (!workspace || value === PICK_PERSON) return;
    setParticipantBusy(true);
    setParticipantError(null);
    const outcome = await onAddParticipant(workspace.id, value);
    setParticipantBusy(false);
    if (outcome.status === "success") {
      apply(outcome.workspace);
      setAnnouncement("Participant added.");
      return;
    }
    setParticipantError(actionError(outcome.status));
  }

  async function handleRemoveParticipant(userId: string) {
    if (!workspace) return;
    setParticipantBusy(true);
    setParticipantError(null);
    const outcome = await onRemoveParticipant(workspace.id, userId);
    setParticipantBusy(false);
    if (outcome.status === "success") {
      apply(outcome.workspace);
      setAnnouncement("Participant removed.");
      return;
    }
    setParticipantError(actionError(outcome.status));
  }

  async function runDelete() {
    if (!workspace) return;
    setDeleteBusy(true);
    setDeleteError(null);
    const outcome = await onDelete(workspace.id);
    setDeleteBusy(false);
    if (outcome.status === "success") {
      onDeleted(workspace.id);
      return;
    }
    setConfirmingDelete(false);
    setDeleteError(actionError(outcome.status));
  }

  if (status === "loading") {
    return (
      <div
        role="status"
        aria-live="polite"
        className="flex items-center justify-center gap-2 py-10 text-sm"
      >
        <LoaderCircle aria-hidden="true" className="size-4 animate-spin" />
        Loading workspace…
      </div>
    );
  }

  if (status === "error" || !workspace) {
    return (
      <Alert variant="destructive">
        <TriangleAlert aria-hidden="true" />
        <AlertTitle>We could not load this workspace</AlertTitle>
        <AlertDescription>Try again in a moment.</AlertDescription>
      </Alert>
    );
  }

  const assignedTeamIds = new Set(workspace.teams.map((team) => team.id));
  const participantIds = new Set(
    workspace.participants.map((person) => person.id),
  );
  const addableTeams = teams.filter((team) => !assignedTeamIds.has(team.id));
  const addablePeople = users.filter((user) => !participantIds.has(user.id));

  return (
    <>
      <DialogHeader>
        <div className="flex flex-wrap items-center gap-2">
          <DialogTitle>
            {WORKSPACE_KIND_LABELS[workspace.kind]} workspace
          </DialogTitle>
          <Badge variant="secondary">
            {WORKSPACE_KIND_LABELS[workspace.kind]}
          </Badge>
        </div>
        <DialogDescription>
          {workspace.teams.length} team
          {workspace.teams.length === 1 ? "" : "s"} ·{" "}
          {workspace.participants.length} participant
          {workspace.participants.length === 1 ? "" : "s"}
        </DialogDescription>
      </DialogHeader>

      <div className="space-y-2">
        <Label htmlFor={ids.manager}>Manager</Label>
        <Select
          value={workspace.manager?.id ?? NO_MANAGER}
          onValueChange={(value) => void handleManagerChange(value)}
          disabled={managerBusy}
        >
          <SelectTrigger id={ids.manager} aria-busy={managerBusy}>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={NO_MANAGER}>No manager</SelectItem>
            {users.map((user) => (
              <SelectItem key={user.id} value={user.id}>
                {personName(user)}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        {managerError ? (
          <p className="text-destructive text-sm" role="alert">
            {managerError}
          </p>
        ) : null}
      </div>

      <section
        aria-labelledby={`${ids.team}-heading`}
        className="border-border space-y-2 border-t pt-4"
      >
        <p id={`${ids.team}-heading`} className="text-sm font-medium">
          Teams
        </p>
        {workspace.teams.length === 0 ? (
          <p className="text-muted-foreground text-sm">No teams assigned.</p>
        ) : (
          <ul className="space-y-1">
            {workspace.teams.map((team) => (
              <li
                key={team.id}
                className="flex items-center justify-between gap-2 text-sm"
              >
                <span>{team.name}</span>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  disabled={teamBusy}
                  aria-label={`Unassign ${team.name}`}
                  onClick={() => void handleRemoveTeam(team.id)}
                >
                  <X aria-hidden="true" className="size-4" />
                </Button>
              </li>
            ))}
          </ul>
        )}
        {addableTeams.length > 0 ? (
          <div className="space-y-1">
            <Label htmlFor={ids.team}>Assign a team</Label>
            <Select
              value={PICK_TEAM}
              onValueChange={(value) => void handleAddTeam(value)}
              disabled={teamBusy}
            >
              <SelectTrigger id={ids.team} aria-busy={teamBusy}>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={PICK_TEAM}>Choose a team…</SelectItem>
                {addableTeams.map((team) => (
                  <SelectItem key={team.id} value={team.id}>
                    {team.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        ) : null}
        {teamError ? (
          <p className="text-destructive text-sm" role="alert">
            {teamError}
          </p>
        ) : null}
      </section>

      <section
        aria-labelledby={`${ids.participant}-heading`}
        className="border-border space-y-2 border-t pt-4"
      >
        <p id={`${ids.participant}-heading`} className="text-sm font-medium">
          Participants
        </p>
        {workspace.participants.length === 0 ? (
          <p className="text-muted-foreground text-sm">
            No individual participants.
          </p>
        ) : (
          <ul className="space-y-1">
            {workspace.participants.map((person) => (
              <li
                key={person.id}
                className="flex items-center justify-between gap-2 text-sm"
              >
                <span>{personName(person)}</span>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  disabled={participantBusy}
                  aria-label={`Remove ${personName(person)}`}
                  onClick={() => void handleRemoveParticipant(person.id)}
                >
                  <X aria-hidden="true" className="size-4" />
                </Button>
              </li>
            ))}
          </ul>
        )}
        {addablePeople.length > 0 ? (
          <div className="space-y-1">
            <Label htmlFor={ids.participant}>Add a participant</Label>
            <Select
              value={PICK_PERSON}
              onValueChange={(value) => void handleAddParticipant(value)}
              disabled={participantBusy}
            >
              <SelectTrigger id={ids.participant} aria-busy={participantBusy}>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={PICK_PERSON}>Choose a person…</SelectItem>
                {addablePeople.map((user) => (
                  <SelectItem key={user.id} value={user.id}>
                    {personName(user)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        ) : null}
        {participantError ? (
          <p className="text-destructive text-sm" role="alert">
            {participantError}
          </p>
        ) : null}
      </section>

      <div className="border-border space-y-2 border-t pt-4">
        {confirmingDelete ? (
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-sm">Permanently delete this workspace?</span>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              disabled={deleteBusy}
              onClick={() => setConfirmingDelete(false)}
            >
              Cancel
            </Button>
            <Button
              ref={confirmRef}
              type="button"
              variant="destructive"
              size="sm"
              disabled={deleteBusy}
              aria-busy={deleteBusy}
              onClick={() => void runDelete()}
            >
              {deleteBusy ? "Working…" : "Confirm delete"}
            </Button>
          </div>
        ) : (
          <Button
            type="button"
            variant="destructive"
            size="sm"
            onClick={() => setConfirmingDelete(true)}
          >
            Delete workspace
          </Button>
        )}
        {deleteError ? (
          <Alert variant="destructive" aria-live="assertive">
            <AlertTitle>{deleteError}</AlertTitle>
          </Alert>
        ) : null}
      </div>

      <p role="status" aria-live="polite" className="sr-only">
        {announcement}
      </p>
    </>
  );
}
