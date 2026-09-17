import type { components } from "@event-platform/api-client";

export const CALENDAR_ENTRY_TYPES = [
  "EVENT",
  "TASK",
  "MEETING",
  "PROJECT",
  "PERSONAL",
  "REMINDER",
] as const;

export type CalendarEntryType = (typeof CALENDAR_ENTRY_TYPES)[number];

/** Only these two types are calendar-owned mutation resources; EVENT, TASK,
 * and PROJECT are read-only projections aggregated from their own modules
 * (calendar.controller.ts's own doc comment). */
export const MUTABLE_CALENDAR_ENTRY_TYPES = ["PERSONAL", "REMINDER"] as const;
export type MutableCalendarEntryType =
  (typeof MUTABLE_CALENDAR_ENTRY_TYPES)[number];

export function isMutableCalendarEntryType(
  type: CalendarEntryType,
): type is MutableCalendarEntryType {
  return (MUTABLE_CALENDAR_ENTRY_TYPES as readonly string[]).includes(type);
}

export const CALENDAR_ENTRY_TYPE_LABELS: Record<CalendarEntryType, string> = {
  EVENT: "Event",
  TASK: "Task",
  MEETING: "Meeting",
  PROJECT: "Project",
  PERSONAL: "Personal",
  REMINDER: "Reminder",
};

export type CalendarEntry = components["schemas"]["CalendarEntryResponse"];
export type CalendarFeedResponse =
  components["schemas"]["CalendarFeedResponse"];

export const CALENDAR_VIEW_MODES = ["month", "week", "day", "agenda"] as const;
export type CalendarViewMode = (typeof CALENDAR_VIEW_MODES)[number];

export const CALENDAR_VIEW_MODE_LABELS: Record<CalendarViewMode, string> = {
  month: "Month",
  week: "Week",
  day: "Day",
  agenda: "Agenda",
};

/** The server enforces at most a 90-day window per list request
 * (calendar.errors.ts's CALENDAR_RANGE_INVALID); the UI never requests a
 * wider range than this in any view. */
export const MAX_CALENDAR_RANGE_DAYS = 90;
