"use client";

import { useId } from "react";
import { Search } from "lucide-react";

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
  personName,
  TALENT_AVAILABILITIES,
  TALENT_AVAILABILITY_LABELS,
  TALENT_TYPE_LABELS,
  TALENT_TYPES,
  type AssignableUser,
  type TalentAvailability,
  type TalentType,
} from "../lib/talent-types";

const ALL = "ALL";

interface TalentFiltersProps {
  type: TalentType | null;
  availability: TalentAvailability | null;
  managerId: string | null;
  search: string;
  managers: readonly AssignableUser[];
  onTypeChange: (type: TalentType | null) => void;
  onAvailabilityChange: (availability: TalentAvailability | null) => void;
  onManagerChange: (managerId: string | null) => void;
  onSearchChange: (search: string) => void;
}

export function TalentFilters({
  type,
  availability,
  managerId,
  search,
  managers,
  onTypeChange,
  onAvailabilityChange,
  onManagerChange,
  onSearchChange,
}: TalentFiltersProps) {
  const typeId = useId();
  const availabilityId = useId();
  const managerId_ = useId();
  const searchId = useId();

  return (
    <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-end">
      <div className="space-y-2 sm:w-44">
        <Label htmlFor={typeId}>Type</Label>
        <Select
          value={type ?? ALL}
          onValueChange={(value) =>
            onTypeChange(value === ALL ? null : (value as TalentType))
          }
        >
          <SelectTrigger id={typeId} aria-label="Filter by type">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={ALL}>All types</SelectItem>
            {TALENT_TYPES.map((value) => (
              <SelectItem key={value} value={value}>
                {TALENT_TYPE_LABELS[value]}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div className="space-y-2 sm:w-44">
        <Label htmlFor={availabilityId}>Availability</Label>
        <Select
          value={availability ?? ALL}
          onValueChange={(value) =>
            onAvailabilityChange(
              value === ALL ? null : (value as TalentAvailability),
            )
          }
        >
          <SelectTrigger
            id={availabilityId}
            aria-label="Filter by availability"
          >
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={ALL}>All availability</SelectItem>
            {TALENT_AVAILABILITIES.map((value) => (
              <SelectItem key={value} value={value}>
                {TALENT_AVAILABILITY_LABELS[value]}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div className="space-y-2 sm:w-48">
        <Label htmlFor={managerId_}>Manager</Label>
        <Select
          value={managerId ?? ALL}
          onValueChange={(value) =>
            onManagerChange(value === ALL ? null : value)
          }
        >
          <SelectTrigger id={managerId_} aria-label="Filter by manager">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={ALL}>All managers</SelectItem>
            {managers.map((manager) => (
              <SelectItem key={manager.id} value={manager.id}>
                {personName(manager)}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div className="flex-1 space-y-2">
        <Label htmlFor={searchId}>Search</Label>
        <div className="relative">
          <Search
            aria-hidden="true"
            className="text-muted-foreground pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2"
          />
          <Input
            id={searchId}
            type="search"
            placeholder="Talent name"
            className="pl-9"
            value={search}
            onChange={(event) => onSearchChange(event.target.value)}
          />
        </div>
      </div>
    </div>
  );
}
