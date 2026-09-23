"use client";

import { useId, useState, type FormEvent } from "react";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export interface ProductionValues {
  name: string;
  productionType: string;
  description: string;
  startAt: string;
  endAt: string;
  deadlineAt: string;
}

const empty: ProductionValues = {
  name: "",
  productionType: "",
  description: "",
  startAt: "",
  endAt: "",
  deadlineAt: "",
};

export function ProductionForm({
  open,
  onOpenChange,
  initial,
  onSave,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  initial?: ProductionValues;
  onSave: (values: ProductionValues) => Promise<void>;
}) {
  const id = useId();
  const [values, setValues] = useState<ProductionValues>(initial ?? empty);
  const [errors, setErrors] = useState<
    Partial<Record<keyof ProductionValues, string>>
  >({});
  const [failure, setFailure] = useState("");
  const [saving, setSaving] = useState(false);
  const field = (key: keyof ProductionValues, value: string) => {
    setValues((current) => ({ ...current, [key]: value }));
    setErrors((current) => ({ ...current, [key]: undefined }));
  };

  async function submit(event: FormEvent) {
    event.preventDefault();
    const next: typeof errors = {};
    if (!values.name.trim()) next.name = "Enter a name.";
    if (!values.productionType.trim())
      next.productionType = "Enter a production type.";
    if (values.startAt && values.endAt && values.endAt < values.startAt)
      next.endAt = "End must follow start.";
    if (
      values.startAt &&
      values.deadlineAt &&
      values.deadlineAt < values.startAt
    )
      next.deadlineAt = "Deadline must follow start.";
    setErrors(next);
    if (Object.keys(next).length) return;
    setSaving(true);
    setFailure("");
    try {
      await onSave(values);
      onOpenChange(false);
      setValues(empty);
    } catch {
      setFailure("We could not save this production. Try again.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!saving) onOpenChange(next);
      }}
    >
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-xl">
        <DialogHeader>
          <DialogTitle>
            {initial ? "Edit production" : "New production"}
          </DialogTitle>
          <DialogDescription>
            Production details can be refined as work progresses.
          </DialogDescription>
        </DialogHeader>
        <form
          className="space-y-4"
          onSubmit={(event) => void submit(event)}
          noValidate
        >
          {failure ? (
            <p role="alert" className="text-destructive text-sm">
              {failure}
            </p>
          ) : null}
          {(
            [
              ["name", "Name", "text"],
              ["productionType", "Production type", "text"],
              ["startAt", "Start date", "date"],
              ["endAt", "End date", "date"],
              ["deadlineAt", "Deadline", "date"],
            ] as const
          ).map(([key, label, type]) => (
            <div key={key} className="space-y-1">
              <Label htmlFor={`${id}-${key}`}>{label}</Label>
              <Input
                id={`${id}-${key}`}
                type={type}
                value={values[key]}
                disabled={saving}
                required={key === "name" || key === "productionType"}
                maxLength={
                  key === "name"
                    ? 200
                    : key === "productionType"
                      ? 100
                      : undefined
                }
                aria-invalid={Boolean(errors[key])}
                aria-describedby={
                  errors[key] ? `${id}-${key}-error` : undefined
                }
                onChange={(event) => field(key, event.target.value)}
              />
              {errors[key] ? (
                <p
                  id={`${id}-${key}-error`}
                  className="text-destructive text-sm"
                >
                  {errors[key]}
                </p>
              ) : null}
            </div>
          ))}
          <div className="space-y-1">
            <Label htmlFor={`${id}-description`}>Description</Label>
            <textarea
              id={`${id}-description`}
              value={values.description}
              maxLength={2000}
              disabled={saving}
              rows={3}
              onChange={(event) => field("description", event.target.value)}
              className="border-input focus-visible:ring-ring/50 w-full rounded-md border bg-transparent px-3 py-2 text-sm focus-visible:ring-3 focus-visible:outline-none"
            />
          </div>
          <div className="flex justify-end gap-2">
            <Button
              type="button"
              variant="outline"
              disabled={saving}
              onClick={() => onOpenChange(false)}
            >
              Cancel
            </Button>
            <Button type="submit" disabled={saving} aria-busy={saving}>
              {saving ? "Saving…" : "Save production"}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
