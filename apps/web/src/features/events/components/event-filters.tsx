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
  EVENT_STATUS_LABELS,
  EVENT_STATUSES,
  EVENT_TYPE_LABELS,
  EVENT_TYPES,
  type EventStatus,
  type EventType,
} from "../lib/events-types";

const ALL = "ALL";

interface EventFiltersProps {
  status: EventStatus | null;
  eventType: EventType | null;
  search: string;
  onStatusChange: (status: EventStatus | null) => void;
  onTypeChange: (type: EventType | null) => void;
  onSearchChange: (search: string) => void;
}

export function EventFilters({
  status,
  eventType,
  search,
  onStatusChange,
  onTypeChange,
  onSearchChange,
}: EventFiltersProps) {
  const searchId = useId();

  return (
    <div
      data-work-filters
      className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between"
    >
      <div className="relative w-full md:max-w-sm">
        <Label htmlFor={searchId} className="sr-only">
          Search
        </Label>
        <Search
          aria-hidden="true"
          className="text-muted-foreground pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2"
        />
        <Input
          id={searchId}
          type="search"
          placeholder="Search events..."
          className="pl-9"
          value={search}
          onChange={(event) => onSearchChange(event.target.value)}
        />
      </div>

      <div className="flex flex-col gap-3 sm:flex-row">
        <Select
          value={status ?? ALL}
          onValueChange={(value) =>
            onStatusChange(value === ALL ? null : (value as EventStatus))
          }
        >
          <SelectTrigger aria-label="Filter by status" className="sm:w-44">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={ALL}>All statuses</SelectItem>
            {EVENT_STATUSES.map((value) => (
              <SelectItem key={value} value={value}>
                {EVENT_STATUS_LABELS[value]}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Select
          value={eventType ?? ALL}
          onValueChange={(value) =>
            onTypeChange(value === ALL ? null : (value as EventType))
          }
        >
          <SelectTrigger aria-label="Filter by type" className="sm:w-48">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={ALL}>All types</SelectItem>
            {EVENT_TYPES.map((value) => (
              <SelectItem key={value} value={value}>
                {EVENT_TYPE_LABELS[value]}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
    </div>
  );
}
