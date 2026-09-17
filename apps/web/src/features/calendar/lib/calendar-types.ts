/** Mirrors `CalendarEntryResponse` (apps/api/src/calendar/calendar.contracts.ts).
 * Hand-rolled for now - CAL-05 replaces this with types aliased from the
 * generated OpenAPI schema once the UI is wired to the real API, matching
 * how every other feature in this repo made that same transition. */
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

export interface CalendarEntry {
  id: string;
  title: string;
  description: string | null;
  type: CalendarEntryType;
  /** ISO 8601 UTC. */
  startAt: string;
  /** ISO 8601 UTC, or null for a point-in-time entry. */
  endAt: string | null;
  eventId: string | null;
  taskId: string | null;
  projectId: string | null;
  /** Optional while CAL-04 fixture data remains supported. */
  meetingId?: string | null;
  createdAt: string;
  updatedAt: string;
}

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
