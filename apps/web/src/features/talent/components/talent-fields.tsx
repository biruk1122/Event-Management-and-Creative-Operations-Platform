"use client";

import { useId } from "react";

import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

import type { TalentFieldErrors, TalentFieldValues } from "../lib/talent-form";
import {
  TALENT_TYPE_LABELS,
  TALENT_TYPES,
  type TalentType,
} from "../lib/talent-types";

interface TalentFieldsProps {
  values: TalentFieldValues;
  errors: TalentFieldErrors;
  disabled?: boolean;
  onChange: <K extends keyof TalentFieldValues>(
    key: K,
    value: TalentFieldValues[K],
  ) => void;
}

/** The profile attributes shared by the create and edit forms. */
export function TalentFields({
  values,
  errors,
  disabled,
  onChange,
}: TalentFieldsProps) {
  const ids = {
    fullName: useId(),
    type: useId(),
    email: useId(),
    phone: useId(),
    biography: useId(),
  };

  return (
    <div className="space-y-4">
      <div className="space-y-2">
        <Label htmlFor={ids.fullName}>Full name</Label>
        <Input
          id={ids.fullName}
          value={values.fullName}
          disabled={disabled}
          required
          aria-invalid={errors.fullName ? true : undefined}
          aria-describedby={
            errors.fullName ? `${ids.fullName}-error` : undefined
          }
          onChange={(event) => onChange("fullName", event.target.value)}
        />
        {errors.fullName ? (
          <p id={`${ids.fullName}-error`} className="text-destructive text-sm">
            {errors.fullName}
          </p>
        ) : null}
      </div>

      <div className="space-y-2">
        <Label htmlFor={ids.type}>Type</Label>
        <Select
          value={values.type}
          disabled={disabled ?? false}
          onValueChange={(value) => onChange("type", value as TalentType)}
        >
          <SelectTrigger id={ids.type}>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {TALENT_TYPES.map((type) => (
              <SelectItem key={type} value={type}>
                {TALENT_TYPE_LABELS[type]}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div className="space-y-2">
        <Label htmlFor={ids.email}>Email</Label>
        <Input
          id={ids.email}
          type="email"
          value={values.email}
          disabled={disabled}
          aria-invalid={errors.email ? true : undefined}
          aria-describedby={errors.email ? `${ids.email}-error` : undefined}
          onChange={(event) => onChange("email", event.target.value)}
        />
        {errors.email ? (
          <p id={`${ids.email}-error`} className="text-destructive text-sm">
            {errors.email}
          </p>
        ) : null}
      </div>

      <div className="space-y-2">
        <Label htmlFor={ids.phone}>Phone</Label>
        <Input
          id={ids.phone}
          value={values.phone}
          disabled={disabled}
          onChange={(event) => onChange("phone", event.target.value)}
        />
      </div>

      <div className="space-y-2">
        <Label htmlFor={ids.biography}>Biography</Label>
        <textarea
          id={ids.biography}
          rows={3}
          value={values.biography}
          disabled={disabled}
          className="border-input placeholder:text-muted-foreground focus-visible:ring-ring/50 flex w-full rounded-md border bg-transparent px-3 py-2 text-sm shadow-xs focus-visible:ring-3 focus-visible:outline-none disabled:cursor-not-allowed disabled:opacity-50"
          onChange={(event) => onChange("biography", event.target.value)}
        />
      </div>
    </div>
  );
}
