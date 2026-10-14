"use client";

import { useId } from "react";

import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

import {
  SUPPLIER_STATUS_LABELS,
  SUPPLIER_STATUSES,
  type SupplierStatus,
} from "../lib/suppliers-types";

const ALL = "ALL";

interface SuppliersFiltersProps {
  status: SupplierStatus | null;
  onStatusChange: (status: SupplierStatus | null) => void;
}

export function SuppliersFilters({
  status,
  onStatusChange,
}: SuppliersFiltersProps) {
  const statusId = useId();

  return (
    <div data-work-filters className="flex flex-col gap-3 sm:flex-row">
      <div className="space-y-2 sm:w-48">
        <Label htmlFor={statusId}>Status</Label>
        <Select
          value={status ?? ALL}
          onValueChange={(value) =>
            onStatusChange(value === ALL ? null : (value as SupplierStatus))
          }
        >
          <SelectTrigger id={statusId} aria-label="Filter by status">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={ALL}>All statuses</SelectItem>
            {SUPPLIER_STATUSES.map((value) => (
              <SelectItem key={value} value={value}>
                {SUPPLIER_STATUS_LABELS[value]}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
    </div>
  );
}
