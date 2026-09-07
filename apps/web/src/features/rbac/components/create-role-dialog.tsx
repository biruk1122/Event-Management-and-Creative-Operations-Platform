"use client";

import { RBAC_FAILURE_MESSAGES } from "../lib/rbac-outcome";

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
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

import type { CreateRole, RoleFormValues } from "../lib/rbac-outcome";
import type { Role } from "../lib/rbac-types";

const FORM_ERRORS: Record<string, string> = {
  ...RBAC_FAILURE_MESSAGES,
  name_conflict: "A role with that name already exists.",
  permission_denied: "You do not have permission to create a role.",
  unexpected: "We could not create the role. Try again.",
};

interface CreateRoleDialogProps {
  initialDraft?: RoleFormValues | undefined;
  onDraftChange?: (draft: RoleFormValues) => void;
  canCreate?: boolean;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onCreate: CreateRole;
  onCreated: (role: Role) => void;
}

export function CreateRoleDialog({
  initialDraft,
  onDraftChange,
  canCreate = true,
  open,
  onOpenChange,
  onCreate,
  onCreated,
}: CreateRoleDialogProps) {
  const nameId = useId();
  const descriptionId = useId();

  const [name, setName] = useState(initialDraft?.name ?? "");
  const [description, setDescription] = useState(
    initialDraft?.description ?? "",
  );
  const [descriptionError, setDescriptionError] = useState<string | null>(null);
  const [nameError, setNameError] = useState<string | null>(null);
  const [formError, setFormError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  function reset() {
    onDraftChange?.({ name: "", description: "" });
    setName("");
    setDescription("");
    setNameError(null);
    setDescriptionError(null);
    setFormError(null);
  }

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    if (!canCreate || submitting) return;
    setSubmitting(true);
    setNameError(null);
    setDescriptionError(null);
    setFormError(null);

    const outcome = await onCreate({ name, description });

    setSubmitting(false);

    switch (outcome.status) {
      case "success":
        onCreated(outcome.role);
        reset();
        onOpenChange(false);
        return;
      case "field_errors":
        setNameError(outcome.fieldErrors.name ?? null);
        setDescriptionError(outcome.fieldErrors.description ?? null);
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
      <DialogContent>
        <DialogHeader>
          <DialogTitle>New role</DialogTitle>
          <DialogDescription>
            Create a role, then configure its permission grants.
          </DialogDescription>
        </DialogHeader>

        <form
          aria-label="Create role"
          className="space-y-4"
          onSubmit={(event) => void handleSubmit(event)}
        >
          {!canCreate ? (
            <p role="alert">
              You do not currently have permission to create a role. Your input
              is kept here.
            </p>
          ) : null}
          {formError ? (
            <Alert variant="destructive" aria-live="assertive">
              <AlertTitle>{formError}</AlertTitle>
            </Alert>
          ) : null}

          <div className="space-y-2">
            <Label htmlFor={nameId}>Name</Label>
            <Input
              id={nameId}
              value={name}
              autoFocus
              required
              aria-invalid={nameError ? true : undefined}
              onChange={(event) => {
                setName(event.target.value);
                onDraftChange?.({ name: event.target.value, description });
              }}
            />
            {nameError ? (
              <p className="text-destructive text-sm">{nameError}</p>
            ) : null}
          </div>

          <div className="space-y-2">
            <Label htmlFor={descriptionId}>Description</Label>
            <Input
              id={descriptionId}
              aria-invalid={descriptionError ? true : undefined}
              value={description}
              onChange={(event) => {
                setDescription(event.target.value);
                onDraftChange?.({ name, description: event.target.value });
              }}
            />
          </div>

          {descriptionError ? (
            <p role="alert" className="text-destructive text-sm">
              {descriptionError}
            </p>
          ) : null}
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
            <Button
              type="submit"
              disabled={submitting || !canCreate}
              aria-busy={submitting}
            >
              {submitting ? "Creating..." : "Create role"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
