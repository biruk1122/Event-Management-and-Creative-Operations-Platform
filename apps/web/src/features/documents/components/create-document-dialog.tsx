"use client";

import { useId, useState, type FormEvent } from "react";

import { Alert, AlertTitle } from "@/components/ui/alert";
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

import type {
  CreateDocument,
  CreateDocumentValues,
} from "../lib/documents-outcome";
import {
  DOCUMENT_TYPE_LABELS,
  type DocumentRecord,
  type DocumentType,
} from "../lib/documents-types";

const NONE = "NONE";

const FORM_ERRORS: Record<string, string> = {
  not_found: "That record no longer exists.",
  permission_denied: "You do not have permission to add a document.",
  unexpected: "We could not create the document. Try again.",
};

interface CreateDocumentDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  projects: readonly { id: string; name: string }[];
  onCreate: CreateDocument;
  onCreated: (document: DocumentRecord) => void;
}

function empty(): CreateDocumentValues {
  return {
    displayName: "",
    documentType: "OTHER",
    projectId: null,
    description: "",
  };
}

export function CreateDocumentDialog({
  open,
  onOpenChange,
  projects,
  onCreate,
  onCreated,
}: CreateDocumentDialogProps) {
  const ids = {
    displayName: useId(),
    documentType: useId(),
    project: useId(),
    description: useId(),
  };

  const [values, setValues] = useState<CreateDocumentValues>(empty);
  const [fieldErrors, setFieldErrors] = useState<
    Partial<Record<keyof CreateDocumentValues, string>>
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
      setValues(empty());
      setFieldErrors({});
      setFormError(null);
    }
  }

  function set<K extends keyof CreateDocumentValues>(
    key: K,
    value: CreateDocumentValues[K],
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
        onCreated(outcome.document);
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
          <DialogTitle>New document</DialogTitle>
          <DialogDescription>
            Create the record first, then attach its file from the detail view.
          </DialogDescription>
        </DialogHeader>

        <form
          aria-label="Create document"
          className="space-y-4"
          onSubmit={(event) => void handleSubmit(event)}
        >
          {formError ? (
            <Alert variant="destructive" aria-live="assertive">
              <AlertTitle>{formError}</AlertTitle>
            </Alert>
          ) : null}

          <div className="space-y-2">
            <Label htmlFor={ids.displayName}>Name</Label>
            <Input
              id={ids.displayName}
              required
              value={values.displayName}
              aria-invalid={fieldErrors.displayName ? true : undefined}
              onChange={(event) => set("displayName", event.target.value)}
            />
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor={ids.documentType}>Type</Label>
              <Select
                value={values.documentType}
                onValueChange={(value) =>
                  set("documentType", value as DocumentType)
                }
              >
                <SelectTrigger id={ids.documentType}>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {Object.entries(DOCUMENT_TYPE_LABELS).map(
                    ([value, label]) => (
                      <SelectItem key={value} value={value}>
                        {label}
                      </SelectItem>
                    ),
                  )}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label htmlFor={ids.project}>Document of (optional)</Label>
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
                  <SelectItem value={NONE}>No linked project</SelectItem>
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
            <Label htmlFor={ids.description}>Description (optional)</Label>
            <Textarea
              id={ids.description}
              rows={2}
              value={values.description}
              onChange={(event) => set("description", event.target.value)}
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
              {submitting ? "Creating…" : "Create document"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
