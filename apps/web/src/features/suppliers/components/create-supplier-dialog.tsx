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

import { SupplierFields } from "./supplier-fields";
import type {
  CreateSupplier,
  SupplierFieldValues,
} from "../lib/suppliers-outcome";
import type { Supplier } from "../lib/suppliers-types";

const FORM_ERRORS: Record<string, string> = {
  duplicate: "A supplier with this name already exists for this directory.",
  permission_denied: "You do not have permission to register a supplier.",
  unexpected: "We could not register the supplier. Try again.",
};

const EMPTY: SupplierFieldValues = {
  name: "",
  category: "",
  contactName: "",
  contactEmail: "",
  contactPhone: "",
  notes: "",
};

interface CreateSupplierDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onCreate: CreateSupplier;
  onCreated: (supplier: Supplier) => void;
}

export function CreateSupplierDialog({
  open,
  onOpenChange,
  onCreate,
  onCreated,
}: CreateSupplierDialogProps) {
  const [values, setValues] = useState<SupplierFieldValues>(EMPTY);
  const [fieldErrors, setFieldErrors] = useState<
    Partial<Record<keyof SupplierFieldValues, string>>
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

    if (values.name.trim() === "") {
      setFieldErrors({ name: "Enter a name." });
      return;
    }

    setSubmitting(true);
    setFieldErrors({});
    const outcome = await onCreate(values);
    setSubmitting(false);

    switch (outcome.status) {
      case "success":
        onCreated(outcome.supplier);
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
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>New supplier</DialogTitle>
          <DialogDescription>
            Give the supplier a name. Category and contact details are optional
            and can be set later.
          </DialogDescription>
        </DialogHeader>

        <form
          aria-label="Create supplier"
          className="space-y-4"
          noValidate
          onSubmit={(event) => void handleSubmit(event)}
        >
          {formError ? (
            <Alert variant="destructive" aria-live="assertive">
              <AlertTitle>{formError}</AlertTitle>
            </Alert>
          ) : null}

          <SupplierFields
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
              {submitting ? "Creating…" : "Create supplier"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
