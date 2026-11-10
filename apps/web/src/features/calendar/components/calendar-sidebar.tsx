"use client";

import { CalendarDays, Plus } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";

import { CalendarEntryIcon } from "./calendar-entry-icon";
import styles from "./calendar-presentation.module.css";
import {
  buildMonthGrid,
  entriesForDay,
  formatTime,
  isSameDay,
} from "../lib/calendar-date";
import {
  CALENDAR_ENTRY_TYPES,
  CALENDAR_ENTRY_TYPE_LABELS,
  type CalendarEntry,
  type CalendarEntryType,
} from "../lib/calendar-types";

const WEEKDAY_INITIALS = ["M", "T", "W", "T", "F", "S", "S"];

export interface CalendarSidebarProps {
  anchor: Date;
  /** Every entry loaded for the current range; drives the mini month and counts. */
  entries: readonly CalendarEntry[];
  activeTypes: ReadonlySet<CalendarEntryType>;
  onToggleType: (type: CalendarEntryType) => void;
  onCreate: () => void;
  /** Jumps the main view to the chosen date, keeping the current view mode. */
  onSelectDate: (date: Date) => void;
  onSelectEntry: (entry: CalendarEntry) => void;
}

export function CalendarSidebar({
  anchor,
  entries,
  activeTypes,
  onToggleType,
  onCreate,
  onSelectDate,
  onSelectEntry,
}: CalendarSidebarProps) {
  const today = new Date();
  const weeks = buildMonthGrid(anchor);
  const todayEntries = entries
    .filter((entry) => isSameDay(new Date(entry.startAt), today))
    .sort(
      (a, b) => new Date(a.startAt).getTime() - new Date(b.startAt).getTime(),
    );

  return (
    <aside className={styles.sidebar} aria-label="Calendar sidebar">
      <div className={styles.brand}>
        <span className={styles.brandIcon} aria-hidden="true">
          <CalendarDays />
        </span>
        <span className={styles.brandName}>Calendar</span>
      </div>

      <Button type="button" className={styles.newButton} onClick={onCreate}>
        <Plus aria-hidden="true" />
        New entry
      </Button>

      <section className={styles.panel} aria-label="Mini calendar">
        <div className={styles.miniHeader}>
          <span>
            {anchor.toLocaleDateString(undefined, {
              month: "long",
              year: "numeric",
            })}
          </span>
        </div>
        <div className={styles.miniWeekdays} aria-hidden="true">
          {WEEKDAY_INITIALS.map((label, index) => (
            <span key={`${label}-${index}`}>{label}</span>
          ))}
        </div>
        <div className={styles.miniGrid}>
          {weeks.flat().map((day) => {
            const inMonth = day.getMonth() === anchor.getMonth();
            const isToday = isSameDay(day, today);
            const dayEntries = entriesForDay(entries, day);
            const dot = dayEntries[0]?.type;
            return (
              <button
                key={day.toISOString()}
                type="button"
                className={styles.miniDay}
                data-outside-month={!inMonth || undefined}
                data-today={isToday || undefined}
                aria-label={day.toLocaleDateString(undefined, {
                  weekday: "long",
                  month: "long",
                  day: "numeric",
                })}
                onClick={() => onSelectDate(day)}
              >
                <span className={styles.miniNumber}>{day.getDate()}</span>
                <span
                  className={styles.miniDot}
                  data-entry-type={dot}
                  aria-hidden="true"
                />
              </button>
            );
          })}
        </div>
      </section>

      <section className={styles.panel} aria-label="My calendars">
        <h2 className={styles.panelTitle}>My calendars</h2>
        <div className={styles.calendarList}>
          {CALENDAR_ENTRY_TYPES.map((type) => {
            const count = entries.filter((entry) => entry.type === type).length;
            return (
              <label
                key={type}
                data-calendar-type={type}
                data-entry-type={type}
                className={styles.calendarRow}
              >
                <Checkbox
                  checked={activeTypes.has(type)}
                  onCheckedChange={() => onToggleType(type)}
                  aria-label={`${CALENDAR_ENTRY_TYPE_LABELS[type]} entries`}
                />
                <CalendarEntryIcon type={type} />
                <span className={styles.calendarName}>
                  {CALENDAR_ENTRY_TYPE_LABELS[type]}
                </span>
                <span className={styles.calendarCount}>{count}</span>
              </label>
            );
          })}
        </div>
      </section>

      <section className={styles.todayPanel} aria-label="Today's schedule">
        <div className={styles.todayHeader}>
          <span>
            Today ·{" "}
            {today.toLocaleDateString(undefined, {
              weekday: "short",
              day: "numeric",
            })}
          </span>
        </div>
        {todayEntries.length === 0 ? (
          <p className={styles.todayEmpty}>Nothing scheduled today.</p>
        ) : (
          <ul className={styles.todayList}>
            {todayEntries.map((entry) => (
              <li key={entry.id}>
                <button
                  type="button"
                  className={styles.todayItem}
                  onClick={() => onSelectEntry(entry)}
                >
                  <span className={styles.todayTime}>
                    {formatTime(new Date(entry.startAt))}
                  </span>
                  <span className={styles.todayText}>
                    <span className={styles.todayTitle}>{entry.title}</span>
                    <span className={styles.todaySub}>
                      {CALENDAR_ENTRY_TYPE_LABELS[entry.type]}
                    </span>
                  </span>
                </button>
              </li>
            ))}
          </ul>
        )}
      </section>
    </aside>
  );
}
