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

import { CampaignFields } from "./campaign-fields";
import {
  EMPTY_FIELDS,
  toFormValues,
  validateFields,
  type CampaignFieldErrors,
  type CampaignFieldValues,
} from "../lib/campaigns-form";
import type { CreateCampaign } from "../lib/campaigns-outcome";
import {
  personName,
  type AssignableEvent,
  type AssignableUser,
  type Campaign,
} from "../lib/campaigns-types";

const NO_MANAGER = "NONE";

const FORM_ERRORS: Record<string, string> = {
  manager_not_found: "That user no longer exists. Pick another.",
  event_not_found: "That event no longer exists. Pick another.",
  subject_conflict: "Choose either an event or a product, not both.",
  permission_denied: "You do not have permission to create a campaign.",
  unexpected: "We could not create the campaign. Try again.",
};

interface CreateCampaignDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  managers: readonly AssignableUser[];
  events: readonly AssignableEvent[];
  onCreate: CreateCampaign;
  onCreated: (campaign: Campaign) => void;
}

export function CreateCampaignDialog({
  open,
  onOpenChange,
  managers,
  events,
  onCreate,
  onCreated,
}: CreateCampaignDialogProps) {
  const managerId = useId();

  const [values, setValues] = useState<CampaignFieldValues>(EMPTY_FIELDS);
  const [managerValue, setManagerValue] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<CampaignFieldErrors>({});
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
    const outcome = await onCreate({
      ...toFormValues(values),
      managerId: managerValue,
    });
    setSubmitting(false);

    switch (outcome.status) {
      case "success":
        onCreated(outcome.campaign);
        close();
        return;
      case "field_errors":
        setFieldErrors(outcome.fieldErrors);
        return;
      case "schedule_invalid":
        setFieldErrors({ endAt: "The end must be on or after the start." });
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
          <DialogTitle>New campaign</DialogTitle>
          <DialogDescription>
            Give the campaign a name and type. Audience, schedule, a related
            event or product, and a manager are optional and can be set later.
          </DialogDescription>
        </DialogHeader>

        <form
          aria-label="Create campaign"
          className="space-y-4"
          noValidate
          onSubmit={(event) => void handleSubmit(event)}
        >
          {formError ? (
            <Alert variant="destructive" aria-live="assertive">
              <AlertTitle>{formError}</AlertTitle>
            </Alert>
          ) : null}

          <CampaignFields
            values={values}
            errors={fieldErrors}
            disabled={submitting}
            events={events}
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
              {submitting ? "Creating…" : "Create campaign"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
