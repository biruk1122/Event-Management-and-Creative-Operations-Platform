"use client";

import { useEffect, useId, useState, type FormEvent } from "react";

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
import { AdministrationDialogContent as DialogContent } from "@/components/ui/administration-dialog-content";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";

import { getReferencePreview } from "../api/letters-gateway";
import type { CreateLetter, CreateLetterValues } from "../lib/letters-outcome";
import {
  LETTER_CATEGORY_LABELS,
  LETTER_DIRECTIONS,
  LETTER_DIRECTION_LABELS,
  type Letter,
  type LetterCategory,
  type LetterDirection,
} from "../lib/letters-types";

const NONE = "NONE";

const FORM_ERRORS: Record<string, string> = {
  not_found: "That record no longer exists.",
  permission_denied: "You do not have permission to register a letter.",
  unexpected: "We could not register the letter. Try again.",
};

interface CreateLetterDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  projects: readonly { id: string; name: string }[];
  defaultDirection: LetterDirection;
  onCreate: CreateLetter;
  onCreated: (letter: Letter) => void;
}

function empty(direction: LetterDirection): CreateLetterValues {
  return {
    direction,
    category: "OTHER",
    date: new Date().toISOString().slice(0, 10),
    projectId: null,
    subject: "",
    fromParty: "",
    toParty: "",
    senderReferenceNumber: "",
    shortDescription: "",
    remark: "",
  };
}

export function CreateLetterDialog({
  open,
  onOpenChange,
  projects,
  defaultDirection,
  onCreate,
  onCreated,
}: CreateLetterDialogProps) {
  const ids = {
    direction: useId(),
    category: useId(),
    date: useId(),
    project: useId(),
    subject: useId(),
    party: useId(),
    senderReferenceNumber: useId(),
    shortDescription: useId(),
    remark: useId(),
  };

  const [values, setValues] = useState<CreateLetterValues>(() =>
    empty(defaultDirection),
  );
  const [preview, setPreview] = useState("");
  const [fieldErrors, setFieldErrors] = useState<
    Partial<Record<keyof CreateLetterValues, string>>
  >({});
  const [formError, setFormError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  // Reset the form whenever the dialog transitions from closed to open,
  // using the "adjust state during render" pattern (not an effect) so the
  // reset is not a cascading post-render setState.
  const [wasOpen, setWasOpen] = useState(open);
  if (open !== wasOpen) {
    setWasOpen(open);
    if (open) {
      setValues(empty(defaultDirection));
      setFieldErrors({});
      setFormError(null);
    }
  }

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    void getReferencePreview(values.category).then((reference) => {
      if (!cancelled) setPreview(reference);
    });
    return () => {
      cancelled = true;
    };
  }, [open, values.category]);

  function set<K extends keyof CreateLetterValues>(
    key: K,
    value: CreateLetterValues[K],
  ) {
    setValues((current) => ({ ...current, [key]: value }));
  }

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    setSubmitting(true);
    setFieldErrors({});
    setFormError(null);

    const outcome = await onCreate(values);

    setSubmitting(false);
    switch (outcome.status) {
      case "success":
        onCreated(outcome.letter);
        onOpenChange(false);
        return;
      case "field_errors":
        setFieldErrors(outcome.fieldErrors);
        return;
      case "assignment_invalid":
        setFormError(outcome.detail ?? "Check the details and try again.");
        return;
      default:
        setFormError(FORM_ERRORS[outcome.status] ?? FORM_ERRORS.unexpected!);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-xl">
        <DialogHeader>
          <DialogTitle>New letter</DialogTitle>
          <DialogDescription>
            The reference number is assigned automatically when you save.
          </DialogDescription>
        </DialogHeader>

        <form
          aria-label="Register letter"
          className="space-y-4"
          onSubmit={(event) => void handleSubmit(event)}
        >
          {formError ? (
            <Alert variant="destructive" aria-live="assertive">
              <AlertTitle>{formError}</AlertTitle>
            </Alert>
          ) : null}

          <div className="bg-muted/30 border-border flex items-center justify-between rounded-lg border p-3">
            <span className="text-sm font-medium">Reference number</span>
            <Badge variant="outline" title="Assigned on save">
              {preview || "…"} (preview)
            </Badge>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor={ids.direction}>Direction</Label>
              <Select
                value={values.direction}
                onValueChange={(value) =>
                  set("direction", value as LetterDirection)
                }
              >
                <SelectTrigger id={ids.direction}>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {LETTER_DIRECTIONS.map((value) => (
                    <SelectItem key={value} value={value}>
                      {LETTER_DIRECTION_LABELS[value]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label htmlFor={ids.category}>Category</Label>
              <Select
                value={values.category}
                onValueChange={(value) =>
                  set("category", value as LetterCategory)
                }
              >
                <SelectTrigger id={ids.category}>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {Object.entries(LETTER_CATEGORY_LABELS).map(
                    ([value, label]) => (
                      <SelectItem key={value} value={value}>
                        {label}
                      </SelectItem>
                    ),
                  )}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor={ids.date}>Date</Label>
              <Input
                id={ids.date}
                type="date"
                required
                value={values.date}
                onChange={(event) => set("date", event.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor={ids.project}>Project (optional)</Label>
              <Select
                value={values.projectId ?? NONE}
                onValueChange={(value) =>
                  set("projectId", value === NONE ? null : value)
                }
              >
                <SelectTrigger id={ids.project}>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={NONE}>No project</SelectItem>
                  {projects.map((project) => (
                    <SelectItem key={project.id} value={project.id}>
                      {project.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor={ids.subject}>Subject</Label>
            <Input
              id={ids.subject}
              required
              value={values.subject}
              aria-invalid={fieldErrors.subject ? true : undefined}
              onChange={(event) => set("subject", event.target.value)}
            />
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor={ids.party}>
                {values.direction === "INCOMING" ? "From" : "To"}
              </Label>
              <Input
                id={ids.party}
                required
                value={
                  values.direction === "INCOMING"
                    ? values.fromParty
                    : values.toParty
                }
                onChange={(event) =>
                  set(
                    values.direction === "INCOMING" ? "fromParty" : "toParty",
                    event.target.value,
                  )
                }
              />
            </div>
            {values.direction === "INCOMING" ? (
              <div className="space-y-2">
                <Label htmlFor={ids.senderReferenceNumber}>
                  Sender&apos;s reference no. (optional)
                </Label>
                <Input
                  id={ids.senderReferenceNumber}
                  value={values.senderReferenceNumber}
                  onChange={(event) =>
                    set("senderReferenceNumber", event.target.value)
                  }
                />
              </div>
            ) : null}
          </div>

          <div className="space-y-2">
            <Label htmlFor={ids.shortDescription}>
              Short description (optional)
            </Label>
            <Textarea
              id={ids.shortDescription}
              rows={2}
              value={values.shortDescription}
              onChange={(event) => set("shortDescription", event.target.value)}
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor={ids.remark}>Remark (optional)</Label>
            <Textarea
              id={ids.remark}
              rows={2}
              value={values.remark}
              onChange={(event) => set("remark", event.target.value)}
            />
          </div>

          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
              disabled={submitting}
            >
              Cancel
            </Button>
            <Button type="submit" disabled={submitting} aria-busy={submitting}>
              {submitting ? "Registering…" : "Register letter"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
