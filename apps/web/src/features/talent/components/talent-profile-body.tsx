"use client";

import { useEffect, useId, useState } from "react";
import { LoaderCircle, TriangleAlert } from "lucide-react";

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
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
  GetTalent,
  RemoveSchedule,
  RemoveSocialLink,
  SetTalentManager,
  TransitionTalent,
  UpdateSchedule,
  UpdateTalent,
} from "../lib/talent-outcome";
import {
  availabilityLabel,
  NEXT_AVAILABILITIES,
  personName,
  type AssignableUser,
  type Talent,
} from "../lib/talent-types";

const NO_MANAGER = "NONE";
const PICK_AVAILABILITY = "PICK_AVAILABILITY";

const ACTION_ERRORS: Record<string, string> = {
  manager_not_found: "That user no longer exists.",
  invalid_transition: "That move is not allowed from the current availability.",
  not_found: "This talent no longer exists. Refresh the list.",
  permission_denied: "You do not have permission to do that.",
  unexpected: "We could not save that change. Try again.",
};

function actionError(key: string): string {
  return ACTION_ERRORS[key] ?? ACTION_ERRORS.unexpected!;
}

export interface TalentProfileBodyProps {
  talentId: string;
  users: readonly AssignableUser[];
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
  /** Called with the latest profile after every change made here. */
  onChanged: (talent: Talent) => void;
}

/**
 * The profile editor shared by the talent details page: identity header,
 * profile fields, availability, manager, schedules and social links. Assignments
 * and history render beside it on the page.
 */
export function TalentProfileBody({
  talentId,
  users,
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
  onChanged,
}: TalentProfileBodyProps) {
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
    <div className="space-y-8">
      {/* Details */}
      <form
        aria-label="Edit talent details"
        className="border-border bg-card space-y-6 rounded-2xl border p-6 shadow-sm"
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
        className="space-y-2"
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
      <section aria-labelledby={`${ids.manager}-heading`} className="space-y-2">
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
        onRemoved={(scheduleId) =>
          apply({
            ...talent,
            schedules: talent.schedules.filter(
              (item) => item.id !== scheduleId,
            ),
          })
        }
      />

      <TalentSocialLinks
        talentId={talent.id}
        socialLinks={talent.socialLinks}
        canManage={abilities.canUpdate}
        onAdd={onAddSocialLink}
        onRemove={onRemoveSocialLink}
        onChanged={apply}
        onRemoved={(socialLinkId) =>
          apply({
            ...talent,
            socialLinks: talent.socialLinks.filter(
              (item) => item.id !== socialLinkId,
            ),
          })
        }
      />

      <p role="status" aria-live="polite" className="sr-only">
        {announcement}
      </p>
    </div>
  );
}
