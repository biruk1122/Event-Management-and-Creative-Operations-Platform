"use client";

import { EntryChip } from "./entry-chip";
import {
  entriesInRange,
  formatFullDate,
  isSameDay,
  rangeForView,
} from "../lib/calendar-date";
import type { CalendarEntry } from "../lib/calendar-types";

export interface AgendaViewProps {
  anchor: Date;
  entries: readonly CalendarEntry[];
  onSelectEntry: (entry: CalendarEntry) => void;
}

export function AgendaView({
  anchor,
  entries,
  onSelectEntry,
}: AgendaViewProps) {
  const { from, to } = rangeForView("month", anchor);
  const ordered = entriesInRange(entries, from, to);

  if (ordered.length === 0) {
    return (
      <p
        role="status"
        className="border-border text-muted-foreground rounded-xl border border-dashed p-6 text-center text-sm"
      >
        Nothing scheduled this month.
      </p>
    );
  }

  const groups: { day: Date; items: CalendarEntry[] }[] = [];
  for (const entry of ordered) {
    const day = new Date(entry.startAt);
    const group = groups.find((candidate) => isSameDay(candidate.day, day));
    if (group) group.items.push(entry);
    else groups.push({ day, items: [entry] });
  }

  return (
    <ol className="divide-border border-border divide-y rounded-xl border">
      {groups.map((group) => (
        <li key={group.day.toISOString()} className="p-3">
          <p className="mb-2 text-sm font-medium">
            {formatFullDate(group.day)}
          </p>
          <ul className="space-y-1">
            {group.items.map((entry) => (
              <li key={entry.id}>
                <EntryChip entry={entry} onSelect={onSelectEntry} compact />
              </li>
            ))}
          </ul>
        </li>
      ))}
    </ol>
  );
}
