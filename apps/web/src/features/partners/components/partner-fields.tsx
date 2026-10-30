"use client";

import { useId } from "react";

import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

import type { PartnerFieldValues } from "../lib/partners-outcome";

interface PartnerFieldsProps {
  values: PartnerFieldValues;
  errors: Partial<Record<keyof PartnerFieldValues, string>>;
  disabled?: boolean;
  onChange: <K extends keyof PartnerFieldValues>(
    key: K,
    value: PartnerFieldValues[K],
  ) => void;
}

export function PartnerFields({
  values,
  errors,
  disabled,
  onChange,
}: PartnerFieldsProps) {
  const ids = {
    organizationName: useId(),
    category: useId(),
    contactName: useId(),
    contactEmail: useId(),
    contactPhone: useId(),
    proposedContribution: useId(),
    followUpAt: useId(),
    notes: useId(),
  };

  return (
    <div className="space-y-4">
      <div className="space-y-2">
        <Label htmlFor={ids.organizationName}>Organization name</Label>
        <Input
          id={ids.organizationName}
          value={values.organizationName}
          disabled={disabled}
          required
          aria-invalid={errors.organizationName ? true : undefined}
          aria-describedby={
            errors.organizationName
              ? `${ids.organizationName}-error`
              : undefined
          }
          onChange={(event) => onChange("organizationName", event.target.value)}
        />
        {errors.organizationName ? (
          <p
            id={`${ids.organizationName}-error`}
            className="text-destructive text-sm"
          >
            {errors.organizationName}
          </p>
        ) : null}
      </div>

      <div className="space-y-2">
        <Label htmlFor={ids.category}>Category</Label>
        <Input
          id={ids.category}
          value={values.category}
          disabled={disabled}
          required
          placeholder="Media, Sponsor, Brand…"
          aria-invalid={errors.category ? true : undefined}
          onChange={(event) => onChange("category", event.target.value)}
        />
        {errors.category ? (
          <p className="text-destructive text-sm">{errors.category}</p>
        ) : null}
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-2">
          <Label htmlFor={ids.contactName}>Contact name (optional)</Label>
          <Input
            id={ids.contactName}
            value={values.contactName}
            disabled={disabled}
            onChange={(event) => onChange("contactName", event.target.value)}
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor={ids.contactPhone}>Contact phone (optional)</Label>
          <Input
            id={ids.contactPhone}
            value={values.contactPhone}
            disabled={disabled}
            onChange={(event) => onChange("contactPhone", event.target.value)}
          />
        </div>
      </div>

      <div className="space-y-2">
        <Label htmlFor={ids.contactEmail}>Contact email (optional)</Label>
        <Input
          id={ids.contactEmail}
          type="email"
          value={values.contactEmail}
          disabled={disabled}
          aria-invalid={errors.contactEmail ? true : undefined}
          onChange={(event) => onChange("contactEmail", event.target.value)}
        />
        {errors.contactEmail ? (
          <p className="text-destructive text-sm">{errors.contactEmail}</p>
        ) : null}
      </div>

      <div className="space-y-2">
        <Label htmlFor={ids.proposedContribution}>
          Proposed contribution (optional)
        </Label>
        <Input
          id={ids.proposedContribution}
          value={values.proposedContribution}
          disabled={disabled}
          placeholder="e.g. Co-branded media placement, 5,000 ETB in kind"
          onChange={(event) =>
            onChange("proposedContribution", event.target.value)
          }
        />
      </div>

      <div className="space-y-2">
        <Label htmlFor={ids.followUpAt}>Next follow-up (optional)</Label>
        <Input
          id={ids.followUpAt}
          type="date"
          value={values.followUpAt}
          disabled={disabled}
          onChange={(event) => onChange("followUpAt", event.target.value)}
        />
      </div>

      <div className="space-y-2">
        <Label htmlFor={ids.notes}>Notes (optional)</Label>
        <textarea
          id={ids.notes}
          rows={3}
          value={values.notes}
          disabled={disabled}
          className="border-input placeholder:text-muted-foreground focus-visible:ring-ring/50 flex w-full rounded-md border bg-transparent px-3 py-2 text-sm shadow-xs focus-visible:ring-3 focus-visible:outline-none disabled:cursor-not-allowed disabled:opacity-50"
          onChange={(event) => onChange("notes", event.target.value)}
        />
      </div>
    </div>
  );
}
