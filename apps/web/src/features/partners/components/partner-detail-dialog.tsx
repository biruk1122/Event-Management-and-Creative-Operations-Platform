"use client";

import { useEffect, useId, useState, type FormEvent } from "react";
import { useQuery } from "@tanstack/react-query";
import { LoaderCircle, TriangleAlert } from "lucide-react";

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { WorkDialogContent as DialogContent } from "@/components/ui/work-dialog-content";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { listEligibleAssignees } from "@/features/tasks/api/tasks-gateway";

import {
  getPartner as defaultGetPartner,
  listPartnerActivities,
} from "../api/partners-gateway";
import { PartnerFields } from "./partner-fields";
import type {
  CreatePartnerActivity,
  GetPartner,
  PartnerFieldValues,
  UpdatePartner,
} from "../lib/partners-outcome";
import {
  partnerStatusLabel,
  personName,
  PARTNER_STATUSES,
  type Partner,
} from "../lib/partners-types";

const UNASSIGNED = "UNASSIGNED";

const ACTION_ERRORS: Record<string, string> = {
  not_found: "This partner no longer exists. Close this and refresh the list.",
  owner_outside_department:
    "That user does not belong to this partner's department.",
  permission_denied: "You do not have permission to do that.",
  unexpected: "We could not save that change. Try again.",
};

function actionError(key: string): string {
  return ACTION_ERRORS[key] ?? ACTION_ERRORS.unexpected!;
}

function fieldsFromPartner(partner: Partner): PartnerFieldValues {
  return {
    organizationName: partner.organizationName,
    category: partner.category,
    contactName: partner.contactName ?? "",
    contactEmail: partner.contactEmail ?? "",
    contactPhone: partner.contactPhone ?? "",
    proposedContribution: partner.proposedContribution ?? "",
    notes: partner.notes ?? "",
    followUpAt: partner.followUpAt ? partner.followUpAt.slice(0, 10) : "",
  };
}

interface PartnerDetailDialogProps {
  partnerId: string | null;
  onOpenChange: (open: boolean) => void;
  canUpdate: boolean;
  canAddActivity: boolean;
  getPartner?: GetPartner;
  onUpdate: UpdatePartner;
  onAddActivity: CreatePartnerActivity;
  onChanged: (partner: Partner) => void;
}

export function PartnerDetailDialog({
  partnerId,
  onOpenChange,
  ...bodyProps
}: PartnerDetailDialogProps) {
  return (
    <Dialog
      open={partnerId !== null}
      onOpenChange={(open) => {
        if (!open) onOpenChange(false);
      }}
    >
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-lg">
        {partnerId !== null ? (
          <PartnerDetailBody
            key={partnerId}
            partnerId={partnerId}
            {...bodyProps}
          />
        ) : null}
      </DialogContent>
    </Dialog>
  );
}

type BodyProps = Omit<
  PartnerDetailDialogProps,
  "partnerId" | "onOpenChange"
> & {
  partnerId: string;
};

function PartnerDetailBody({
  partnerId,
  canUpdate,
  canAddActivity,
  getPartner = defaultGetPartner,
  onUpdate,
  onAddActivity,
  onChanged,
}: BodyProps) {
  const statusId = useId();
  const ownerId = useId();
  const noteId = useId();

  const [status, setStatus] = useState<"loading" | "loaded" | "error">(
    "loading",
  );
  const [partner, setPartner] = useState<Partner | null>(null);
  const [fields, setFields] = useState<PartnerFieldValues | null>(null);
  const [fieldErrors, setFieldErrors] = useState<
    Partial<Record<keyof PartnerFieldValues, string>>
  >({});
  const [detailsError, setDetailsError] = useState<string | null>(null);
  const [detailsBusy, setDetailsBusy] = useState(false);

  const [statusBusy, setStatusBusy] = useState(false);
  const [statusError, setStatusError] = useState<string | null>(null);
  const [ownerBusy, setOwnerBusy] = useState(false);
  const [ownerError, setOwnerError] = useState<string | null>(null);
  const [announcement, setAnnouncement] = useState("");

  const [note, setNote] = useState("");
  const [noteBusy, setNoteBusy] = useState(false);
  const [noteError, setNoteError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    void getPartner(partnerId).then((loaded) => {
      if (cancelled) return;
      if (!loaded) {
        setStatus("error");
        return;
      }
      setPartner(loaded);
      setFields(fieldsFromPartner(loaded));
      setStatus("loaded");
    });
    return () => {
      cancelled = true;
    };
  }, [partnerId, getPartner]);

  const eligibleOwnersQuery = useQuery({
    queryKey: ["partner-eligible-owners", partner?.departmentId],
    queryFn: ({ signal }) =>
      listEligibleAssignees(partner!.departmentId!, signal),
    enabled: canUpdate && !!partner?.departmentId,
  });

  const activitiesQuery = useQuery({
    queryKey: ["partner-activities", partnerId],
    queryFn: ({ signal }) => listPartnerActivities(partnerId, 1, signal),
    enabled: status === "loaded",
  });

  function apply(next: Partner) {
    setPartner(next);
    setFields(fieldsFromPartner(next));
    onChanged(next);
  }

  function setField<K extends keyof PartnerFieldValues>(
    key: K,
    value: PartnerFieldValues[K],
  ) {
    setFields((current) => (current ? { ...current, [key]: value } : current));
  }

  async function saveDetails() {
    if (!partner || !fields) return;
    const errors: Partial<Record<keyof PartnerFieldValues, string>> = {};
    if (fields.organizationName.trim() === "")
      errors.organizationName = "Enter an organization name.";
    if (fields.category.trim() === "") errors.category = "Enter a category.";
    if (Object.keys(errors).length > 0) {
      setFieldErrors(errors);
      return;
    }

    setDetailsBusy(true);
    setDetailsError(null);
    setFieldErrors({});
    const outcome = await onUpdate(partner.id, fields);
    setDetailsBusy(false);

    if (outcome.status === "success") {
      apply(outcome.partner);
      setAnnouncement("Partner details saved.");
      return;
    }
    if (outcome.status === "field_errors") {
      setFieldErrors(outcome.fieldErrors);
      return;
    }
    setDetailsError(actionError(outcome.status));
  }

  async function changeStatus(next: string) {
    if (!partner) return;
    setStatusBusy(true);
    setStatusError(null);
    const outcome = await onUpdate(partner.id, {
      status: next as Partner["status"],
    });
    setStatusBusy(false);
    if (outcome.status === "success") {
      apply(outcome.partner);
      setAnnouncement(
        `Status changed to ${partnerStatusLabel(outcome.partner.status)}.`,
      );
      return;
    }
    setStatusError(actionError(outcome.status));
  }

  async function changeOwner(next: string) {
    if (!partner) return;
    setOwnerBusy(true);
    setOwnerError(null);
    const outcome = await onUpdate(partner.id, {
      ownerId: next === UNASSIGNED ? null : next,
    });
    setOwnerBusy(false);
    if (outcome.status === "success") {
      apply(outcome.partner);
      setAnnouncement(`Owner changed to ${personName(outcome.partner.owner)}.`);
      return;
    }
    setOwnerError(actionError(outcome.status));
  }

  async function submitNote(event: FormEvent) {
    event.preventDefault();
    if (!note.trim()) return;
    setNoteBusy(true);
    setNoteError(null);
    const outcome = await onAddActivity(partnerId, note);
    setNoteBusy(false);
    if (outcome.status === "success") {
      setNote("");
      setAnnouncement("Note added.");
      void activitiesQuery.refetch();
      return;
    }
    setNoteError(
      outcome.status === "permission_denied"
        ? "You do not have permission to add a note here."
        : "We could not add that note. Try again.",
    );
  }

  if (status === "loading") {
    return (
      <div
        role="status"
        aria-live="polite"
        className="flex items-center justify-center gap-2 py-10 text-sm"
      >
        <LoaderCircle aria-hidden="true" className="size-4 animate-spin" />
        Loading partner…
      </div>
    );
  }

  if (status === "error" || !partner || !fields) {
    return (
      <Alert variant="destructive">
        <TriangleAlert aria-hidden="true" />
        <AlertTitle>We could not load this partner</AlertTitle>
        <AlertDescription>Try again in a moment.</AlertDescription>
      </Alert>
    );
  }

  return (
    <>
      <DialogHeader>
        <div className="flex flex-wrap items-center gap-2">
          <DialogTitle>{partner.organizationName}</DialogTitle>
          <Badge variant="outline">{partnerStatusLabel(partner.status)}</Badge>
        </div>
        <DialogDescription>
          Owned by {personName(partner.owner)}
        </DialogDescription>
      </DialogHeader>

      <form
        aria-label="Edit partner details"
        className="space-y-4"
        noValidate
        onSubmit={(submitEvent) => {
          submitEvent.preventDefault();
          void saveDetails();
        }}
      >
        <PartnerFields
          values={fields}
          errors={fieldErrors}
          disabled={detailsBusy || !canUpdate}
          onChange={setField}
        />
        {detailsError ? (
          <p className="text-destructive text-sm" role="alert">
            {detailsError}
          </p>
        ) : null}
        {canUpdate ? (
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
            You have read-only access to this partner&rsquo;s details.
          </p>
        )}
      </form>

      {canUpdate ? (
        <section className="border-border space-y-4 border-t pt-4">
          <div className="space-y-2">
            <Label htmlFor={statusId}>Status</Label>
            <Select
              value={partner.status}
              disabled={statusBusy}
              onValueChange={(value) => void changeStatus(value)}
            >
              <SelectTrigger id={statusId} aria-busy={statusBusy}>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {PARTNER_STATUSES.map((value) => (
                  <SelectItem key={value} value={value}>
                    {partnerStatusLabel(value)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {statusError ? (
              <p className="text-destructive text-sm" role="alert">
                {statusError}
              </p>
            ) : null}
          </div>

          {partner.departmentId ? (
            <div className="space-y-2">
              <Label htmlFor={ownerId}>Owner</Label>
              <Select
                value={partner.owner?.id ?? UNASSIGNED}
                disabled={ownerBusy || eligibleOwnersQuery.isPending}
                onValueChange={(value) => void changeOwner(value)}
              >
                <SelectTrigger id={ownerId} aria-busy={ownerBusy}>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={UNASSIGNED}>Unassigned</SelectItem>
                  {(eligibleOwnersQuery.data ?? []).map((person) => (
                    <SelectItem key={person.id} value={person.id}>
                      {personName(person)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {ownerError ? (
                <p className="text-destructive text-sm" role="alert">
                  {ownerError}
                </p>
              ) : null}
            </div>
          ) : null}
        </section>
      ) : null}

      <section className="border-border space-y-3 border-t pt-4">
        <h3 className="text-sm font-medium">Activity log</h3>
        {activitiesQuery.isPending ? (
          <p role="status" className="text-muted-foreground text-sm">
            Loading activity…
          </p>
        ) : (activitiesQuery.data?.items.length ?? 0) === 0 ? (
          <p className="text-muted-foreground text-sm">
            No activity recorded yet.
          </p>
        ) : (
          <ul className="space-y-2">
            {activitiesQuery.data!.items.map((activity) => (
              <li
                key={activity.id}
                className="bg-muted/50 rounded-lg p-3 text-sm"
              >
                <p>{activity.note}</p>
                <p className="text-muted-foreground mt-1 text-xs">
                  {personName(activity.author)} ·{" "}
                  {new Date(activity.createdAt).toLocaleString()}
                </p>
              </li>
            ))}
          </ul>
        )}

        {canAddActivity ? (
          <form
            aria-label="Add activity note"
            className="space-y-2"
            onSubmit={(event) => void submitNote(event)}
          >
            <Label htmlFor={noteId}>Add a note</Label>
            <textarea
              id={noteId}
              rows={2}
              value={note}
              disabled={noteBusy}
              placeholder="Sent the sponsorship deck; awaiting reply."
              className="border-input placeholder:text-muted-foreground focus-visible:ring-ring/50 flex w-full rounded-md border bg-transparent px-3 py-2 text-sm shadow-xs focus-visible:ring-3 focus-visible:outline-none disabled:cursor-not-allowed disabled:opacity-50"
              onChange={(event) => setNote(event.target.value)}
            />
            {noteError ? (
              <p className="text-destructive text-sm" role="alert">
                {noteError}
              </p>
            ) : null}
            <Button
              type="submit"
              size="sm"
              variant="outline"
              disabled={noteBusy || !note.trim()}
              aria-busy={noteBusy}
            >
              {noteBusy ? "Adding…" : "Add note"}
            </Button>
          </form>
        ) : null}
      </section>

      <p role="status" aria-live="polite" className="sr-only">
        {announcement}
      </p>
    </>
  );
}
