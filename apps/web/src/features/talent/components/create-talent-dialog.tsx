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

import { TalentFields } from "./talent-fields";
import {
  EMPTY_FIELDS,
  validateFields,
  type TalentFieldErrors,
  type TalentFieldValues,
} from "../lib/talent-form";
import type { CreateTalent } from "../lib/talent-outcome";
import {
  personName,
  type AssignableUser,
  type Talent,
} from "../lib/talent-types";

const NO_MANAGER = "NONE";

const FORM_ERRORS: Record<string, string> = {
  manager_not_found: "That user no longer exists. Pick another.",
  permission_denied: "You do not have permission to create a talent profile.",
  unexpected: "We could not create the talent profile. Try again.",
};

interface CreateTalentDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  managers: readonly AssignableUser[];
  onCreate: CreateTalent;
  onCreated: (talent: Talent) => void;
}

export function CreateTalentDialog({
  open,
  onOpenChange,
  managers,
  onCreate,
  onCreated,
}: CreateTalentDialogProps) {
  const managerId = useId();

  const [values, setValues] = useState<TalentFieldValues>(EMPTY_FIELDS);
  const [managerValue, setManagerValue] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<TalentFieldErrors>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  function reset() {
    setValues(EMPTY_FIELDS);
    setManagerValue(null);
    setFieldErrors({});
    setFormError(null);
  }

  function close() {
    reset();
    onOpenChange(false);
  }

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    setFormError(null);

    const localErrors = validateFields(values);
    if (Object.keys(localErrors).length > 0) {
      setFieldErrors(localErrors);
      return;
    }

    setSubmitting(true);
    setFieldErrors({});
    const outcome = await onCreate({ ...values, managerId: managerValue });
    setSubmitting(false);

    switch (outcome.status) {
      case "success":
        onCreated(outcome.talent);
        close();
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
        if (!next) reset();
        onOpenChange(next);
      }}
    >
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>New talent</DialogTitle>
          <DialogDescription>
            Give the profile a name and type. Contact details, biography, and a
            manager are optional and can be set later.
          </DialogDescription>
        </DialogHeader>

        <form
          aria-label="Create talent"
          className="space-y-4"
          noValidate
          onSubmit={(event) => void handleSubmit(event)}
        >
          {formError ? (
            <Alert variant="destructive" aria-live="assertive">
              <AlertTitle>{formError}</AlertTitle>
            </Alert>
          ) : null}

          <TalentFields
            values={values}
            errors={fieldErrors}
            disabled={submitting}
            onChange={(key, value) =>
              setValues((current) => ({ ...current, [key]: value }))
            }
          />

          <div className="space-y-2">
            <Label htmlFor={managerId}>Manager (optional)</Label>
            <Select
              value={managerValue ?? NO_MANAGER}
              disabled={submitting}
              onValueChange={(value) =>
                setManagerValue(value === NO_MANAGER ? null : value)
              }
            >
              <SelectTrigger id={managerId}>
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
              onClick={close}
              disabled={submitting}
            >
              Cancel
            </Button>
            <Button type="submit" disabled={submitting} aria-busy={submitting}>
              {submitting ? "Creating…" : "Create talent"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
