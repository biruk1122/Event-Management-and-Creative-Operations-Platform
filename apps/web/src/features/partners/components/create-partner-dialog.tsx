"use client";

import { useState, type FormEvent } from "react";

import { Alert, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { WorkDialogContent as DialogContent } from "@/components/ui/work-dialog-content";

import { PartnerFields } from "./partner-fields";
import type {
  CreatePartner,
  PartnerFieldValues,
} from "../lib/partners-outcome";
import type { Partner } from "../lib/partners-types";

const FORM_ERRORS: Record<string, string> = {
  not_found: "The linked campaign or event could not be found.",
  permission_denied: "You do not have permission to register a partner.",
  unexpected: "We could not register the partner. Try again.",
};

const EMPTY: PartnerFieldValues = {
  organizationName: "",
  category: "",
  contactName: "",
  contactEmail: "",
  contactPhone: "",
  proposedContribution: "",
  notes: "",
  followUpAt: "",
};

interface CreatePartnerDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onCreate: CreatePartner;
  onCreated: (partner: Partner) => void;
}

export function CreatePartnerDialog({
  open,
  onOpenChange,
  onCreate,
  onCreated,
}: CreatePartnerDialogProps) {
  const [values, setValues] = useState<PartnerFieldValues>(EMPTY);
  const [fieldErrors, setFieldErrors] = useState<
    Partial<Record<keyof PartnerFieldValues, string>>
  >({});
  const [formError, setFormError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  function reset() {
    setValues(EMPTY);
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

    const errors: Partial<Record<keyof PartnerFieldValues, string>> = {};
    if (values.organizationName.trim() === "")
      errors.organizationName = "Enter an organization name.";
    if (values.category.trim() === "") errors.category = "Enter a category.";
    if (Object.keys(errors).length > 0) {
      setFieldErrors(errors);
      return;
    }

    setSubmitting(true);
    setFieldErrors({});
    const outcome = await onCreate(values);
    setSubmitting(false);

    switch (outcome.status) {
      case "success":
        onCreated(outcome.partner);
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
          <DialogTitle>New partner</DialogTitle>
          <DialogDescription>
            Register a sponsorship, media, or strategic-partner opportunity.
            Contact details and contribution are optional and can be set later.
          </DialogDescription>
        </DialogHeader>

        <form
          aria-label="Create partner"
          className="space-y-4"
          noValidate
          onSubmit={(event) => void handleSubmit(event)}
        >
          {formError ? (
            <Alert variant="destructive" aria-live="assertive">
              <AlertTitle>{formError}</AlertTitle>
            </Alert>
          ) : null}

          <PartnerFields
            values={values}
            errors={fieldErrors}
            disabled={submitting}
            onChange={(key, value) =>
              setValues((current) => ({ ...current, [key]: value }))
            }
          />

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
              {submitting ? "Creating…" : "Create partner"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
