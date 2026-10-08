"use client";

import { Badge } from "@/components/ui/badge";

import { formatTime } from "../lib/calendar-date";
import {
  CALENDAR_ENTRY_TYPE_LABELS,
  type CalendarEntry,
} from "../lib/calendar-types";

const TYPE_VARIANT: Record<
  CalendarEntry["type"],
  "default" | "secondary" | "outline"
> = {
  EVENT: "default",
  TASK: "secondary",
  MEETING: "default",
  PROJECT: "secondary",
  PERSONAL: "outline",
  REMINDER: "outline",
};

export interface EntryChipProps {
  entry: CalendarEntry;
  onSelect: (entry: CalendarEntry) => void;
  /** Agenda/day views have room for the full title; month/week cells truncate. */
  compact?: boolean;
}

export function EntryChip({ entry, onSelect, compact }: EntryChipProps) {
  return (
    <button
      type="button"
      onClick={() => onSelect(entry)}
      className={`hover:bg-muted focus-visible:ring-ring flex w-full min-w-0 gap-1.5 rounded-md px-1.5 py-1 text-left text-xs focus-visible:ring-2 focus-visible:outline-none ${compact ? "flex-col items-start" : "flex-wrap items-center"}`}
    >
      <span
        className={
          compact
            ? "w-full truncate font-medium"
            : "max-w-full min-w-0 font-medium [overflow-wrap:anywhere]"
        }
      >
        {entry.title}
      </span>
      <span className="flex max-w-full flex-wrap items-center gap-1.5">
        <Badge variant={TYPE_VARIANT[entry.type]} className="shrink-0">
          {CALENDAR_ENTRY_TYPE_LABELS[entry.type]}
        </Badge>
        <span className={compact ? undefined : "text-muted-foreground"}>
          {formatTime(new Date(entry.startAt))}
        </span>
      </span>
    </button>
  );
}
