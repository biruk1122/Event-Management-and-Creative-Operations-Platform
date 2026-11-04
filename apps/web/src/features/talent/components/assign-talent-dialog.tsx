"use client";

import {
  useEffect,
  useId,
  useState,
  type FormEvent,
  type ReactNode,
} from "react";
import { useQuery } from "@tanstack/react-query";
import { ArrowRight, Check } from "lucide-react";

import { Alert, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { WorkDialogContent as DialogContent } from "@/components/ui/work-dialog-content";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import type { CurrentAccess } from "@/features/auth/api/access-queries";
import { cn } from "@/lib/utils";

import {
  checkTalentAssignment,
  createTalentAssignment,
  listAssignableWorks,
  updateTalentAssignment,
  type CreateAssignmentOutcome,
  type ChangeAssignmentOutcome,
  type TalentAssignment,
  type TalentAssignmentCheck,
  type TalentWorkOption,
} from "../api/talent-assignments-gateway";
import { talentKeys } from "../api/talent-queries";
import type {
  TalentAssignmentConflict,
  TalentAssignmentKind,
} from "../lib/talent-types";

const KIND_LABELS: Record<TalentAssignmentKind, string> = {
  EVENT: "Event",
  PRODUCTION: "Production",
  PROMOTION: "Promotional activity",
};
const KINDS: readonly TalentAssignmentKind[] = [
  "EVENT",
  "PRODUCTION",
  "PROMOTION",
];

const WHEN = new Intl.DateTimeFormat(undefined, {
  dateStyle: "medium",
  timeStyle: "short",
});

/** `datetime-local` value from a stored UTC instant. Matches the schedule editor's UTC convention. */
function toLocalInput(iso: string | null | undefined): string {
  return iso ? iso.slice(0, 16) : "";
}

/** Stored UTC instant from a `datetime-local` value; blank means no date. */
function toIsoUtc(local: string): string | null {
  const trimmed = local.trim();
  if (trimmed === "") return null;
  return new Date(`${trimmed.slice(0, 16)}:00.000Z`).toISOString();
}

export function conflictLabel(conflict: TalentAssignmentConflict): string {
  switch (conflict.type) {
    case "UNAVAILABLE":
      return "The talent is marked unavailable for this window.";
    case "ASSIGNMENT_OVERLAP":
      return `Overlaps ${conflict.title ?? "another assignment"}.`;
    case "SCHEDULE_OVERLAP":
      return `Overlaps the schedule ${conflict.title ?? ""}`.trim() + ".";
  }
}

const CREATE_ERRORS: Record<
  Exclude<CreateAssignmentOutcome["status"], "success" | "conflict">,
  string
> = {
  duplicate: "This talent is already assigned to this work.",
  inactive: "This talent is inactive and cannot be assigned.",
  work_not_found: "That work is no longer available. Pick another.",
  dates_invalid: "The end must be after the start.",
  permission_denied: "You cannot assign talent to this work.",
  unexpected: "We could not save the assignment. Try again.",
};

const CHANGE_ERRORS: Record<
  Exclude<ChangeAssignmentOutcome["status"], "success" | "conflict">,
  string
> = {
  terminal: "This assignment is already completed or cancelled.",
  dates_invalid: "The end must be after the start.",
  not_found: "This assignment no longer exists. Refresh the page.",
  permission_denied: "You cannot change this assignment.",
  unexpected: "We could not save the change. Try again.",
};

export interface AssignTalentDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  access: CurrentAccess;
  talentId: string;
  talentName: string;
  /** The assignment to change. Omit to assign talent to a new work. */
  assignment?: TalentAssignment | null;
  onSaved: (message: string) => void;
}

export function AssignTalentDialog({
  open,
  onOpenChange,
  ...formProps
}: AssignTalentDialogProps) {
  const isEdit = Boolean(formProps.assignment);
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[92vh] overflow-y-auto sm:max-w-3xl">
        <DialogHeader>
          <DialogTitle>
            {isEdit ? "Change assignment" : "Assign talent"}
          </DialogTitle>
          <DialogDescription>
            {isEdit
              ? "Change the role, dates or notes. Conflicts are checked again before saving."
              : "Connect the right person to the right opportunity. Conflicts are shown before you confirm."}
          </DialogDescription>
        </DialogHeader>
        {open ? (
          <AssignTalentForm
            key={formProps.assignment?.id ?? "new"}
            {...formProps}
            onDone={() => onOpenChange(false)}
          />
        ) : null}
      </DialogContent>
    </Dialog>
  );
}

function Field({
  id,
  label,
  className,
  children,
}: {
  id: string;
  label: string;
  className?: string;
  children: ReactNode;
}) {
  return (
    <div className={cn("space-y-2", className)}>
      <Label htmlFor={id}>{label}</Label>
      {children}
    </div>
  );
}

function AssignTalentForm({
  access,
  talentId,
  talentName,
  assignment,
  onSaved,
  onDone,
}: Omit<AssignTalentDialogProps, "open" | "onOpenChange"> & {
  onDone: () => void;
}) {
  const isEdit = Boolean(assignment);
  const ids = {
    talent: useId(),
    kind: useId(),
    work: useId(),
    role: useId(),
    start: useId(),
    end: useId(),
    notes: useId(),
    ack: useId(),
    reason: useId(),
  };
  const keys = talentKeys(access);

  const [kind, setKind] = useState<TalentAssignmentKind>(
    assignment?.kind ?? "EVENT",
  );
  const [workId, setWorkId] = useState<string | null>(
    assignment?.workId ?? null,
  );
  const [role, setRole] = useState(assignment?.role ?? "");
  const [startAt, setStartAt] = useState(toLocalInput(assignment?.startAt));
  const [endAt, setEndAt] = useState(toLocalInput(assignment?.endAt));
  const [notes, setNotes] = useState(assignment?.notes ?? "");
  const [acknowledge, setAcknowledge] = useState(false);
  const [overrideReason, setOverrideReason] = useState("");

  const [check, setCheck] = useState<TalentAssignmentCheck | null>(null);
  const [fieldError, setFieldError] = useState<string | null>(null);
  const [formError, setFormError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const works = useQuery({
    queryKey: keys.works(kind, ""),
    queryFn: ({ signal }) => listAssignableWorks(kind, "", signal),
    retry: false,
    enabled: !isEdit,
    staleTime: 30_000,
  });
  const workOptions: readonly TalentWorkOption[] = works.data ?? [];
  const selectedWork = workOptions.find((item) => item.id === workId) ?? null;
  const effectiveKind = isEdit ? assignment!.kind : kind;
  const effectiveWorkId = isEdit ? assignment!.workId : workId;

  // Dry-run a new assignment's window as the user types. The server re-checks
  // on submit. A change skips this: the talent's own assignment would read as
  // a duplicate, and the server reports any real conflict when saved.
  useEffect(() => {
    if (isEdit || !effectiveWorkId) return;
    let cancelled = false;
    const timer = setTimeout(() => {
      void checkTalentAssignment(talentId, {
        kind: effectiveKind,
        workId: effectiveWorkId,
        startAt: toIsoUtc(startAt),
        endAt: toIsoUtc(endAt),
      }).then((result) => {
        if (!cancelled) setCheck(result);
      });
    }, 300);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [isEdit, talentId, effectiveKind, effectiveWorkId, startAt, endAt]);

  function pickWork(next: string) {
    setWorkId(next);
    setCheck(null);
    setAcknowledge(false);
    const picked = workOptions.find((item) => item.id === next);
    if (picked && startAt === "" && endAt === "") {
      setStartAt(toLocalInput(picked.startAt));
      setEndAt(toLocalInput(picked.endAt));
    }
  }

  // A check only applies to the work and window it was asked about.
  const shownCheck = isEdit || !effectiveWorkId ? null : check;
  const conflicts = shownCheck?.conflicts ?? [];
  const hasConflicts = conflicts.length > 0;
  const blocked =
    shownCheck?.blocked === true || shownCheck?.duplicate === true;
  const submitDisabled =
    submitting ||
    blocked ||
    (hasConflicts && !acknowledge) ||
    (!isEdit && !workId);

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    setFormError(null);
    setFieldError(null);

    if (role.trim() === "") {
      setFieldError("Enter the role, for example Headliner.");
      return;
    }
    const start = toIsoUtc(startAt);
    const end = toIsoUtc(endAt);
    if (start && end && new Date(end) <= new Date(start)) {
      setFieldError("The end must be after the start.");
      return;
    }
    if (!isEdit && !workId) {
      setFieldError("Choose the work to assign.");
      return;
    }

    setSubmitting(true);
    const trimmedReason = overrideReason.trim();
    const trimmedNotes = notes.trim();
    const outcome = isEdit
      ? await updateTalentAssignment(talentId, assignment!, {
          role: role.trim(),
          notes: trimmedNotes || null,
          startAt: start,
          endAt: end,
          acknowledgeConflicts: acknowledge,
          overrideReason: trimmedReason || null,
        })
      : await createTalentAssignment(talentId, {
          kind,
          workId: workId!,
          role: role.trim(),
          notes: trimmedNotes || null,
          startAt: start,
          endAt: end,
          acknowledgeConflicts: acknowledge,
          overrideReason: trimmedReason || null,
        });
    setSubmitting(false);

    if (outcome.status === "success") {
      onSaved(
        isEdit
          ? `Assignment updated for ${talentName}.`
          : `${talentName} assigned.`,
      );
      onDone();
      return;
    }
    if (outcome.status === "conflict") {
      setCheck((current) => ({
        blocked: current?.blocked ?? false,
        duplicate: current?.duplicate ?? false,
        conflicts: outcome.conflicts,
      }));
      setAcknowledge(false);
      setFormError(
        "This window conflicts with existing work. Review the conflicts and confirm to assign anyway.",
      );
      return;
    }
    const messages: Record<string, string> = isEdit
      ? CHANGE_ERRORS
      : CREATE_ERRORS;
    setFormError(messages[outcome.status] ?? CHANGE_ERRORS.unexpected);
  }

  return (
    <form
      aria-label={isEdit ? "Change assignment" : "Assign talent"}
      className="space-y-6"
      noValidate
      onSubmit={(event) => void handleSubmit(event)}
    >
      {formError ? (
        <Alert variant="destructive" aria-live="assertive">
          <AlertTitle>{formError}</AlertTitle>
        </Alert>
      ) : null}

      <div className="border-border bg-card space-y-6 rounded-2xl border p-6 shadow-sm">
        <div className="flex items-center justify-between gap-3">
          <h3 className="text-base font-semibold">Assignment details</h3>
          <p className="text-muted-foreground text-sm">* Required</p>
        </div>

        <div className="grid gap-5 sm:grid-cols-2">
          <Field id={ids.talent} label="Talent *">
            <Input id={ids.talent} value={talentName} disabled readOnly />
          </Field>

          <Field id={ids.kind} label="Assignment type">
            {isEdit ? (
              <Input
                id={ids.kind}
                value={KIND_LABELS[assignment!.kind]}
                disabled
                readOnly
              />
            ) : (
              <Select
                value={kind}
                disabled={submitting}
                onValueChange={(value) => {
                  setKind(value as TalentAssignmentKind);
                  setWorkId(null);
                  setCheck(null);
                  setAcknowledge(false);
                }}
              >
                <SelectTrigger id={ids.kind}>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {KINDS.map((value) => (
                    <SelectItem key={value} value={value}>
                      {KIND_LABELS[value]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
          </Field>

          <Field id={ids.work} label="Related work *" className="sm:col-span-1">
            {isEdit ? (
              <Input
                id={ids.work}
                value={assignment!.workName}
                disabled
                readOnly
              />
            ) : (
              <>
                <Select
                  value={workId ?? ""}
                  disabled={submitting || works.isPending}
                  onValueChange={pickWork}
                >
                  <SelectTrigger id={ids.work}>
                    <SelectValue
                      placeholder={
                        works.isPending
                          ? "Loading work…"
                          : workOptions.length === 0
                            ? "No work matches"
                            : "Choose work"
                      }
                    />
                  </SelectTrigger>
                  <SelectContent>
                    {workOptions.map((item) => (
                      <SelectItem key={item.id} value={item.id}>
                        {item.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                {selectedWork?.startAt ? (
                  <p className="text-muted-foreground text-xs">
                    Runs {WHEN.format(new Date(selectedWork.startAt))}
                    {selectedWork.endAt
                      ? ` to ${WHEN.format(new Date(selectedWork.endAt))}`
                      : ""}
                    . Dates below start from the work and can be changed.
                  </p>
                ) : null}
              </>
            )}
          </Field>

          <Field id={ids.role} label="Role">
            <Input
              id={ids.role}
              value={role}
              maxLength={200}
              disabled={submitting}
              aria-invalid={fieldError ? true : undefined}
              onChange={(event) => setRole(event.target.value)}
            />
          </Field>

          <Field id={ids.start} label="Start date">
            <Input
              id={ids.start}
              type="datetime-local"
              value={startAt}
              disabled={submitting}
              onChange={(event) => setStartAt(event.target.value)}
            />
          </Field>

          <Field id={ids.end} label="End date">
            <Input
              id={ids.end}
              type="datetime-local"
              value={endAt}
              disabled={submitting}
              onChange={(event) => setEndAt(event.target.value)}
            />
          </Field>
        </div>

        {fieldError ? (
          <p role="alert" className="text-destructive text-sm">
            {fieldError}
          </p>
        ) : null}

        {isEdit ? null : (
          <section aria-label="Availability check" className="space-y-2">
            <p className="text-sm font-medium">Availability check</p>
            {!effectiveWorkId ? (
              <p className="text-muted-foreground text-sm">
                Choose work to check {talentName}&rsquo;s availability.
              </p>
            ) : shownCheck === null ? (
              <p className="text-muted-foreground text-sm" role="status">
                Checking availability…
              </p>
            ) : shownCheck.blocked ? (
              <p role="alert" className="text-destructive text-sm">
                {talentName} is inactive and cannot be assigned.
              </p>
            ) : shownCheck.duplicate ? (
              <p role="alert" className="text-destructive text-sm">
                {talentName} is already assigned to this work.
              </p>
            ) : !hasConflicts ? (
              <p className="border-primary/30 bg-primary/5 flex items-center gap-2 rounded-xl border px-4 py-3 text-sm">
                <Check aria-hidden="true" className="text-primary size-4" />
                Available for this window. No conflicts found.
              </p>
            ) : (
              <div className="border-border space-y-3 rounded-xl border p-4">
                <p className="text-sm font-medium">Conflicts in this window</p>
                <ul className="list-disc space-y-1 pl-5 text-sm">
                  {conflicts.map((conflict, index) => (
                    <li key={`${conflict.type}-${index}`}>
                      {conflictLabel(conflict)}
                    </li>
                  ))}
                </ul>
                <div className="flex items-start gap-2">
                  <Checkbox
                    id={ids.ack}
                    checked={acknowledge}
                    disabled={submitting}
                    onCheckedChange={(next) => setAcknowledge(next === true)}
                  />
                  <Label htmlFor={ids.ack} className="text-sm font-normal">
                    Assign anyway, knowing about these conflicts
                  </Label>
                </div>
                {acknowledge ? (
                  <div className="space-y-2">
                    <Label htmlFor={ids.reason}>Why? (optional)</Label>
                    <Textarea
                      id={ids.reason}
                      maxLength={500}
                      rows={2}
                      value={overrideReason}
                      disabled={submitting}
                      onChange={(event) =>
                        setOverrideReason(event.target.value)
                      }
                    />
                  </div>
                ) : null}
              </div>
            )}
          </section>
        )}

        <Field id={ids.notes} label="Notes">
          <Textarea
            id={ids.notes}
            maxLength={2000}
            rows={3}
            value={notes}
            disabled={submitting}
            placeholder="Arrival time, rehearsal details, and responsibilities…"
            onChange={(event) => setNotes(event.target.value)}
          />
        </Field>

        <div className="border-border flex flex-wrap justify-end gap-3 border-t pt-5">
          <Button
            type="button"
            variant="outline"
            disabled={submitting}
            onClick={onDone}
          >
            Cancel
          </Button>
          <Button
            type="submit"
            disabled={submitDisabled}
            aria-busy={submitting}
          >
            {submitting
              ? "Saving…"
              : isEdit
                ? "Save changes"
                : "Confirm assignment"}
            {submitting ? null : <ArrowRight aria-hidden="true" />}
          </Button>
        </div>
      </div>
    </form>
  );
}
