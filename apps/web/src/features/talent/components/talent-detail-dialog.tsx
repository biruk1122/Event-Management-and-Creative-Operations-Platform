"use client";

import { useEffect, useId, useState } from "react";
import { LoaderCircle, TriangleAlert } from "lucide-react";

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

import { getTalent as defaultGetTalent } from "../api/talent-gateway";
import { TalentAvailabilityBadge } from "./availability-badges";
import { TalentEventAssignments } from "./talent-event-assignments";
import { TalentFields } from "./talent-fields";
import { TalentSchedules } from "./talent-schedules";
import { TalentSocialLinks } from "./talent-social-links";
import type { TalentAbilities } from "../lib/talent-access";
import {
  fieldsFromTalent,
  validateFields,
  type TalentFieldErrors,
  type TalentFieldValues,
} from "../lib/talent-form";
import type {
  AddSchedule,
  AddSocialLink,
  AssignEvent,
  GetTalent,
  RemoveSchedule,
  RemoveSocialLink,
  SetTalentManager,
  TransitionAssignment,
  TransitionTalent,
  UpdateSchedule,
  UpdateTalent,
} from "../lib/talent-outcome";
import {
  availabilityLabel,
  NEXT_AVAILABILITIES,
  personName,
  talentTypeLabel,
  type AssignableEvent,
  type AssignableUser,
  type Talent,
} from "../lib/talent-types";

const NO_MANAGER = "NONE";
const PICK_AVAILABILITY = "PICK_AVAILABILITY";

const ACTION_ERRORS: Record<string, string> = {
  manager_not_found: "That user no longer exists.",
  invalid_transition: "That move is not allowed from the current availability.",
  not_found: "This talent no longer exists. Close this and refresh the list.",
  permission_denied: "You do not have permission to do that.",
  unexpected: "We could not save that change. Try again.",
};

function actionError(key: string): string {
  return ACTION_ERRORS[key] ?? ACTION_ERRORS.unexpected!;
}

interface TalentDetailDialogProps {
  talentId: string | null;
  onOpenChange: (open: boolean) => void;
  users: readonly AssignableUser[];
  events: readonly AssignableEvent[];
  /** What the caller may do; controls are hidden or read-only without the matching grant. */
  abilities: TalentAbilities;
  getTalent?: GetTalent;
  onUpdate: UpdateTalent;
  onTransition: TransitionTalent;
  onSetManager: SetTalentManager;
  onAddSocialLink: AddSocialLink;
  onRemoveSocialLink: RemoveSocialLink;
  onAddSchedule: AddSchedule;
  onUpdateSchedule: UpdateSchedule;
  onRemoveSchedule: RemoveSchedule;
  onAssignEvent: AssignEvent;
  onTransitionAssignment: TransitionAssignment;
  onChanged: (talent: Talent) => void;
}

export function TalentDetailDialog({
  talentId,
  onOpenChange,
  ...bodyProps
}: TalentDetailDialogProps) {
  return (
    <Dialog
      open={talentId !== null}
      onOpenChange={(open) => {
        if (!open) onOpenChange(false);
      }}
    >
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-2xl">
        {talentId !== null ? (
          <TalentDetailBody key={talentId} talentId={talentId} {...bodyProps} />
        ) : null}
      </DialogContent>
    </Dialog>
  );
}

type BodyProps = Omit<TalentDetailDialogProps, "talentId" | "onOpenChange"> & {
  talentId: string;
};

function TalentDetailBody({
  talentId,
  users,
  events,
  abilities,
  getTalent = defaultGetTalent,
  onUpdate,
  onTransition,
  onSetManager,
  onAddSocialLink,
  onRemoveSocialLink,
  onAddSchedule,
  onUpdateSchedule,
  onRemoveSchedule,
  onAssignEvent,
  onTransitionAssignment,
  onChanged,
}: BodyProps) {
  const ids = { manager: useId(), availability: useId() };

  const [status, setStatus] = useState<"loading" | "loaded" | "error">(
    "loading",
  );
  const [talent, setTalent] = useState<Talent | null>(null);

  const [fields, setFields] = useState<TalentFieldValues | null>(null);
  const [fieldErrors, setFieldErrors] = useState<TalentFieldErrors>({});
  const [detailsError, setDetailsError] = useState<string | null>(null);
  const [detailsBusy, setDetailsBusy] = useState(false);

  const [availabilityError, setAvailabilityError] = useState<string | null>(
    null,
  );
  const [availabilityBusy, setAvailabilityBusy] = useState(false);
  const [managerError, setManagerError] = useState<string | null>(null);
  const [managerBusy, setManagerBusy] = useState(false);
  const [announcement, setAnnouncement] = useState("");

  useEffect(() => {
    let cancelled = false;
    void getTalent(talentId)
      .then((loaded) => {
        if (cancelled) return;
        if (!loaded) {
          setStatus("error");
          return;
        }
        setTalent(loaded);
        setFields(fieldsFromTalent(loaded));
        setStatus("loaded");
      })
      .catch(() => {
        if (!cancelled) setStatus("error");
      });
    return () => {
      cancelled = true;
    };
  }, [talentId, getTalent]);

  function apply(next: Talent) {
    setTalent(next);
    setFields(fieldsFromTalent(next));
    onChanged(next);
  }

  function setField<K extends keyof TalentFieldValues>(
    key: K,
    value: TalentFieldValues[K],
  ) {
    setFields((current) => (current ? { ...current, [key]: value } : current));
  }

  async function saveDetails() {
    if (!talent || !fields || !abilities.canUpdate) return;
    const localErrors = validateFields(fields);
    if (Object.keys(localErrors).length > 0) {
      setFieldErrors(localErrors);
      return;
    }

    setDetailsBusy(true);
    setDetailsError(null);
    setFieldErrors({});
    const outcome = await onUpdate(talent.id, fields);
    setDetailsBusy(false);

    if (outcome.status === "success") {
      apply(outcome.talent);
      setAnnouncement("Talent details saved.");
      return;
    }
    if (outcome.status === "field_errors") {
      setFieldErrors(outcome.fieldErrors);
      return;
    }
    setDetailsError(actionError(outcome.status));
  }

  async function moveTo(next: string) {
    if (!talent || next === PICK_AVAILABILITY) return;
    setAvailabilityBusy(true);
    setAvailabilityError(null);
    const outcome = await onTransition(
      talent.id,
      next as Talent["availability"],
    );
    setAvailabilityBusy(false);
    if (outcome.status === "success") {
      apply(outcome.talent);
      setAnnouncement(
        `Availability changed to ${availabilityLabel(outcome.talent.availability)}.`,
      );
      return;
    }
    setAvailabilityError(actionError(outcome.status));
  }

  async function changeManager(value: string) {
    if (!talent) return;
    const managerId = value === NO_MANAGER ? null : value;
    setManagerBusy(true);
    setManagerError(null);
    const outcome = await onSetManager(talent.id, managerId);
    setManagerBusy(false);
    if (outcome.status === "success") {
      apply(outcome.talent);
      setAnnouncement(managerId ? "Manager assigned." : "Manager removed.");
      return;
    }
    setManagerError(actionError(outcome.status));
  }

  if (status === "loading") {
    return (
      <div
        role="status"
        aria-live="polite"
        className="flex items-center justify-center gap-2 py-10 text-sm"
      >
        <LoaderCircle aria-hidden="true" className="size-4 animate-spin" />
        Loading talent…
      </div>
    );
  }

  if (status === "error" || !talent || !fields) {
    return (
      <Alert variant="destructive">
        <TriangleAlert aria-hidden="true" />
        <AlertTitle>We could not load this talent</AlertTitle>
        <AlertDescription>Try again in a moment.</AlertDescription>
      </Alert>
    );
  }

  const moves = NEXT_AVAILABILITIES[talent.availability];

  return (
    <>
      <DialogHeader>
        <div className="flex flex-wrap items-center gap-2">
          <DialogTitle>{talent.fullName}</DialogTitle>
          <Badge variant="secondary">{talentTypeLabel(talent.type)}</Badge>
          <TalentAvailabilityBadge availability={talent.availability} />
        </div>
        <DialogDescription>
          {talent.manager
            ? `Managed by ${personName(talent.manager)}`
            : "No manager assigned"}
        </DialogDescription>
      </DialogHeader>

      {/* Details */}
      <form
        aria-label="Edit talent details"
        className="space-y-4"
        noValidate
        onSubmit={(submitEvent) => {
          submitEvent.preventDefault();
          void saveDetails();
        }}
      >
        <TalentFields
          values={fields}
          errors={fieldErrors}
          disabled={detailsBusy || !abilities.canUpdate}
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
            You have read-only access to this talent&rsquo;s details.
          </p>
        )}
      </form>

      {/* Availability */}
      <section
        aria-labelledby={`${ids.availability}-heading`}
        className="border-border space-y-2 border-t pt-4"
      >
        <p id={`${ids.availability}-heading`} className="text-sm font-medium">
          Availability
        </p>
        {!abilities.canTransition ? (
          <p className="text-muted-foreground text-sm">
            Current availability: {availabilityLabel(talent.availability)}.
          </p>
        ) : moves.length === 0 ? (
          <p className="text-muted-foreground text-sm">
            {availabilityLabel(talent.availability)} is a final state.
          </p>
        ) : (
          <div className="space-y-1">
            <Label htmlFor={ids.availability}>Move to</Label>
            <Select
              value={PICK_AVAILABILITY}
              disabled={availabilityBusy}
              onValueChange={(value) => void moveTo(value)}
            >
              <SelectTrigger id={ids.availability} aria-busy={availabilityBusy}>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={PICK_AVAILABILITY}>
                  Choose availability…
                </SelectItem>
                {moves.map((next) => (
                  <SelectItem key={next} value={next}>
                    {availabilityLabel(next)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        )}
        {availabilityError ? (
          <p className="text-destructive text-sm" role="alert">
            {availabilityError}
          </p>
        ) : null}
      </section>

      {/* Manager */}
      <section
        aria-labelledby={`${ids.manager}-heading`}
        className="border-border space-y-2 border-t pt-4"
      >
        <p id={`${ids.manager}-heading`} className="text-sm font-medium">
          Manager
        </p>
        <div className="space-y-1">
          <Label htmlFor={ids.manager}>Manager</Label>
          <Select
            value={talent.manager?.id ?? NO_MANAGER}
            disabled={managerBusy || !abilities.canUpdate}
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
      </section>

      <TalentSchedules
        talentId={talent.id}
        schedules={talent.schedules}
        canManage={abilities.canManageActivities}
        onAdd={onAddSchedule}
        onUpdate={onUpdateSchedule}
        onRemove={onRemoveSchedule}
        onChanged={apply}
      />

      <TalentSocialLinks
        talentId={talent.id}
        socialLinks={talent.socialLinks}
        canManage={abilities.canUpdate}
        onAdd={onAddSocialLink}
        onRemove={onRemoveSocialLink}
        onChanged={apply}
      />

      <TalentEventAssignments
        talentId={talent.id}
        assignments={talent.eventAssignments}
        events={events}
        canManage={abilities.canAssign}
        onAssign={onAssignEvent}
        onTransition={onTransitionAssignment}
        onChanged={apply}
      />

      <p role="status" aria-live="polite" className="sr-only">
        {announcement}
      </p>
    </>
  );
}
