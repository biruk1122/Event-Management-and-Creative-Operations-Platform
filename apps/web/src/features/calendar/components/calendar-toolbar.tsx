"use client";

import { Button } from "@/components/ui/button";
import { ChevronLeft, ChevronRight } from "lucide-react";
import styles from "./calendar-presentation.module.css";

import { formatRangeLabel } from "../lib/calendar-date";
import {
  CALENDAR_VIEW_MODES,
  CALENDAR_VIEW_MODE_LABELS,
  type CalendarViewMode,
} from "../lib/calendar-types";

export interface CalendarToolbarProps {
  view: CalendarViewMode;
  anchor: Date;
  /** ISO week number of the anchor date, shown above the title. */
  weekNumber: number;
  /** Entries falling in the anchor's month. */
  monthEntryCount: number;
  onChangeView: (view: CalendarViewMode) => void;
  onNavigate: (direction: "previous" | "next" | "today") => void;
}

/** Main header: the week and month, date navigation and the view switch. */
export function CalendarToolbar({
  view,
  anchor,
  weekNumber,
  monthEntryCount,
  onChangeView,
  onNavigate,
}: CalendarToolbarProps) {
  return (
    <div data-work-toolbar className={styles.plannerHeader}>
      <div className={styles.plannerTitle}>
        <p className={styles.kicker}>
          Week {weekNumber} · {monthEntryCount}{" "}
          {monthEntryCount === 1 ? "entry" : "entries"} this month
        </p>
        <h2 className={styles.monthTitle} aria-live="polite">
          {formatRangeLabel(view, anchor)}
        </h2>
      </div>
      <div className={styles.headerControls}>
        <div className={styles.navGroup}>
          <Button
            type="button"
            variant="ghost"
            size="icon"
            onClick={() => onNavigate("previous")}
            aria-label={`Previous ${view}`}
          >
            <ChevronLeft aria-hidden="true" />
          </Button>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={() => onNavigate("today")}
            className={styles.todayButton}
          >
            Today
          </Button>
          <Button
            type="button"
            variant="ghost"
            size="icon"
            onClick={() => onNavigate("next")}
            aria-label={`Next ${view}`}
          >
            <ChevronRight aria-hidden="true" />
          </Button>
        </div>
        <div
          role="group"
          aria-label="Calendar view"
          className={styles.viewSwitch}
        >
          {CALENDAR_VIEW_MODES.map((mode) => (
            <Button
              key={mode}
              type="button"
              size="sm"
              variant="ghost"
              aria-pressed={mode === view}
              data-selected={mode === view || undefined}
              onClick={() => onChangeView(mode)}
            >
              {CALENDAR_VIEW_MODE_LABELS[mode]}
            </Button>
          ))}
        </div>
      </div>
    </div>
  );
}
