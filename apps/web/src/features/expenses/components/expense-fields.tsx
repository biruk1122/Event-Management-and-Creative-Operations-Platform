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

import {
  EXPENSE_CATEGORIES,
  EXPENSE_CATEGORY_LABELS,
  type ExpenseCategory,
} from "../lib/expenses-types";

const NO_SUPPLIER = "NONE";

/** The supplier choices the fields render; kept minimal on purpose. */
export interface SupplierOption {
  id: string;
  name: string;
}

/** The expense attributes shared by the create and edit forms. */
export interface ExpenseFieldValues {
  supplierId: string | null;
  category: ExpenseCategory;
  description: string;
  plannedAmount: string;
  actualAmount: string;
  currency: string;
}

interface ExpenseFieldsProps {
  values: ExpenseFieldValues;
  errors: Partial<Record<keyof ExpenseFieldValues, string>>;
  suppliers: readonly SupplierOption[];
  disabled?: boolean;
  onChange: <K extends keyof ExpenseFieldValues>(
    key: K,
    value: ExpenseFieldValues[K],
  ) => void;
}

export function ExpenseFields({
  values,
  errors,
  suppliers,
  disabled,
  onChange,
}: ExpenseFieldsProps) {
  const ids = {
    category: useId(),
    supplier: useId(),
    description: useId(),
    plannedAmount: useId(),
    actualAmount: useId(),
    currency: useId(),
  };

  return (
    <div className="space-y-4">
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-2">
          <Label htmlFor={ids.category}>Category</Label>
          <Select
            value={values.category}
            disabled={disabled ?? false}
            onValueChange={(value) =>
              onChange("category", value as ExpenseCategory)
            }
          >
            <SelectTrigger id={ids.category}>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {EXPENSE_CATEGORIES.map((category) => (
                <SelectItem key={category} value={category}>
                  {EXPENSE_CATEGORY_LABELS[category]}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-2">
          <Label htmlFor={ids.supplier}>Supplier (optional)</Label>
          <Select
            value={values.supplierId ?? NO_SUPPLIER}
            disabled={disabled ?? false}
            onValueChange={(value) =>
              onChange("supplierId", value === NO_SUPPLIER ? null : value)
            }
          >
            <SelectTrigger id={ids.supplier}>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={NO_SUPPLIER}>No supplier</SelectItem>
              {suppliers.map((supplier) => (
                <SelectItem key={supplier.id} value={supplier.id}>
                  {supplier.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          {errors.supplierId ? (
            <p className="text-destructive text-sm">{errors.supplierId}</p>
          ) : null}
        </div>
      </div>

      <div className="space-y-2">
        <Label htmlFor={ids.description}>Description</Label>
        <textarea
          id={ids.description}
          rows={3}
          value={values.description}
          disabled={disabled}
          required
          aria-invalid={errors.description ? true : undefined}
          aria-describedby={
            errors.description ? `${ids.description}-error` : undefined
          }
          className="border-input placeholder:text-muted-foreground focus-visible:ring-ring/50 flex w-full rounded-md border bg-transparent px-3 py-2 text-sm shadow-xs focus-visible:ring-3 focus-visible:outline-none disabled:cursor-not-allowed disabled:opacity-50"
          onChange={(event) => onChange("description", event.target.value)}
        />
        {errors.description ? (
          <p
            id={`${ids.description}-error`}
            className="text-destructive text-sm"
          >
            {errors.description}
          </p>
        ) : null}
      </div>

      <div className="grid gap-4 sm:grid-cols-3">
        <div className="space-y-2">
          <Label htmlFor={ids.plannedAmount}>Planned amount (optional)</Label>
          <Input
            id={ids.plannedAmount}
            type="number"
            inputMode="decimal"
            min="0"
            step="0.01"
            value={values.plannedAmount}
            disabled={disabled}
            aria-invalid={errors.plannedAmount ? true : undefined}
            onChange={(event) => onChange("plannedAmount", event.target.value)}
          />
          {errors.plannedAmount ? (
            <p className="text-destructive text-sm">{errors.plannedAmount}</p>
          ) : null}
        </div>
        <div className="space-y-2">
          <Label htmlFor={ids.actualAmount}>Actual amount</Label>
          <Input
            id={ids.actualAmount}
            type="number"
            inputMode="decimal"
            min="0"
            step="0.01"
            value={values.actualAmount}
            disabled={disabled}
            required
            aria-invalid={errors.actualAmount ? true : undefined}
            aria-describedby={
              errors.actualAmount ? `${ids.actualAmount}-error` : undefined
            }
            onChange={(event) => onChange("actualAmount", event.target.value)}
          />
          {errors.actualAmount ? (
            <p
              id={`${ids.actualAmount}-error`}
              className="text-destructive text-sm"
            >
              {errors.actualAmount}
            </p>
          ) : null}
        </div>
        <div className="space-y-2">
          <Label htmlFor={ids.currency}>Currency</Label>
          <Input
            id={ids.currency}
            value={values.currency}
            disabled={disabled}
            maxLength={3}
            required
            aria-invalid={errors.currency ? true : undefined}
            aria-describedby={
              errors.currency ? `${ids.currency}-error` : undefined
            }
            onChange={(event) =>
              onChange("currency", event.target.value.toUpperCase())
            }
          />
          {errors.currency ? (
            <p
              id={`${ids.currency}-error`}
              className="text-destructive text-sm"
            >
              {errors.currency}
            </p>
          ) : null}
        </div>
      </div>
    </div>
  );
}
