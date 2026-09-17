"use client";

import { Plus } from "lucide-react";

import { Button } from "@/components/ui/button";

import { EntryChip } from "./entry-chip";
import { buildMonthGrid, entriesForDay, isSameDay } from "../lib/calendar-date";
import type { CalendarEntry } from "../lib/calendar-types";

const WEEKDAY_LABELS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
const MAX_VISIBLE_PER_DAY = 3;

export interface MonthViewProps {
  anchor: Date;
  entries: readonly CalendarEntry[];
  /** Drills into day view for the clicked date. */
  onOpenDay: (date: Date) => void;
  /** Opens the create dialog pre-filled for the clicked date. */
  onCreateAt: (date: Date) => void;
  onSelectEntry: (entry: CalendarEntry) => void;
}

export function MonthView({
  anchor,
  entries,
  onOpenDay,
  onCreateAt,
  onSelectEntry,
}: MonthViewProps) {
  const weeks = buildMonthGrid(anchor);
  const today = new Date();

  return (
    <div className="border-border overflow-hidden rounded-xl border">
      <div className="bg-muted/50 grid grid-cols-7 text-center text-xs font-medium">
        {WEEKDAY_LABELS.map((label) => (
          <div key={label} className="py-2">
            {label}
          </div>
        ))}
      </div>
      <div className="divide-border grid grid-cols-7 divide-x divide-y">
        {weeks.flatMap((week) =>
          week.map((day) => {
            const dayEntries = entriesForDay(entries, day);
            const visible = dayEntries.slice(0, MAX_VISIBLE_PER_DAY);
            const overflow = dayEntries.length - visible.length;
            const inCurrentMonth = day.getMonth() === anchor.getMonth();
            return (
              <div
                key={day.toISOString()}
                className={`flex min-h-24 flex-col gap-1 p-1.5 ${
                  inCurrentMonth ? "" : "bg-muted/20"
                }`}
              >
                <div className="flex items-center justify-between">
                  <button
                    type="button"
                    onClick={() => onOpenDay(day)}
                    className={`focus-visible:ring-ring flex size-6 items-center justify-center rounded text-xs focus-visible:ring-2 focus-visible:outline-none ${
                      inCurrentMonth
                        ? "text-foreground"
                        : "text-muted-foreground"
                    } ${
                      isSameDay(day, today)
                        ? "bg-primary text-primary-foreground font-semibold"
                        : ""
                    }`}
                    aria-label={`Open ${day.toLocaleDateString()}`}
                  >
                    {day.getDate()}
                  </button>
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
                <div className="flex flex-col gap-0.5">
                  {visible.map((entry) => (
                    <EntryChip
                      key={entry.id}
                      entry={entry}
                      onSelect={onSelectEntry}
                    />
                  ))}
                  {overflow > 0 ? (
                    <button
                      type="button"
                      onClick={() => onOpenDay(day)}
                      className="text-muted-foreground hover:text-foreground px-1.5 text-left text-xs"
                    >
                      +{overflow} more
                    </button>
                  ) : null}
                </div>
              </div>
            );
          }),
        )}
      </div>
    </div>
  );
}
