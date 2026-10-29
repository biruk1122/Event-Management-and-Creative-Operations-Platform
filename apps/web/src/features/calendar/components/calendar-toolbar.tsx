"use client";

import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { CalendarEntryIcon } from "./calendar-entry-icon";
import styles from "./calendar-presentation.module.css";

import { formatRangeLabel, resolvedTimeZone } from "../lib/calendar-date";
import {
  CALENDAR_ENTRY_TYPES,
  CALENDAR_ENTRY_TYPE_LABELS,
  CALENDAR_VIEW_MODES,
  CALENDAR_VIEW_MODE_LABELS,
  type CalendarEntryType,
  type CalendarViewMode,
} from "../lib/calendar-types";

export interface CalendarToolbarProps {
  view: CalendarViewMode;
  anchor: Date;
  activeTypes: ReadonlySet<CalendarEntryType>;
  onChangeView: (view: CalendarViewMode) => void;
  onNavigate: (direction: "previous" | "next" | "today") => void;
  onToggleType: (type: CalendarEntryType) => void;
}

export function CalendarToolbar({
  view,
  anchor,
  activeTypes,
  onChangeView,
  onNavigate,
  onToggleType,
}: CalendarToolbarProps) {
  return (
    <div data-work-toolbar className={styles.toolbar}>
      <div className={styles.toolbarTop}>
        <div className={styles.rangeNavigation}>
          <div className={styles.dateControls}>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => onNavigate("previous")}
              aria-label={`Previous ${view}`}
            >
              <ChevronLeft aria-hidden="true" />
            </Button>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => onNavigate("today")}
            >
              Today
            </Button>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => onNavigate("next")}
              aria-label={`Next ${view}`}
            >
              <ChevronRight aria-hidden="true" />
            </Button>
          </div>
          <h2 className="text-base font-semibold" aria-live="polite">
            {formatRangeLabel(view, anchor)}
          </h2>
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
              variant={mode === view ? "default" : "ghost"}
              aria-pressed={mode === view}
              onClick={() => onChangeView(mode)}
            >
              {CALENDAR_VIEW_MODE_LABELS[mode]}
            </Button>
          ))}
        </div>
      </div>

      <fieldset className={styles.filters}>
        <legend className="sr-only">Show</legend>
        <span aria-hidden="true" className={styles.filterLabel}>
          Show
        </span>
        {CALENDAR_ENTRY_TYPES.map((type) => (
          <label
            key={type}
            data-calendar-type={type}
            className={styles.typeFilter}
          >
            <Checkbox
              checked={activeTypes.has(type)}
              onCheckedChange={() => onToggleType(type)}
              aria-label={`${CALENDAR_ENTRY_TYPE_LABELS[type]} entries`}
            />
            <CalendarEntryIcon type={type} />
            {CALENDAR_ENTRY_TYPE_LABELS[type]}
          </label>
        ))}
      </fieldset>
      <p className={styles.timezone}>Times shown in {resolvedTimeZone()}</p>
    </div>
  );
}
