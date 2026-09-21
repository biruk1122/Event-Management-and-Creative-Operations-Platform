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
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

import {
  getCampaign as defaultGetCampaign,
  getCampaignBudget as defaultGetCampaignBudget,
} from "../api/campaigns-gateway";
import { CampaignActivities } from "./campaign-activities";
import { CampaignFields } from "./campaign-fields";
import { CampaignStatusBadge } from "./status-badges";
import type { CampaignAbilities } from "../lib/campaign-access";
import {
  fieldsFromCampaign,
  toFormValues,
  validateFields,
  type CampaignFieldErrors,
  type CampaignFieldValues,
} from "../lib/campaigns-form";
import type {
  AssignCampaignManager,
  AssignCampaignTeam,
  CreateCampaignActivity,
  DeleteCampaign,
  DeleteCampaignActivity,
  GetCampaign,
  GetCampaignBudget,
  ListCampaignActivities,
  RemoveCampaignTeam,
  SetCampaignBudget,
  TransitionCampaign,
  UpdateCampaign,
  UpdateCampaignActivity,
} from "../lib/campaigns-outcome";
import {
  budgetSummary,
  campaignStatusLabel,
  campaignTypeLabel,
  NEXT_STATUSES,
  personName,
  scheduleSummary,
  subjectSummary,
  type AssignableEvent,
  type AssignableTeam,
  type AssignableUser,
  type Campaign,
  type CampaignBudget,
  type CampaignProgress,
} from "../lib/campaigns-types";

const NO_MANAGER = "NONE";
const PICK_TEAM = "PICK_TEAM";
const PICK_STATUS = "PICK_STATUS";

const ACTION_ERRORS: Record<string, string> = {
  manager_not_found: "That user no longer exists.",
  team_not_found: "That team no longer exists.",
  event_not_found: "That event no longer exists.",
  not_assigned: "That team is not assigned to this campaign.",
  invalid_transition: "That move is not allowed from the current status.",
  subject_conflict: "Choose either an event or a product, not both.",
  schedule_invalid: "The end must be on or after the start.",
  budget_incomplete: "Enter an amount and a currency, or clear both.",
  has_managed_files:
    "This campaign has attached files. Remove them before deleting the campaign.",
  not_found: "This campaign no longer exists. Close this and refresh the list.",
  permission_denied: "You do not have permission to do that.",
  unexpected: "We could not save that change. Try again.",
};

function actionError(key: string): string {
  return ACTION_ERRORS[key] ?? ACTION_ERRORS.unexpected!;
}

interface CampaignDetailDialogProps {
  campaignId: string | null;
  onOpenChange: (open: boolean) => void;
  users: readonly AssignableUser[];
  teams: readonly AssignableTeam[];
  events: readonly AssignableEvent[];
  /** What the caller may do; controls are hidden or read-only without the matching grant. */
  abilities: CampaignAbilities;
  getCampaign?: GetCampaign;
  getBudget?: GetCampaignBudget;
  listActivities: ListCampaignActivities;
  onCreateActivity: CreateCampaignActivity;
  onUpdateActivity: UpdateCampaignActivity;
  onDeleteActivity: DeleteCampaignActivity;
  onUpdate: UpdateCampaign;
  onTransition: TransitionCampaign;
  onAssignManager: AssignCampaignManager;
  onAssignTeam: AssignCampaignTeam;
  onRemoveTeam: RemoveCampaignTeam;
  onSetBudget: SetCampaignBudget;
  onDelete: DeleteCampaign;
  onChanged: (campaign: Campaign) => void;
  onDeleted: (id: string) => void;
}

export function CampaignDetailDialog({
  campaignId,
  onOpenChange,
  ...bodyProps
}: CampaignDetailDialogProps) {
  return (
    <Dialog
      open={campaignId !== null}
      onOpenChange={(open) => {
        if (!open) onOpenChange(false);
      }}
    >
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-2xl">
        {campaignId !== null ? (
          <CampaignDetailBody
            key={campaignId}
            campaignId={campaignId}
            {...bodyProps}
          />
        ) : null}
      </DialogContent>
    </Dialog>
  );
}

type BodyProps = Omit<
  CampaignDetailDialogProps,
  "campaignId" | "onOpenChange"
> & {
  campaignId: string;
};

function CampaignDetailBody({
  campaignId,
  users,
  teams,
  events,
  abilities,
  getCampaign = defaultGetCampaign,
  getBudget = defaultGetCampaignBudget,
  listActivities,
  onCreateActivity,
  onUpdateActivity,
  onDeleteActivity,
  onUpdate,
  onTransition,
  onAssignManager,
  onAssignTeam,
  onRemoveTeam,
  onSetBudget,
  onDelete,
  onChanged,
  onDeleted,
}: BodyProps) {
  const ids = {
    manager: useId(),
    team: useId(),
    status: useId(),
    amount: useId(),
    currency: useId(),
  };

  const [status, setStatus] = useState<"loading" | "loaded" | "error">(
    "loading",
  );
  const [campaign, setCampaign] = useState<Campaign | null>(null);
  const [budget, setBudget] = useState<CampaignBudget | null>(null);
  const [budgetReadable, setBudgetReadable] = useState(abilities.canReadBudget);

  const [fields, setFields] = useState<CampaignFieldValues | null>(null);
  const [fieldErrors, setFieldErrors] = useState<CampaignFieldErrors>({});
  const [detailsError, setDetailsError] = useState<string | null>(null);
  const [detailsBusy, setDetailsBusy] = useState(false);

  const [statusError, setStatusError] = useState<string | null>(null);
  const [statusBusy, setStatusBusy] = useState(false);
  const [managerError, setManagerError] = useState<string | null>(null);
  const [managerBusy, setManagerBusy] = useState(false);
  const [teamError, setTeamError] = useState<string | null>(null);
  const [teamBusy, setTeamBusy] = useState(false);

  const [amount, setAmount] = useState("");
  const [currency, setCurrency] = useState("");
  const [budgetError, setBudgetError] = useState<string | null>(null);
  const [budgetBusy, setBudgetBusy] = useState(false);

  const [deleteError, setDeleteError] = useState<string | null>(null);
  const [deleteBusy, setDeleteBusy] = useState(false);
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const [announcement, setAnnouncement] = useState("");

  const confirmRef = useRef<HTMLButtonElement>(null);
  /** The latest campaign, so an async activity change never applies to a stale one. */
  const latestCampaign = useRef<Campaign | null>(null);

  useEffect(() => {
    latestCampaign.current = campaign;
  }, [campaign]);

  useEffect(() => {
    let cancelled = false;
    const budgetPromise = abilities.canReadBudget
      ? getBudget(campaignId)
      : Promise.resolve(null);
    void Promise.all([getCampaign(campaignId), budgetPromise])
      .then(([loaded, loadedBudget]) => {
        if (cancelled) return;
        if (!loaded) {
          setStatus("error");
          return;
        }
        setCampaign(loaded);
        setFields(fieldsFromCampaign(loaded));
        setBudget(loadedBudget);
        setBudgetReadable(abilities.canReadBudget && loadedBudget !== null);
        setAmount(loadedBudget?.amount ?? "");
        setCurrency(loadedBudget?.currency ?? "");
        setStatus("loaded");
      })
      .catch(() => {
        if (!cancelled) setStatus("error");
      });
    return () => {
      cancelled = true;
    };
  }, [campaignId, getCampaign, getBudget, abilities.canReadBudget]);

  useEffect(() => {
    if (confirmingDelete) confirmRef.current?.focus();
  }, [confirmingDelete]);

  function apply(next: Campaign) {
    setCampaign(next);
    setFields(fieldsFromCampaign(next));
    onChanged(next);
  }

  /**
   * Activity changes only move the derived progress. Keep any unsaved edits in
   * the details form rather than resetting it from the campaign.
   */
  function applyProgress(progress: CampaignProgress) {
    const current = latestCampaign.current;
    if (!current) return;
    const next = { ...current, progress };
    latestCampaign.current = next;
    setCampaign(next);
    onChanged(next);
  }

  function setField<K extends keyof CampaignFieldValues>(
    key: K,
    value: CampaignFieldValues[K],
  ) {
    setFields((current) => (current ? { ...current, [key]: value } : current));
  }

  async function saveDetails() {
    if (!campaign || !fields || !abilities.canUpdate) return;
    const localErrors = validateFields(fields);
    if (Object.keys(localErrors).length > 0) {
      setFieldErrors(localErrors);
      return;
    }

    setDetailsBusy(true);
    setDetailsError(null);
    setFieldErrors({});
    const outcome = await onUpdate(campaign.id, toFormValues(fields));
    setDetailsBusy(false);

    if (outcome.status === "success") {
      apply(outcome.campaign);
      setAnnouncement("Campaign details saved.");
      return;
    }
    if (outcome.status === "field_errors") {
      setFieldErrors(outcome.fieldErrors);
      return;
    }
    setDetailsError(actionError(outcome.status));
  }

  async function moveTo(next: string) {
    if (!campaign || next === PICK_STATUS) return;
    setStatusBusy(true);
    setStatusError(null);
    const outcome = await onTransition(campaign.id, next as Campaign["status"]);
    setStatusBusy(false);
    if (outcome.status === "success") {
      apply(outcome.campaign);
      setAnnouncement(
        `Status changed to ${campaignStatusLabel(outcome.campaign.status)}.`,
      );
      return;
    }
    setStatusError(actionError(outcome.status));
  }

  async function changeManager(value: string) {
    if (!campaign) return;
    const managerId = value === NO_MANAGER ? null : value;
    setManagerBusy(true);
    setManagerError(null);
    const outcome = await onAssignManager(campaign.id, managerId);
    setManagerBusy(false);
    if (outcome.status === "success") {
      apply(outcome.campaign);
      setAnnouncement(managerId ? "Manager assigned." : "Manager removed.");
      return;
    }
    setManagerError(actionError(outcome.status));
  }

  async function addTeam(value: string) {
    if (!campaign || value === PICK_TEAM) return;
    setTeamBusy(true);
    setTeamError(null);
    const outcome = await onAssignTeam(campaign.id, value);
    setTeamBusy(false);
    if (outcome.status === "success") {
      apply(outcome.campaign);
      setAnnouncement("Team assigned.");
      return;
    }
    setTeamError(actionError(outcome.status));
  }

  async function removeTeam(teamId: string) {
    if (!campaign) return;
    setTeamBusy(true);
    setTeamError(null);
    const outcome = await onRemoveTeam(campaign.id, teamId);
    setTeamBusy(false);
    if (outcome.status === "success") {
      apply(outcome.campaign);
      setAnnouncement("Team unassigned.");
      return;
    }
    setTeamError(actionError(outcome.status));
  }

  async function saveBudget(clear: boolean) {
    if (!campaign) return;
    const nextAmount = clear ? null : amount.trim();
    const nextCurrency = clear ? null : currency.trim().toUpperCase();

    if (!clear) {
      const errors: { amount?: string; currency?: string } = {};
      const parsed = Number(nextAmount);
      if (nextAmount === "" || Number.isNaN(parsed) || parsed < 0) {
        errors.amount = "Enter a non-negative amount.";
      }
      if (!/^[A-Z]{3}$/.test(nextCurrency ?? "")) {
        errors.currency = "Use a 3-letter code, e.g. USD.";
      }
      if (errors.amount || errors.currency) {
        setBudgetError(
          [errors.amount, errors.currency].filter(Boolean).join(" "),
        );
        return;
      }
    }

    setBudgetBusy(true);
    setBudgetError(null);
    const outcome = await onSetBudget(
      campaign.id,
      clear ? null : Number(nextAmount),
      clear ? null : (nextCurrency ?? null),
    );
    setBudgetBusy(false);

    if (outcome.status === "success") {
      setBudget(outcome.budget);
      setAmount(outcome.budget.amount ?? "");
      setCurrency(outcome.budget.currency ?? "");
      setAnnouncement(clear ? "Budget cleared." : "Budget saved.");
      return;
    }
    setBudgetError(actionError(outcome.status));
  }

  async function runDelete() {
    if (!campaign) return;
    setDeleteBusy(true);
    setDeleteError(null);
    const outcome = await onDelete(campaign.id);
    setDeleteBusy(false);
    if (outcome.status === "success") {
      onDeleted(campaign.id);
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
        Loading campaign…
      </div>
    );
  }

  if (status === "error" || !campaign || !fields) {
    return (
      <Alert variant="destructive">
        <TriangleAlert aria-hidden="true" />
        <AlertTitle>We could not load this campaign</AlertTitle>
        <AlertDescription>Try again in a moment.</AlertDescription>
      </Alert>
    );
  }

  const assignedTeamIds = new Set(campaign.teams.map((team) => team.id));
  const addableTeams = teams.filter((team) => !assignedTeamIds.has(team.id));
  const moves = NEXT_STATUSES[campaign.status];

  return (
    <>
      <DialogHeader>
        <div className="flex flex-wrap items-center gap-2">
          <DialogTitle>{campaign.name}</DialogTitle>
          <Badge variant="secondary">
            {campaignTypeLabel(campaign.campaignType)}
          </Badge>
          <CampaignStatusBadge status={campaign.status} />
        </div>
        <DialogDescription>
          {scheduleSummary(campaign)} · {subjectSummary(campaign, events)}
        </DialogDescription>
      </DialogHeader>

      {/* Details */}
      <form
        aria-label="Edit campaign details"
        className="space-y-4"
        noValidate
        onSubmit={(submitEvent) => {
          submitEvent.preventDefault();
          void saveDetails();
        }}
      >
        <CampaignFields
          values={fields}
          errors={fieldErrors}
          disabled={detailsBusy || !abilities.canUpdate}
          events={events}
          onChange={setField}
        />
        {detailsError ? (
          <p className="text-destructive text-sm" role="alert">
            {detailsError}
          </p>
        ) : null}
        {abilities.canUpdate ? (
          <Button
            type="submit"
            size="sm"
            disabled={detailsBusy}
            aria-busy={detailsBusy}
          >
            {detailsBusy ? "Saving…" : "Save details"}
          </Button>
        ) : (
          <p className="text-muted-foreground text-xs">
            You have read-only access to this campaign&rsquo;s details.
          </p>
        )}
      </form>

      {/* Lifecycle */}
      <section
        aria-labelledby={`${ids.status}-heading`}
        className="border-border space-y-2 border-t pt-4"
      >
        <p id={`${ids.status}-heading`} className="text-sm font-medium">
          Lifecycle
        </p>
        {!abilities.canTransition ? (
          <p className="text-muted-foreground text-sm">
            Current status: {campaignStatusLabel(campaign.status)}.
          </p>
        ) : moves.length === 0 ? (
          <p className="text-muted-foreground text-sm">
            {campaignStatusLabel(campaign.status)} is a final state.
          </p>
        ) : (
          <div className="space-y-1">
            <Label htmlFor={ids.status}>Move to</Label>
            <Select
              value={PICK_STATUS}
              disabled={statusBusy}
              onValueChange={(value) => void moveTo(value)}
            >
              <SelectTrigger id={ids.status} aria-busy={statusBusy}>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={PICK_STATUS}>Choose a status…</SelectItem>
                {moves.map((next) => (
                  <SelectItem key={next} value={next}>
                    {campaignStatusLabel(next)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        )}
        {statusError ? (
          <p className="text-destructive text-sm" role="alert">
            {statusError}
          </p>
        ) : null}
      </section>

      {/* Progress and activities */}
      <CampaignActivities
        campaignId={campaign.id}
        listActivities={listActivities}
        createActivity={onCreateActivity}
        updateActivity={onUpdateActivity}
        deleteActivity={onDeleteActivity}
        canManage={abilities.canManageActivities}
        onProgressChange={applyProgress}
      />

      {/* Connected workspace: manager, teams, participants */}
      <section
        aria-labelledby={`${ids.manager}-heading`}
        className="border-border space-y-3 border-t pt-4"
      >
        <p id={`${ids.manager}-heading`} className="text-sm font-medium">
          Connected workspace
        </p>

        <div className="space-y-1">
          <Label htmlFor={ids.manager}>Manager</Label>
          <Select
            value={campaign.manager?.id ?? NO_MANAGER}
            disabled={managerBusy || !abilities.canAssign}
            onValueChange={(value) => void changeManager(value)}
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

        <div className="space-y-1">
          <p className="text-sm font-medium">Teams</p>
          {campaign.teams.length === 0 ? (
            <p className="text-muted-foreground text-sm">No teams assigned.</p>
          ) : (
            <ul className="space-y-1">
              {campaign.teams.map((team) => (
                <li
                  key={team.id}
                  className="flex items-center justify-between gap-2 text-sm"
                >
                  <span>{team.name}</span>
                  {abilities.canAssign ? (
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      disabled={teamBusy}
                      aria-label={`Unassign ${team.name}`}
                      onClick={() => void removeTeam(team.id)}
                    >
                      <X aria-hidden="true" className="size-4" />
                    </Button>
                  ) : null}
                </li>
              ))}
            </ul>
          )}
          {abilities.canAssign && addableTeams.length > 0 ? (
            <div className="space-y-1">
              <Label htmlFor={ids.team}>Assign a team</Label>
              <Select
                value={PICK_TEAM}
                disabled={teamBusy}
                onValueChange={(value) => void addTeam(value)}
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
        </div>

        <div className="space-y-1">
          <p className="text-sm font-medium">Employees</p>
          {campaign.participants.length === 0 ? (
            <p className="text-muted-foreground text-sm">
              No employees assigned.
            </p>
          ) : (
            <ul className="text-muted-foreground space-y-1 text-sm">
              {campaign.participants.map((person) => (
                <li key={person.id}>{personName(person)}</li>
              ))}
            </ul>
          )}
          <p className="text-muted-foreground text-xs">
            Employee assignment is managed from the connected workspace.
          </p>
        </div>
      </section>

      {/* Budget */}
      <section
        aria-labelledby={`${ids.amount}-heading`}
        className="border-border space-y-2 border-t pt-4"
      >
        <p id={`${ids.amount}-heading`} className="text-sm font-medium">
          Budget
        </p>
        {!budgetReadable ? (
          <p className="text-muted-foreground text-sm">
            You do not have permission to view the budget.
          </p>
        ) : (
          <>
            <p className="text-muted-foreground text-sm">
              Current: {budgetSummary(budget)}
            </p>
            {abilities.canUpdateBudget ? (
              <>
                <div className="grid gap-3 sm:grid-cols-[1fr_8rem_auto]">
                  <div className="space-y-1">
                    <Label htmlFor={ids.amount}>Amount</Label>
                    <Input
                      id={ids.amount}
                      inputMode="decimal"
                      value={amount}
                      disabled={budgetBusy}
                      onChange={(changeEvent) =>
                        setAmount(changeEvent.target.value)
                      }
                    />
                  </div>
                  <div className="space-y-1">
                    <Label htmlFor={ids.currency}>Currency</Label>
                    <Input
                      id={ids.currency}
                      value={currency}
                      maxLength={3}
                      placeholder="USD"
                      disabled={budgetBusy}
                      onChange={(changeEvent) =>
                        setCurrency(changeEvent.target.value)
                      }
                    />
                  </div>
                  <div className="flex items-end gap-2">
                    <Button
                      type="button"
                      size="sm"
                      disabled={budgetBusy}
                      onClick={() => void saveBudget(false)}
                    >
                      Save
                    </Button>
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      disabled={budgetBusy}
                      onClick={() => void saveBudget(true)}
                    >
                      Clear
                    </Button>
                  </div>
                </div>
                {budgetError ? (
                  <p className="text-destructive text-sm" role="alert">
                    {budgetError}
                  </p>
                ) : null}
              </>
            ) : null}
          </>
        )}
      </section>

      {/* Danger zone */}
      {abilities.canDelete ? (
        <div className="border-border space-y-2 border-t pt-4">
          {confirmingDelete ? (
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-sm">
                Permanently delete this campaign and its activities?
              </span>
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
              Delete campaign
            </Button>
          )}
          {deleteError ? (
            <Alert variant="destructive" aria-live="assertive">
              <AlertTitle>{deleteError}</AlertTitle>
            </Alert>
          ) : null}
        </div>
      ) : null}

      <p role="status" aria-live="polite" className="sr-only">
        {announcement}
      </p>
    </>
  );
}
