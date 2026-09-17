import type { CalendarEntry, CalendarViewMode } from "./calendar-types";

/** The grid always starts the week on Monday - a business-schedule
 * convention, not a locale detection (locale-driven week starts would make
 * the grid's own day-of-week alignment untestable across environments). */
const WEEK_START_DAY = 1;

export function startOfDay(date: Date): Date {
  const next = new Date(date);
  next.setHours(0, 0, 0, 0);
  return next;
}

export function addDays(date: Date, days: number): Date {
  const next = new Date(date);
  next.setDate(next.getDate() + days);
  return next;
}

export function addMonths(date: Date, months: number): Date {
  const next = new Date(date);
  next.setMonth(next.getMonth() + months);
  return next;
}

export function isSameDay(a: Date, b: Date): boolean {
  return (
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate()
  );
}

export function startOfWeek(date: Date): Date {
  const day = date.getDay();
  const diff = (day - WEEK_START_DAY + 7) % 7;
  return startOfDay(addDays(date, -diff));
}

export function startOfMonth(date: Date): Date {
  return new Date(date.getFullYear(), date.getMonth(), 1);
}

/** Six full weeks (42 days) covering the anchor's month, including the
 * leading and trailing days of adjacent months a month grid conventionally
 * shows. Always six rows so the grid height never shifts between months. */
export function buildMonthGrid(anchor: Date): Date[][] {
  const firstOfMonth = startOfMonth(anchor);
  const gridStart = startOfWeek(firstOfMonth);
  const weeks: Date[][] = [];
  for (let week = 0; week < 6; week += 1) {
    const days: Date[] = [];
    for (let day = 0; day < 7; day += 1) {
      days.push(addDays(gridStart, week * 7 + day));
    }
    weeks.push(days);
  }
  return weeks;
}

export function buildWeekDays(anchor: Date): Date[] {
  const start = startOfWeek(anchor);
  return Array.from({ length: 7 }, (_, index) => addDays(start, index));
}

/** The inclusive/exclusive UTC range the server's 90-day-max list endpoint
 * would be called with for this view (calendar.controller.ts) - month and
 * agenda share the same range, since agenda is a chronological read of the
 * same loaded window, not a separate fetch. */
export function rangeForView(
  view: CalendarViewMode,
  anchor: Date,
): { from: Date; to: Date } {
  if (view === "day") {
    const from = startOfDay(anchor);
    return { from, to: addDays(from, 1) };
  }
  if (view === "week") {
    const from = startOfWeek(anchor);
    return { from, to: addDays(from, 7) };
  }
  const grid = buildMonthGrid(anchor);
  const from = grid[0]![0]!;
  const to = addDays(grid[5]![6]!, 1);
  return { from, to };
}

export function entriesForDay(
  entries: readonly CalendarEntry[],
  day: Date,
): CalendarEntry[] {
  return entries
    .filter((entry) => isSameDay(new Date(entry.startAt), day))
    .sort(
      (a, b) => new Date(a.startAt).getTime() - new Date(b.startAt).getTime(),
    );
}

export function entriesInRange(
  entries: readonly CalendarEntry[],
  from: Date,
  to: Date,
): CalendarEntry[] {
  return entries
    .filter((entry) => {
      const startAt = new Date(entry.startAt);
      return startAt >= from && startAt < to;
    })
    .sort(
      (a, b) => new Date(a.startAt).getTime() - new Date(b.startAt).getTime(),
    );
}

export function resolvedTimeZone(): string {
  return Intl.DateTimeFormat().resolvedOptions().timeZone;
}

export function formatTime(date: Date): string {
  return new Intl.DateTimeFormat(undefined, {
    hour: "numeric",
    minute: "2-digit",
  }).format(date);
}

export function formatDayHeading(date: Date): string {
  return new Intl.DateTimeFormat(undefined, {
    weekday: "short",
    day: "numeric",
  }).format(date);
}

export function formatFullDate(date: Date): string {
  return new Intl.DateTimeFormat(undefined, {
    weekday: "long",
    month: "long",
    day: "numeric",
    year: "numeric",
  }).format(date);
}

export function formatMonthLabel(date: Date): string {
  return new Intl.DateTimeFormat(undefined, {
    month: "long",
    year: "numeric",
  }).format(date);
}

/** The human-readable label for the toolbar's current range, e.g. "Sep 15 -
 * 21, 2026" for a week or "September 2026" for a month. */
export function formatRangeLabel(view: CalendarViewMode, anchor: Date): string {
  if (view === "day") return formatFullDate(anchor);
  if (view === "week") {
    const days = buildWeekDays(anchor);
    const start = days[0]!;
    const end = days[6]!;
    const startLabel = new Intl.DateTimeFormat(undefined, {
      month: "short",
      day: "numeric",
    }).format(start);
    const endLabel = new Intl.DateTimeFormat(undefined, {
      month: "short",
      day: "numeric",
      year: "numeric",
    }).format(end);
    return `${startLabel} – ${endLabel}`;
  }
  return formatMonthLabel(anchor);
}
