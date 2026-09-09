"use client";

import { useId, useState, type FormEvent } from "react";

import { Alert, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
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

import type {
  CreateWorkspace,
  CreateWorkspaceValues,
} from "../lib/workspaces-outcome";
import {
  personName,
  WORKSPACE_KIND_LABELS,
  type AssignableUser,
  type Workspace,
  type WorkspaceKind,
} from "../lib/workspaces-types";

const NO_MANAGER = "NONE";

const FORM_ERRORS: Record<string, string> = {
  manager_not_found: "That user no longer exists. Pick another.",
  permission_denied: "You do not have permission to create a workspace.",
  unexpected: "We could not create the workspace. Try again.",
};

interface CreateWorkspaceDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** The workspace kind to create; set by the list the caller is viewing. */
  kind: WorkspaceKind;
  managers: readonly AssignableUser[];
  onCreate: CreateWorkspace;
  onCreated: (workspace: Workspace) => void;
}

export function CreateWorkspaceDialog({
  open,
  onOpenChange,
  kind,
  managers,
  onCreate,
  onCreated,
}: CreateWorkspaceDialogProps) {
  const ids = {
    manager: useId(),
  };

  const [managerId, setManagerId] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<
    Partial<Record<keyof CreateWorkspaceValues, string>>
  >({});
  const [formError, setFormError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  function reset() {
    setManagerId(null);
    setFieldErrors({});
    setFormError(null);
  }

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    setSubmitting(true);
    setFieldErrors({});
    setFormError(null);

    const outcome = await onCreate({ kind, managerId });

    setSubmitting(false);

    switch (outcome.status) {
      case "success":
        onCreated(outcome.workspace);
        reset();
        onOpenChange(false);
        return;
      case "field_errors":
        setFieldErrors(outcome.fieldErrors);
        return;
      default:
        setFormError(FORM_ERRORS[outcome.status] ?? FORM_ERRORS.unexpected!);
    }
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!next) {
          reset();
        }
        onOpenChange(next);
      }}
    >
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>New {WORKSPACE_KIND_LABELS[kind]} workspace</DialogTitle>
          <DialogDescription>
            Optionally assign a manager now. You can add teams and participants
            after the workspace exists.
          </DialogDescription>
        </DialogHeader>

        <form
          aria-label="Create workspace"
          className="space-y-4"
          onSubmit={(event) => void handleSubmit(event)}
        >
          {formError ? (
            <Alert variant="destructive" aria-live="assertive">
              <AlertTitle>{formError}</AlertTitle>
            </Alert>
          ) : null}

          <div className="space-y-2">
            <Label htmlFor={ids.manager}>Manager (optional)</Label>
            <Select
              value={managerId ?? NO_MANAGER}
              onValueChange={(value) =>
                setManagerId(value === NO_MANAGER ? null : value)
              }
            >
              <SelectTrigger
                id={ids.manager}
                aria-invalid={fieldErrors.managerId ? true : undefined}
              >
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
            {fieldErrors.managerId ? (
              <p className="text-destructive text-sm">
                {fieldErrors.managerId}
              </p>
            ) : null}
          </div>

          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => {
                reset();
                onOpenChange(false);
              }}
              disabled={submitting}
            >
              Cancel
            </Button>
            <Button type="submit" disabled={submitting} aria-busy={submitting}>
              {submitting ? "Creating…" : "Create workspace"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
