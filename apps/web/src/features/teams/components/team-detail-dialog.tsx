"use client";

import { useEffect, useId, useRef, useState, type FormEvent } from "react";
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
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

import { getTeam as defaultGetTeam } from "../api/get-team";
import type {
  AddTeamMember,
  AssignManager,
  DeactivateTeam,
  DeleteTeam,
  GetTeam,
  ReactivateTeam,
  RemoveTeamMember,
  TeamProfileValues,
  UpdateTeam,
} from "../lib/teams-outcome";
import {
  activityOf,
  personName,
  TEAM_ACTIVITY_LABELS,
  type AssignableUser,
  type Team,
} from "../lib/teams-types";

const NO_MANAGER = "NONE";
const ADD_MEMBER_NONE = "";

const ACTION_ERRORS: Record<string, string> = {
  name_conflict: "That department already has a team with this name.",
  manager_not_found: "That user no longer exists.",
  user_not_found: "That user no longer exists.",
  not_a_member: "That user is not on this team.",
  already_inactive: "This team is already deactivated.",
  already_active: "This team is already active.",
  in_use: "This team still has members and cannot be removed.",
  not_found: "This team no longer exists. Close this and refresh the list.",
  permission_denied: "You do not have permission to do that.",
  unexpected: "We could not save that change. Try again.",
};

interface TeamDetailDialogProps {
  teamId: string | null;
  onOpenChange: (open: boolean) => void;
  managers: readonly AssignableUser[];
  getTeam?: GetTeam;
  onUpdate: UpdateTeam;
  onAssignManager: AssignManager;
  onAddMember: AddTeamMember;
  onRemoveMember: RemoveTeamMember;
  onDeactivate: DeactivateTeam;
  onReactivate: ReactivateTeam;
  onDelete: DeleteTeam;
  onChanged: (team: Team) => void;
  onDeleted: (id: string) => void;
}

export function TeamDetailDialog({
  teamId,
  onOpenChange,
  ...bodyProps
}: TeamDetailDialogProps) {
  return (
    <Dialog
      open={teamId !== null}
      onOpenChange={(open) => {
        if (!open) {
          onOpenChange(false);
        }
      }}
    >
      <DialogContent className="sm:max-w-2xl">
        {teamId !== null ? (
          <TeamDetailBody key={teamId} teamId={teamId} {...bodyProps} />
        ) : null}
      </DialogContent>
    </Dialog>
  );
}

interface TeamDetailBodyProps {
  teamId: string;
  managers: readonly AssignableUser[];
  getTeam?: GetTeam;
  onUpdate: UpdateTeam;
  onAssignManager: AssignManager;
  onAddMember: AddTeamMember;
  onRemoveMember: RemoveTeamMember;
  onDeactivate: DeactivateTeam;
  onReactivate: ReactivateTeam;
  onDelete: DeleteTeam;
  onChanged: (team: Team) => void;
  onDeleted: (id: string) => void;
}

function TeamDetailBody({
  teamId,
  managers,
  getTeam = defaultGetTeam,
  onUpdate,
  onAssignManager,
  onAddMember,
  onRemoveMember,
  onDeactivate,
  onReactivate,
  onDelete,
  onChanged,
  onDeleted,
}: TeamDetailBodyProps) {
  const ids = {
    name: useId(),
    description: useId(),
    manager: useId(),
    addMember: useId(),
  };

  const [status, setStatus] = useState<"loading" | "loaded" | "error">(
    "loading",
  );
  const [team, setTeam] = useState<Team | null>(null);
  const [form, setForm] = useState<TeamProfileValues | null>(null);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [managerError, setManagerError] = useState<string | null>(null);
  const [managerBusy, setManagerBusy] = useState(false);
  const [memberError, setMemberError] = useState<string | null>(null);
  const [memberBusy, setMemberBusy] = useState<string | null>(null);
  const [addValue, setAddValue] = useState<string>(ADD_MEMBER_NONE);
  const [statusError, setStatusError] = useState<string | null>(null);
  const [statusBusy, setStatusBusy] = useState(false);
  const [confirming, setConfirming] = useState<"deactivate" | "delete" | null>(
    null,
  );
  const [announcement, setAnnouncement] = useState("");

  const confirmRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    let cancelled = false;
    void getTeam(teamId)
      .then((loaded) => {
        if (cancelled) {
          return;
        }
        if (loaded) {
          setTeam(loaded);
          setForm(profileOf(loaded));
          setStatus("loaded");
        } else {
          setStatus("error");
        }
      })
      .catch(() => {
        if (!cancelled) {
          setStatus("error");
        }
      });
    return () => {
      cancelled = true;
    };
  }, [teamId, getTeam]);

  useEffect(() => {
    if (confirming) {
      confirmRef.current?.focus();
    }
  }, [confirming]);

  function applyTeam(next: Team) {
    setTeam(next);
    setForm(profileOf(next));
    onChanged(next);
  }

  async function handleSave(event: FormEvent) {
    event.preventDefault();
    if (!team || !form) {
      return;
    }
    setSaving(true);
    setSaveError(null);

    const changed = changedFields(profileOf(team), form);
    const outcome = await onUpdate(team.id, changed);

    setSaving(false);
    if (outcome.status === "success") {
      applyTeam(outcome.team);
      setAnnouncement("Team saved.");
      return;
    }
    if (outcome.status === "field_errors") {
      setSaveError(
        Object.values(outcome.fieldErrors)[0] ?? "Check the details.",
      );
      return;
    }
    setSaveError(ACTION_ERRORS[outcome.status] ?? ACTION_ERRORS.unexpected!);
  }

  async function handleManagerChange(value: string) {
    if (!team) {
      return;
    }
    const managerId = value === NO_MANAGER ? null : value;
    setManagerBusy(true);
    setManagerError(null);
    const outcome = await onAssignManager(team.id, managerId);
    setManagerBusy(false);

    if (outcome.status === "success") {
      applyTeam(outcome.team);
      setAnnouncement(managerId ? "Manager assigned." : "Manager removed.");
      return;
    }
    setManagerError(ACTION_ERRORS[outcome.status] ?? ACTION_ERRORS.unexpected!);
  }

  async function handleAddMember(value: string) {
    if (!team || value === ADD_MEMBER_NONE) {
      return;
    }
    setAddValue(value);
    setMemberBusy(value);
    setMemberError(null);
    const outcome = await onAddMember(team.id, value);
    setMemberBusy(null);
    setAddValue(ADD_MEMBER_NONE);

    if (outcome.status === "success") {
      applyTeam(outcome.team);
      setAnnouncement("Member added.");
      return;
    }
    setMemberError(ACTION_ERRORS[outcome.status] ?? ACTION_ERRORS.unexpected!);
  }

  async function handleRemoveMember(userId: string) {
    if (!team) {
      return;
    }
    setMemberBusy(userId);
    setMemberError(null);
    const outcome = await onRemoveMember(team.id, userId);
    setMemberBusy(null);

    if (outcome.status === "success") {
      applyTeam(outcome.team);
      setAnnouncement("Member removed.");
      return;
    }
    setMemberError(ACTION_ERRORS[outcome.status] ?? ACTION_ERRORS.unexpected!);
  }

  async function runStatusChange(next: "deactivate" | "reactivate") {
    if (!team) {
      return;
    }
    setStatusBusy(true);
    setStatusError(null);
    const outcome =
      next === "deactivate"
        ? await onDeactivate(team.id)
        : await onReactivate(team.id);
    setStatusBusy(false);
    setConfirming(null);

    if (outcome.status === "success") {
      applyTeam(outcome.team);
      setAnnouncement(
        next === "deactivate" ? "Team deactivated." : "Team reactivated.",
      );
      return;
    }
    setStatusError(ACTION_ERRORS[outcome.status] ?? ACTION_ERRORS.unexpected!);
  }

  async function runDelete() {
    if (!team) {
      return;
    }
    setStatusBusy(true);
    setStatusError(null);
    const outcome = await onDelete(team.id);
    setStatusBusy(false);

    if (outcome.status === "success") {
      onDeleted(team.id);
      return;
    }
    setConfirming(null);
    setStatusError(ACTION_ERRORS[outcome.status] ?? ACTION_ERRORS.unexpected!);
  }

  if (status === "loading") {
    return (
      <div
        role="status"
        aria-live="polite"
        className="flex items-center justify-center gap-2 py-10 text-sm"
      >
        <LoaderCircle aria-hidden="true" className="size-4 animate-spin" />
        Loading team…
      </div>
    );
  }

  if (status === "error" || !team || !form) {
    return (
      <Alert variant="destructive">
        <TriangleAlert aria-hidden="true" />
        <AlertTitle>We could not load this team</AlertTitle>
        <AlertDescription>Try again in a moment.</AlertDescription>
      </Alert>
    );
  }

  const activity = activityOf(team);
  const dirty = changedKeys(profileOf(team), form).length > 0;
  const memberIds = new Set(team.members.map((member) => member.id));
  const addable = managers.filter((manager) => !memberIds.has(manager.id));

  return (
    <>
      <DialogHeader>
        <div className="flex flex-wrap items-center gap-2">
          <DialogTitle>{team.name}</DialogTitle>
          <Badge variant={activity === "ACTIVE" ? "default" : "secondary"}>
            {TEAM_ACTIVITY_LABELS[activity]}
          </Badge>
        </div>
        <DialogDescription>
          {team.department.name} · {team.members.length} member
          {team.members.length === 1 ? "" : "s"}
          {activity === "INACTIVE" && team.deactivatedAt
            ? ` · deactivated ${new Date(team.deactivatedAt).toLocaleDateString()}`
            : null}
        </DialogDescription>
      </DialogHeader>

      <form onSubmit={(event) => void handleSave(event)} className="space-y-4">
        {saveError ? (
          <Alert variant="destructive" aria-live="assertive">
            <AlertTitle>{saveError}</AlertTitle>
          </Alert>
        ) : null}

        <div className="space-y-2">
          <Label htmlFor={ids.name}>Name</Label>
          <Input
            id={ids.name}
            required
            maxLength={120}
            value={form.name}
            onChange={(event) => setForm({ ...form, name: event.target.value })}
          />
        </div>

        <div className="space-y-2">
          <Label htmlFor={ids.description}>Description</Label>
          <Input
            id={ids.description}
            maxLength={1000}
            value={form.description}
            onChange={(event) =>
              setForm({ ...form, description: event.target.value })
            }
          />
        </div>

        <div className="space-y-1">
          <p className="text-sm font-medium">Department</p>
          <p className="text-muted-foreground text-sm">
            {team.department.name}
            <span className="block text-xs">
              A team&rsquo;s department is fixed once the team exists.
            </span>
          </p>
        </div>

        <Button
          type="submit"
          size="sm"
          disabled={!dirty || saving}
          aria-busy={saving}
        >
          {saving ? "Saving…" : "Save changes"}
        </Button>
      </form>

      <div className="border-border space-y-3 border-t pt-4">
        <div className="space-y-2">
          <Label htmlFor={ids.manager}>Manager</Label>
          <Select
            value={team.manager?.id ?? NO_MANAGER}
            onValueChange={(value) => void handleManagerChange(value)}
            disabled={managerBusy}
          >
            <SelectTrigger id={ids.manager} aria-busy={managerBusy}>
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
          {managerError ? (
            <p className="text-destructive text-sm" role="alert">
              {managerError}
            </p>
          ) : null}
        </div>
      </div>

      <div className="border-border space-y-3 border-t pt-4">
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-medium">Members</h3>
          <span className="text-muted-foreground text-xs tabular-nums">
            {team.members.length}
          </span>
        </div>

        {team.members.length === 0 ? (
          <p className="text-muted-foreground text-sm">
            No members yet. Add one below.
          </p>
        ) : (
          <ul aria-label="Team members" className="space-y-2">
            {team.members.map((member) => (
              <li
                key={member.id}
                className="border-border flex items-center justify-between gap-3 rounded-lg border px-3 py-2"
              >
                <span className="min-w-0">
                  <span className="block truncate text-sm font-medium">
                    {personName(member)}
                  </span>
                  <span className="text-muted-foreground block truncate text-xs">
                    {member.email}
                  </span>
                </span>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  disabled={memberBusy !== null}
                  aria-busy={memberBusy === member.id}
                  aria-label={`Remove ${personName(member)}`}
                  onClick={() => void handleRemoveMember(member.id)}
                >
                  <X aria-hidden="true" className="size-4" />
                  Remove
                </Button>
              </li>
            ))}
          </ul>
        )}

        <div className="space-y-2">
          <Label htmlFor={ids.addMember}>Add member</Label>
          <Select
            value={addValue}
            onValueChange={(value) => void handleAddMember(value)}
            disabled={memberBusy !== null || addable.length === 0}
          >
            <SelectTrigger id={ids.addMember} aria-busy={memberBusy !== null}>
              <SelectValue
                placeholder={
                  addable.length === 0
                    ? "Everyone available is already a member"
                    : "Choose a user to add"
                }
              />
            </SelectTrigger>
            <SelectContent>
              {addable.map((user) => (
                <SelectItem key={user.id} value={user.id}>
                  {personName(user)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          {memberError ? (
            <p className="text-destructive text-sm" role="alert">
              {memberError}
            </p>
          ) : null}
        </div>
      </div>

      <div className="border-border space-y-3 border-t pt-4">
        <div className="flex flex-wrap items-center gap-2">
          {activity === "ACTIVE" ? (
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => setConfirming("deactivate")}
            >
              Deactivate team
            </Button>
          ) : (
            <Button
              type="button"
              size="sm"
              disabled={statusBusy}
              aria-busy={statusBusy}
              onClick={() => void runStatusChange("reactivate")}
            >
              {statusBusy ? "Reactivating…" : "Reactivate team"}
            </Button>
          )}

          {confirming === null ? (
            <Button
              type="button"
              variant="destructive"
              size="sm"
              onClick={() => setConfirming("delete")}
            >
              Delete team
            </Button>
          ) : null}
        </div>

        {confirming !== null ? (
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-sm">
              {confirming === "deactivate"
                ? "Deactivate this team?"
                : "Permanently delete this team?"}
            </span>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              disabled={statusBusy}
              onClick={() => setConfirming(null)}
            >
              Cancel
            </Button>
            <Button
              ref={confirmRef}
              type="button"
              variant="destructive"
              size="sm"
              disabled={statusBusy}
              aria-busy={statusBusy}
              onClick={() =>
                confirming === "deactivate"
                  ? void runStatusChange("deactivate")
                  : void runDelete()
              }
            >
              {statusBusy
                ? "Working…"
                : confirming === "deactivate"
                  ? "Confirm deactivate"
                  : "Confirm delete"}
            </Button>
          </div>
        ) : null}

        {statusError ? (
          <Alert variant="destructive" aria-live="assertive">
            <AlertTitle>{statusError}</AlertTitle>
          </Alert>
        ) : null}
      </div>

      <p role="status" aria-live="polite" className="sr-only">
        {announcement}
      </p>
    </>
  );
}

function profileOf(team: Team): TeamProfileValues {
  return {
    name: team.name,
    description: team.description ?? "",
  };
}

function changedKeys(
  before: TeamProfileValues,
  after: TeamProfileValues,
): (keyof TeamProfileValues)[] {
  return (Object.keys(after) as (keyof TeamProfileValues)[]).filter(
    (key) => before[key] !== after[key],
  );
}

function changedFields(
  before: TeamProfileValues,
  after: TeamProfileValues,
): Partial<TeamProfileValues> {
  const changed: Partial<TeamProfileValues> = {};
  for (const key of changedKeys(before, after)) {
    changed[key] = after[key];
  }
  return changed;
}
