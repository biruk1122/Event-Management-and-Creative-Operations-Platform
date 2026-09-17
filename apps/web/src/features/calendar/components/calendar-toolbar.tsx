"use client";

import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";

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
  onCreate: () => void;
}

export function CalendarToolbar({
  view,
  anchor,
  activeTypes,
  onChangeView,
  onNavigate,
  onToggleType,
  onCreate,
}: CalendarToolbarProps) {
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => onNavigate("previous")}
            aria-label={`Previous ${view}`}
          >
            ‹
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
            ›
          </Button>
          <h2 className="ml-2 text-lg font-semibold" aria-live="polite">
            {formatRangeLabel(view, anchor)}
          </h2>
        </div>
        <Button type="button" onClick={onCreate}>
          Add entry
        </Button>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-3">
        <div
          role="group"
          aria-label="Calendar view"
          className="border-border inline-flex rounded-lg border p-1"
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
        <p className="text-muted-foreground text-sm">
          Times shown in {resolvedTimeZone()}
        </p>
      </div>

      <fieldset className="flex flex-wrap items-center gap-4">
        <legend className="text-muted-foreground text-sm font-medium">
          Show
        </legend>
        {CALENDAR_ENTRY_TYPES.map((type) => (
          <label key={type} className="flex items-center gap-2 text-sm">
            <Checkbox
              checked={activeTypes.has(type)}
              onCheckedChange={() => onToggleType(type)}
              aria-label={`${CALENDAR_ENTRY_TYPE_LABELS[type]} entries`}
            />
            {CALENDAR_ENTRY_TYPE_LABELS[type]}
          </label>
        ))}
      </fieldset>
    </div>
  );
}
