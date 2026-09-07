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
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

import type {
  CreateDepartment,
  CreateDepartmentValues,
} from "../lib/departments-outcome";
import type { AssignableUser, Department } from "../lib/departments-types";
import { personName } from "../lib/departments-types";

const NO_MANAGER = "NONE";

const FORM_ERRORS: Record<string, string> = {
  name_conflict: "A department with that name already exists.",
  manager_not_found: "That user no longer exists. Pick another.",
  permission_denied: "You do not have permission to create a department.",
  unexpected: "We could not create the department. Try again.",
};

interface CreateDepartmentDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  managers: readonly AssignableUser[];
  onCreate: CreateDepartment;
  onCreated: (department: Department) => void;
}

const EMPTY: CreateDepartmentValues = {
  name: "",
  description: "",
  managerId: null,
};

export function CreateDepartmentDialog({
  open,
  onOpenChange,
  managers,
  onCreate,
  onCreated,
}: CreateDepartmentDialogProps) {
  const ids = {
    name: useId(),
    description: useId(),
    manager: useId(),
  };

  const [values, setValues] = useState<CreateDepartmentValues>(EMPTY);
  const [fieldErrors, setFieldErrors] = useState<
    Partial<Record<keyof CreateDepartmentValues, string>>
  >({});
  const [formError, setFormError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  function set<K extends keyof CreateDepartmentValues>(
    key: K,
    value: CreateDepartmentValues[K],
  ) {
    setValues((current) => ({ ...current, [key]: value }));
  }

  function reset() {
    setValues(EMPTY);
    setFieldErrors({});
    setFormError(null);
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
        onCreated(outcome.department);
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
          <DialogTitle>New department</DialogTitle>
          <DialogDescription>
            Name the unit and, optionally, assign a manager now. You can add
            employees after it exists.
          </DialogDescription>
        </DialogHeader>

        <form
          aria-label="Create department"
          className="space-y-4"
          onSubmit={(event) => void handleSubmit(event)}
        >
          {formError ? (
            <Alert variant="destructive" aria-live="assertive">
              <AlertTitle>{formError}</AlertTitle>
            </Alert>
          ) : null}

          <div className="space-y-2">
            <Label htmlFor={ids.name}>Name</Label>
            <Input
              id={ids.name}
              autoFocus
              required
              maxLength={120}
              value={values.name}
              aria-invalid={fieldErrors.name ? true : undefined}
              onChange={(event) => set("name", event.target.value)}
            />
            {fieldErrors.name ? (
              <p className="text-destructive text-sm">{fieldErrors.name}</p>
            ) : null}
          </div>

          <div className="space-y-2">
            <Label htmlFor={ids.description}>Description (optional)</Label>
            <Input
              id={ids.description}
              maxLength={1000}
              value={values.description}
              aria-invalid={fieldErrors.description ? true : undefined}
              onChange={(event) => set("description", event.target.value)}
            />
            {fieldErrors.description ? (
              <p className="text-destructive text-sm">
                {fieldErrors.description}
              </p>
            ) : null}
          </div>

          <div className="space-y-2">
            <Label htmlFor={ids.manager}>Manager (optional)</Label>
            <Select
              value={values.managerId ?? NO_MANAGER}
              onValueChange={(value) =>
                set("managerId", value === NO_MANAGER ? null : value)
              }
            >
              <SelectTrigger id={ids.manager}>
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
              {submitting ? "Creating…" : "Create department"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
