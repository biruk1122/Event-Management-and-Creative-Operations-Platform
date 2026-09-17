"use client";

import { Plus } from "lucide-react";

import { Button } from "@/components/ui/button";

import { EntryChip } from "./entry-chip";
import {
  buildWeekDays,
  entriesForDay,
  formatDayHeading,
  isSameDay,
} from "../lib/calendar-date";
import type { CalendarEntry } from "../lib/calendar-types";

export interface WeekViewProps {
  anchor: Date;
  entries: readonly CalendarEntry[];
  onCreateAt: (date: Date) => void;
  onSelectEntry: (entry: CalendarEntry) => void;
}

export function WeekView({
  anchor,
  entries,
  onCreateAt,
  onSelectEntry,
}: WeekViewProps) {
  const days = buildWeekDays(anchor);
  const today = new Date();

  return (
    <div className="divide-border border-border grid grid-cols-1 divide-y rounded-xl border sm:grid-cols-7 sm:divide-x sm:divide-y-0">
      {days.map((day) => {
        const dayEntries = entriesForDay(entries, day);
        return (
          <div key={day.toISOString()} className="flex min-h-32 flex-col p-2">
            <div className="mb-2 flex items-center justify-between">
              <span
                className={`text-sm font-medium ${
                  isSameDay(day, today) ? "text-primary" : ""
                }`}
              >
                {formatDayHeading(day)}
              </span>
              <Button
                type="button"
                size="icon-xs"
                variant="ghost"
                onClick={() => onCreateAt(day)}
                aria-label={`Add an entry on ${day.toLocaleDateString()}`}
              >
                <Plus aria-hidden="true" />
              </Button>
            </div>
            <div className="flex flex-col gap-1">
              {dayEntries.length === 0 ? (
                <p className="text-muted-foreground text-xs">No entries</p>
              ) : (
                dayEntries.map((entry) => (
                  <EntryChip
                    key={entry.id}
                    entry={entry}
                    onSelect={onSelectEntry}
                  />
                ))
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}
