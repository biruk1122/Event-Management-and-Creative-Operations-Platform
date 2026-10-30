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
  PARTNER_STATUS_LABELS,
  PARTNER_STATUSES,
  type PartnerStatus,
} from "../lib/partners-types";

const ALL = "ALL";

interface PartnersFiltersProps {
  status: PartnerStatus | null;
  onStatusChange: (status: PartnerStatus | null) => void;
  search: string;
  onSearchChange: (search: string) => void;
}

export function PartnersFilters({
  status,
  onStatusChange,
  search,
  onSearchChange,
}: PartnersFiltersProps) {
  const statusId = useId();
  const searchId = useId();

  return (
    <div data-work-filters className="flex flex-col gap-3 sm:flex-row">
      <div className="space-y-2 sm:w-48">
        <Label htmlFor={statusId}>Status</Label>
        <Select
          value={status ?? ALL}
          onValueChange={(value) =>
            onStatusChange(value === ALL ? null : (value as PartnerStatus))
          }
        >
          <SelectTrigger id={statusId} aria-label="Filter by status">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={ALL}>All statuses</SelectItem>
            {PARTNER_STATUSES.map((value) => (
              <SelectItem key={value} value={value}>
                {PARTNER_STATUS_LABELS[value]}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      <div className="space-y-2 sm:flex-1">
        <Label htmlFor={searchId}>Search</Label>
        <Input
          id={searchId}
          value={search}
          placeholder="Search by organization name…"
          onChange={(event) => onSearchChange(event.target.value)}
        />
      </div>
    </div>
  );
}
