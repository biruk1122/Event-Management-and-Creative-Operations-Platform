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
  const statusId = useId();
  const typeId = useId();
  const searchId = useId();

  return (
    <div className="flex flex-col gap-3 sm:flex-row sm:items-end">
      <div className="space-y-2 sm:w-44">
        <Label htmlFor={statusId}>Status</Label>
        <Select
          value={status ?? ALL}
          onValueChange={(value) =>
            onStatusChange(value === ALL ? null : (value as EventStatus))
          }
        >
          <SelectTrigger id={statusId} aria-label="Filter by status">
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
      </div>

      <div className="space-y-2 sm:w-48">
        <Label htmlFor={typeId}>Type</Label>
        <Select
          value={eventType ?? ALL}
          onValueChange={(value) =>
            onTypeChange(value === ALL ? null : (value as EventType))
          }
        >
          <SelectTrigger id={typeId} aria-label="Filter by type">
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
            placeholder="Event name"
            className="pl-9"
            value={search}
            onChange={(event) => onSearchChange(event.target.value)}
          />
        </div>
      </div>
    </div>
  );
}
