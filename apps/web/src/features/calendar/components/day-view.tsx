"use client";

import { Button } from "@/components/ui/button";

import { EntryChip } from "./entry-chip";
import { entriesForDay } from "../lib/calendar-date";
import type { CalendarEntry } from "../lib/calendar-types";

export interface DayViewProps {
  anchor: Date;
  entries: readonly CalendarEntry[];
  onCreateAt: (date: Date) => void;
  onSelectEntry: (entry: CalendarEntry) => void;
}

export function DayView({
  anchor,
  entries,
  onCreateAt,
  onSelectEntry,
}: DayViewProps) {
  const dayEntries = entriesForDay(entries, anchor);

  return (
    <div className="border-border space-y-3 rounded-xl border p-4">
      <div className="flex items-center justify-between">
        <p className="text-muted-foreground text-sm">
          {dayEntries.length} {dayEntries.length === 1 ? "entry" : "entries"}
        </p>
        <Button type="button" size="sm" onClick={() => onCreateAt(anchor)}>
          Add entry
        </Button>
      </div>
      {dayEntries.length === 0 ? (
        <p
          role="status"
          className="border-border text-muted-foreground rounded-xl border border-dashed p-6 text-center text-sm"
        >
          Nothing scheduled on this day.
        </p>
      ) : (
        <ol className="space-y-1">
          {dayEntries.map((entry) => (
            <li key={entry.id}>
              <EntryChip entry={entry} onSelect={onSelectEntry} />
            </li>
          ))}
        </ol>
      )}
    </div>
  );
}
