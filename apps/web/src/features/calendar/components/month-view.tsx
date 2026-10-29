"use client";

import { Plus } from "lucide-react";

import { Button } from "@/components/ui/button";

import { EntryChip } from "./entry-chip";
import { buildMonthGrid, entriesForDay, isSameDay } from "../lib/calendar-date";
import type { CalendarEntry } from "../lib/calendar-types";
import styles from "./calendar-presentation.module.css";

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
    <div
      className={styles.monthViewport}
      role="region"
      aria-label="Month calendar"
      tabIndex={0}
    >
      <div className={styles.monthCanvas}>
        <div className={styles.weekdays}>
          {WEEKDAY_LABELS.map((label) => (
            <div key={label} className="py-2">
              {label}
            </div>
          ))}
        </div>
        <div className={styles.monthGrid}>
          {weeks.flatMap((week) =>
            week.map((day) => {
              const dayEntries = entriesForDay(entries, day);
              const visible = dayEntries.slice(0, MAX_VISIBLE_PER_DAY);
              const overflow = dayEntries.length - visible.length;
              const inCurrentMonth = day.getMonth() === anchor.getMonth();
              return (
                <div
                  key={day.toISOString()}
                  className={styles.monthCell}
                  data-outside-month={!inCurrentMonth || undefined}
                  data-today={isSameDay(day, today) || undefined}
                >
                  <div className="flex items-center justify-between">
                    <button
                      type="button"
                      data-calendar-date
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
                      className={styles.dayAdd}
                    >
                      <Plus aria-hidden="true" />
                    </Button>
                  </div>
                  <div className="flex flex-col gap-0.5">
                    {visible.map((entry) => (
                      <EntryChip
                        compact
                        key={entry.id}
                        entry={entry}
                        onSelect={onSelectEntry}
                      />
                    ))}
                    {overflow > 0 ? (
                      <button
                        type="button"
                        data-calendar-more
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
    </div>
  );
}
