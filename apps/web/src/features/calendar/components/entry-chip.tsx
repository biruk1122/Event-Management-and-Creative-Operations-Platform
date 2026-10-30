"use client";

import { CalendarEntryIcon } from "./calendar-entry-icon";
import styles from "./calendar-presentation.module.css";

import { formatTime } from "../lib/calendar-date";
import {
  CALENDAR_ENTRY_TYPE_LABELS,
  type CalendarEntry,
} from "../lib/calendar-types";

export interface EntryChipProps {
  entry: CalendarEntry;
  onSelect: (entry: CalendarEntry) => void;
  /** Agenda/day views have room for the full title; month/week cells truncate. */
  compact?: boolean;
}

export function EntryChip({ entry, onSelect, compact }: EntryChipProps) {
  const time = `${formatTime(new Date(entry.startAt))}${entry.endAt ? ` – ${formatTime(new Date(entry.endAt))}` : ""}`;
  return (
    <button
      type="button"
      data-entry-item
      data-entry-type={entry.type}
      data-compact={compact || undefined}
      title={`${entry.title}, ${CALENDAR_ENTRY_TYPE_LABELS[entry.type]}, ${time}`}
      onClick={() => onSelect(entry)}
      className={styles.entryChip}
    >
      <span className={styles.entryIcon}>
        <CalendarEntryIcon type={entry.type} />
      </span>
      <span className={styles.entryContent}>
        <span className={styles.entryTitle}>{entry.title}</span>
        <span className={styles.entryTime}>
          <span className={compact ? "sr-only" : styles.entryType}>
            {CALENDAR_ENTRY_TYPE_LABELS[entry.type]}{" "}
          </span>
          {time}
        </span>
      </span>
    </button>
  );
}
