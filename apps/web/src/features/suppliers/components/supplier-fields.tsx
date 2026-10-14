"use client";

import { useId } from "react";

import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

import type { SupplierFieldValues } from "../lib/suppliers-outcome";

interface SupplierFieldsProps {
  values: SupplierFieldValues;
  errors: Partial<Record<keyof SupplierFieldValues, string>>;
  disabled?: boolean;
  onChange: <K extends keyof SupplierFieldValues>(
    key: K,
    value: SupplierFieldValues[K],
  ) => void;
}

export function SupplierFields({
  values,
  errors,
  disabled,
  onChange,
}: SupplierFieldsProps) {
  const ids = {
    name: useId(),
    category: useId(),
    contactName: useId(),
    contactEmail: useId(),
    contactPhone: useId(),
    notes: useId(),
  };

  return (
    <div className="space-y-4">
      <div className="space-y-2">
        <Label htmlFor={ids.name}>Name</Label>
        <Input
          id={ids.name}
          value={values.name}
          disabled={disabled}
          required
          aria-invalid={errors.name ? true : undefined}
          aria-describedby={errors.name ? `${ids.name}-error` : undefined}
          onChange={(event) => onChange("name", event.target.value)}
        />
        {errors.name ? (
          <p id={`${ids.name}-error`} className="text-destructive text-sm">
            {errors.name}
          </p>
        ) : null}
      </div>

      <div className="space-y-2">
        <Label htmlFor={ids.category}>Category (optional)</Label>
        <Input
          id={ids.category}
          value={values.category}
          disabled={disabled}
          placeholder="Catering, Venue, Equipment…"
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
